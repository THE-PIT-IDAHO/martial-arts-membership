import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { parseLocalDate } from "@/lib/dates";
import { calculateNextPaymentDate } from "@/lib/billing";
import { getAccountPaymentAmount } from "@/lib/payment-utils";
import { markDiscountsUsed } from "@/lib/member-discounts";

import { getFirstRankFromBeltConfig, addRankPdfsToDocuments, type StyleDocument } from "@/lib/belt-config";

// Calculate next payment date based on billing cycle
// calculateNextPaymentDate imported from @/lib/billing

// GET /api/pos/transactions
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");

    const transactions = await prisma.pOSTransaction.findMany({
      where: { clientId, ...(memberId ? { memberId } : {}) },
      include: {
        POSLineItem: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return new NextResponse("Failed to load transactions", { status: 500 });
  }
}

// POST /api/pos/transactions
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberId, memberName, lineItems, paymentMethod, notes, discountCents = 0, taxCents = 0, paymentIntentId, paymentProcessor } = body;

    if (!lineItems || lineItems.length === 0) {
      return new NextResponse("At least one line item is required", { status: 400 });
    }

    // Verify memberId + every itemId / membershipPlanId / servicePackageId
    // in the cart belongs to this tenant. Without these checks, a
    // hand-crafted POST could decrement another gym's inventory,
    // attach a foreign membership plan to our member, mint a
    // service credit against a foreign package, or redeem a gift
    // certificate at the wrong tenant.
    if (memberId) {
      const mem = await prisma.member.findUnique({
        where: { id: memberId },
        select: { clientId: true },
      });
      if (!mem || mem.clientId !== clientId) {
        return new NextResponse("Member not found", { status: 404 });
      }
    }
    for (const item of lineItems) {
      if (item.type === "product" && item.itemId) {
        const posItem = await prisma.pOSItem.findUnique({
          where: { id: item.itemId },
          select: { clientId: true },
        });
        if (!posItem || posItem.clientId !== clientId) {
          return new NextResponse("POS item not found", { status: 400 });
        }
      }
      if (item.type === "membership" && item.membershipPlanId) {
        const plan = await prisma.membershipPlan.findUnique({
          where: { id: item.membershipPlanId },
          select: { clientId: true },
        });
        if (!plan || plan.clientId !== clientId) {
          return new NextResponse("Membership plan not found", { status: 400 });
        }
      }
      if (item.type === "service" && item.servicePackageId) {
        const pkg = await prisma.servicePackage.findUnique({
          where: { id: item.servicePackageId },
          select: { clientId: true },
        });
        if (!pkg || pkg.clientId !== clientId) {
          return new NextResponse("Service package not found", { status: 400 });
        }
      }
      // Bundle lines carry a bundleId + a snapshot of the products
      // inside (bundleContents). Confirm the bundle belongs to this
      // tenant and each contained productId does too, before we let
      // inventory decrements run against them below.
      if (item.type === "bundle") {
        if (item.bundleId) {
          const bundle = await prisma.bundle.findUnique({
            where: { id: item.bundleId },
            select: { clientId: true },
          });
          if (!bundle || bundle.clientId !== clientId) {
            return new NextResponse("Bundle not found", { status: 400 });
          }
        }
        const contents = Array.isArray(item.bundleContents) ? item.bundleContents : [];
        for (const c of contents) {
          if (!c?.productId) continue;
          const posItem = await prisma.pOSItem.findUnique({
            where: { id: c.productId },
            select: { clientId: true },
          });
          if (!posItem || posItem.clientId !== clientId) {
            return new NextResponse("Bundle contains a product not available at this gym", { status: 400 });
          }
        }
      }
    }

    // Validate split payment totals if JSON array
    if (paymentMethod && paymentMethod.startsWith("[")) {
      try {
        const splits = JSON.parse(paymentMethod);
        const splitTotal = splits.reduce((sum: number, s: { amountCents?: number }) => sum + (s.amountCents || 0), 0);
        const expectedTotal = lineItems.reduce((sum: number, item: { unitPriceCents: number; quantity: number }) => sum + item.unitPriceCents * item.quantity, 0) - (discountCents || 0) + (taxCents || 0);
        if (splitTotal !== expectedTotal) {
          return new NextResponse(`Split payment total (${splitTotal}) does not match transaction total (${expectedTotal})`, { status: 400 });
        }
      } catch {
        return new NextResponse("Invalid payment method format", { status: 400 });
      }
    }

    // Calculate totals
    const subtotalCents = lineItems.reduce(
      (sum: number, item: any) => sum + item.unitPriceCents * item.quantity,
      0
    );

    // Stack per-member discounts on top of the client-supplied
    // discountCents (which now carries manual per-item + per-section
    // discounts only -- the client no longer folds member-profile
    // discounts into that number, so this is the sole source of truth
    // for member discounts).
    //
    // Rules:
    //   - MEMBERSHIP-scope rows apply to the membership subtotal
    //     (first payment at signup; recurring cycles are handled by
    //     the billing job).
    //   - POS-scope rows apply to the non-membership subtotal.
    //   - ALL-scope rows apply once to the whole cart -- routed to
    //     whichever bucket has room (prefer non-membership since a
    //     "10% off everything" discount is usually meant for the
    //     product/service line). Prevents flat-cents ALL discounts
    //     being counted twice when both buckets have volume.
    //
    // The client (app/pos/page.tsx) mirrors this exact logic so the
    // preview totals shown to the cashier match what actually gets
    // charged here.
    type AppliedRow = {
      id: string;
      label: string;
      percentOff: number;
      flatCents: number;
      oneTime: boolean;
    };
    function computeFromRows(rows: AppliedRow[], base: number): number {
      if (rows.length === 0 || base <= 0) return 0;
      let percent = 0;
      let flat = 0;
      for (const r of rows) {
        percent += r.percentOff || 0;
        flat += r.flatCents || 0;
      }
      const fromPct = Math.round((base * Math.min(percent, 100)) / 100);
      return Math.min(base, fromPct + flat);
    }

    let memberDiscountCents = 0;
    let appliedMemberDiscounts: AppliedRow[] = [];
    if (memberId) {
      const rawRows = await prisma.memberDiscount.findMany({
        where: {
          memberId,
          active: true,
          appliesTo: { in: ["POS", "MEMBERSHIP", "ALL"] },
        },
        select: {
          id: true,
          label: true,
          appliesTo: true,
          percentOff: true,
          flatCents: true,
          oneTime: true,
        },
      });
      const norm = (r: (typeof rawRows)[number]): AppliedRow => ({
        id: r.id,
        label: r.label || `${r.appliesTo} discount`,
        percentOff: r.percentOff ?? 0,
        flatCents: r.flatCents ?? 0,
        oneTime: r.oneTime,
      });
      const posRows = rawRows.filter((r) => r.appliesTo === "POS").map(norm);
      const membershipRows = rawRows.filter((r) => r.appliesTo === "MEMBERSHIP").map(norm);
      const allRows = rawRows.filter((r) => r.appliesTo === "ALL").map(norm);

      const membershipSubtotal = lineItems
        .filter((i: any) => i.type === "membership")
        .reduce((sum: number, i: any) => sum + i.unitPriceCents * i.quantity, 0);
      const nonMembershipSubtotal = subtotalCents - membershipSubtotal;

      const posBucket = nonMembershipSubtotal > 0 ? [...posRows, ...allRows] : posRows;
      const membershipBucket =
        nonMembershipSubtotal > 0 ? membershipRows : [...membershipRows, ...allRows];

      const posDiscount = computeFromRows(posBucket, nonMembershipSubtotal);
      const membershipDiscount = computeFromRows(membershipBucket, membershipSubtotal);
      memberDiscountCents = posDiscount + membershipDiscount;
      // markDiscountsUsed only cares about one-time rows; safe to
      // include the same ALL row twice because both bucket lists
      // reference it by the same id (updateMany dedupes).
      appliedMemberDiscounts = [...posBucket, ...membershipBucket];
    }
    const finalDiscountCents = discountCents + memberDiscountCents;
    const totalCents = Math.max(0, subtotalCents - finalDiscountCents + taxCents);

    // Generate transaction number
    const transactionNumber = `TXN-${Date.now()}`;

    // Create transaction with line items
    const transaction = await prisma.pOSTransaction.create({
      data: {
        id: crypto.randomUUID(),
        transactionNumber,
        clientId,
        memberId: memberId || null,
        memberName: memberName || null,
        subtotalCents,
        taxCents,
        discountCents: finalDiscountCents,
        totalCents,
        paymentMethod: paymentMethod || "CASH",
        notes: notes || null,
        paymentIntentId: paymentIntentId || null,
        paymentProcessor: paymentProcessor || null,
        updatedAt: new Date(),
        POSLineItem: {
          create: lineItems.map((item: any) => ({
            id: crypto.randomUUID(),
            itemId: item.type === "product" ? item.itemId : null,
            itemName: item.itemName,
            itemSku: item.itemSku || null,
            type: item.type || "product",
            membershipPlanId: item.membershipPlanId || null,
            servicePackageId: item.servicePackageId || null,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            subtotalCents: item.unitPriceCents * item.quantity,
          })),
        },
      },
      include: {
        POSLineItem: true,
      },
    });

    // Expand bundles for downstream side effects. Each bundle carries
    // a bundleContents[] snapshot the client built at add-to-cart
    // time; each entry becomes a virtual line item so the inventory /
    // membership / service loops below process bundle contents with
    // the same code paths as bare line items. Contained items ring
    // in at $0 (the bundle line already carries the money), which
    // keeps firstPaymentCents accurate for bundle-included
    // memberships -- the bundle absorbed the payment, not the
    // membership itself.
    type SideEffectItem = {
      type: string;
      itemId?: string | null;
      membershipPlanId?: string | null;
      servicePackageId?: string | null;
      selectedSize?: string | null;
      selectedColor?: string | null;
      unitPriceCents: number;
      customPriceCents?: number;
      quantity: number;
      firstMonthDiscountOnly?: boolean;
      membershipStartDate?: string;
      membershipEndDate?: string;
      itemName?: string;
      recipientName?: string;
    };
    const bundleVirtualItems: SideEffectItem[] = (lineItems as SideEffectItem[])
      .filter((li) => li.type === "bundle" && Array.isArray((li as unknown as { bundleContents?: unknown[] }).bundleContents))
      .flatMap((bundle) => {
        const contents = (bundle as unknown as { bundleContents: Array<{
          kind?: string;
          productId?: string;
          membershipPlanId?: string;
          servicePackageId?: string;
          quantity?: number;
          selectedSize?: string | null;
          selectedColor?: string | null;
          nameCached?: string;
        }> }).bundleContents;
        const bundleQty = bundle.quantity || 1;
        return contents.map((c) => {
          const contentQty = Math.max(1, Number(c.quantity) || 1);
          return {
            type: c.kind || "product",
            itemId: c.kind === "product" ? c.productId || null : null,
            membershipPlanId: c.kind === "membership" ? c.membershipPlanId || null : null,
            servicePackageId: c.kind === "service" ? c.servicePackageId || null : null,
            selectedSize: c.selectedSize || null,
            selectedColor: c.selectedColor || null,
            unitPriceCents: 0,
            customPriceCents: 0,
            quantity: contentQty * bundleQty,
            firstMonthDiscountOnly: false,
            itemName: c.nameCached || "",
          } satisfies SideEffectItem;
        });
      });
    const sideEffectItems: SideEffectItem[] = [
      ...(lineItems as SideEffectItem[]).filter((li) => li.type !== "bundle"),
      ...bundleVirtualItems,
    ];

    // Update inventory for product items (variant-level + base quantity).
    // Bundle-contained products are already in `sideEffectItems` above.
    for (const item of sideEffectItems) {
      if (item.type === "product" && item.itemId) {
        // Decrement variant stock if size/color are specified
        if (item.selectedSize || item.selectedColor) {
          const variant = await prisma.pOSItemVariant.findFirst({
            where: {
              itemId: item.itemId,
              size: item.selectedSize || null,
              color: item.selectedColor || null,
            },
          });
          if (variant) {
            await prisma.pOSItemVariant.update({
              where: { id: variant.id },
              data: { quantity: { decrement: item.quantity } },
            });
          }
        }

        // Always decrement base item quantity
        await prisma.pOSItem.update({
          where: { id: item.itemId },
          data: {
            quantity: {
              decrement: item.quantity,
            },
            updatedAt: new Date(),
          },
        });
      }
    }

    // Create Membership records for membership sales (direct + bundle-
    // contained). A bundle-contained membership arrives here as a
    // virtual line item with unitPriceCents=0 (bundle absorbed the
    // payment) -- firstPaymentCents on the Membership record ends up
    // as 0, and customPriceCents stays null (plan default), so
    // recurring cycles keep charging the plan's normal price.
    if (memberId) {
      for (const item of sideEffectItems) {
        if (item.type === "membership" && item.membershipPlanId) {
          // Get the membership plan -- scoped to this tenant so a
          // hand-crafted POST can't smuggle another gym's planId
          // onto our member (which auto-billing would then charge
          // at that plan's price next cycle).
          const plan = await prisma.membershipPlan.findFirst({
            where: { id: item.membershipPlanId, clientId },
            select: { priceCents: true, setupFeeCents: true, allowedStyles: true, billingCycle: true },
          });
          if (!plan) continue;

          // Calculate if there's a custom price (different from plan price)
          const planTotalPrice = (plan?.priceCents || 0) + (plan?.setupFeeCents || 0);
          const customPrice = item.customPriceCents !== planTotalPrice ? item.customPriceCents : null;

          // Use custom start date if provided, otherwise use today
          const startDate = item.membershipStartDate
            ? parseLocalDate(item.membershipStartDate)
            : new Date();

          // Use end date if provided
          const endDate = item.membershipEndDate
            ? parseLocalDate(item.membershipEndDate)
            : null;

          // Calculate next payment date based on billing cycle (only for recurring memberships)
          const nextPaymentDate = !endDate && plan?.billingCycle
            ? calculateNextPaymentDate(startDate, plan.billingCycle)
            : null;

          // Create a new Membership record linking member to the plan.
          // firstPaymentCents is what the member actually paid at signup
          // (item.unitPriceCents = Price - first-payment discount). Stored
          // separately from customPriceCents (the recurring amount) so the
          // profile can show the correct first-cycle figure even when a
          // 100%-off-first-month discount was applied.
          await prisma.membership.create({
            data: {
              memberId: memberId,
              membershipPlanId: item.membershipPlanId,
              startDate,
              endDate,
              status: "ACTIVE",
              customPriceCents: customPrice,
              firstPaymentCents: item.unitPriceCents,
              firstMonthDiscountOnly: item.firstMonthDiscountOnly || false,
              lastPaymentDate: startDate,
              nextPaymentDate,
            },
          });

          // Update member status to ACTIVE when purchasing a membership
          // Keep other statuses like COACH, PARENT but replace INACTIVE with ACTIVE
          const member = await prisma.member.findUnique({
            where: { id: memberId },
            select: { id: true, firstName: true, lastName: true, status: true, stylesNotes: true, styleDocuments: true, primaryStyle: true, rank: true },
          });

          // Snapshot BEFORE the status update so we can decide if this
          // is a first-time conversion (PROSPECT -> ACTIVE) that
          // deserves a welcome email. Existing ACTIVE members buying
          // another membership don't re-trigger a welcome.
          const wasProspect = member?.status
            ? member.status.split(",").map((s: string) => s.trim()).includes("PROSPECT")
            : false;

          if (member) {
            // Parse existing statuses (can be comma-separated like "INACTIVE,COACH")
            const currentStatuses = member.status
              ? member.status.split(",").map((s: string) => s.trim())
              : [];

            // Remove INACTIVE and PROSPECT, add ACTIVE if not present
            const filteredStatuses = currentStatuses.filter(
              (s: string) => !["INACTIVE", "PROSPECT"].includes(s)
            );

            if (!filteredStatuses.includes("ACTIVE")) {
              filteredStatuses.unshift("ACTIVE"); // Add ACTIVE at the beginning
            }

            const newStatus = filteredStatuses.join(",");

            await prisma.member.update({
              where: { id: memberId },
              data: { status: newStatus },
            });

            // First membership purchase for a prospect -> welcome
            // email fires alongside the receipt/contract "Purchase
            // Complete" email that the checkout flow sends. Awaited
            // so Vercel serverless doesn't kill the promise before
            // Resend gets the request.
            if (wasProspect) {
              try {
                const { sendWelcomeEmail } = await import("@/lib/notifications");
                await sendWelcomeEmail({
                  memberId: member.id,
                  memberName: `${member.firstName} ${member.lastName}`,
                });
              } catch (err) {
                console.error("[pos/transactions] welcome email failed:", err);
              }
            }
          }

          // Auto-assign included styles, reactivate existing inactive styles, and add rank PDFs
          if (member) {
            if (plan?.allowedStyles) {
              const includedStyleIds: string[] = JSON.parse(plan.allowedStyles);

              if (includedStyleIds.length > 0) {
                // Get the styles with their beltConfig, scoped to
                // this tenant so a malformed allowedStyles list
                // can't inject a foreign Style row.
                const stylesWithConfig = await prisma.style.findMany({
                  where: { id: { in: includedStyleIds }, clientId },
                  select: { id: true, name: true, beltConfig: true },
                });

                const planStyleNames = stylesWithConfig.map(s => s.name.toLowerCase());

                // Parse existing styles
                const existingStyles: Array<{
                  name: string;
                  rank?: string;
                  beltSize?: string;
                  beltText?: string;
                  coach?: string;
                  uniformSize?: string;
                  startDate?: string;
                  lastPromotionDate?: string;
                  attendanceResetDate?: string;
                  active?: boolean;
                }> = member.stylesNotes ? JSON.parse(member.stylesNotes) : [];

                // Parse existing style documents
                let currentDocs: StyleDocument[] = [];
                if (member.styleDocuments) {
                  try {
                    currentDocs = JSON.parse(member.styleDocuments);
                  } catch {
                    currentDocs = [];
                  }
                }

                // Get existing style names for comparison
                const existingStyleNames = existingStyles.map((s) => s.name.toLowerCase());

                // Add new styles that don't already exist
                const membershipStartDateStr = item.membershipStartDate
                  ? new Date(item.membershipStartDate).toISOString().split("T")[0]
                  : new Date().toISOString().split("T")[0];

                const newStyles: Array<{
                  name: string;
                  rank?: string;
                  startDate?: string;
                  lastPromotionDate?: string;
                  attendanceResetDate?: string;
                  active: boolean;
                }> = [];

                let updatedDocs = [...currentDocs];
                let docsChanged = false;

                for (const style of stylesWithConfig) {
                  if (!existingStyleNames.includes(style.name.toLowerCase())) {
                    // Get the first rank from beltConfig
                    const firstRank = getFirstRankFromBeltConfig(style.beltConfig);

                    newStyles.push({
                      name: style.name,
                      rank: firstRank || undefined,
                      startDate: membershipStartDateStr,
                      lastPromotionDate: membershipStartDateStr,
                      attendanceResetDate: membershipStartDateStr,
                      active: true,
                    });

                    // Add rank PDFs for this style
                    if (firstRank && style.beltConfig) {
                      const result = addRankPdfsToDocuments(style.beltConfig, firstRank, updatedDocs);
                      if (result.hasChanges) {
                        updatedDocs = result.docs;
                        docsChanged = true;
                      }
                    }
                  }
                }

                // Reactivate existing styles that are linked to this plan
                let stylesModified = false;
                const reactivatedStyles = existingStyles.map(style => {
                  const styleLower = style.name.toLowerCase();
                  if (planStyleNames.includes(styleLower) && style.active === false) {
                    stylesModified = true;

                    // Also add rank PDFs for reactivated styles
                    const styleConfig = stylesWithConfig.find(s => s.name.toLowerCase() === styleLower);
                    if (style.rank && styleConfig?.beltConfig) {
                      const result = addRankPdfsToDocuments(styleConfig.beltConfig, style.rank, updatedDocs);
                      if (result.hasChanges) {
                        updatedDocs = result.docs;
                        docsChanged = true;
                      }
                    }

                    return { ...style, active: true };
                  }
                  return style;
                });

                if (newStyles.length > 0 || stylesModified || docsChanged) {
                  const updatedStyles = [...reactivatedStyles, ...newStyles];

                  // Build update data
                  const updateData: {
                    stylesNotes: string;
                    primaryStyle?: string;
                    rank?: string;
                    styleDocuments?: string;
                  } = {
                    stylesNotes: JSON.stringify(updatedStyles),
                  };

                  // Set primary style and rank if not already set
                  if (!member.primaryStyle && newStyles.length > 0) {
                    updateData.primaryStyle = newStyles[0].name;
                    if (newStyles[0].rank) {
                      updateData.rank = newStyles[0].rank;
                    }
                  }

                  // Update style documents if changed
                  if (docsChanged) {
                    updateData.styleDocuments = JSON.stringify(updatedDocs);
                  }

                  await prisma.member.update({
                    where: { id: memberId },
                    data: updateData,
                  });
                }
              }
            }
            // Note: When allowedStyles is null, the plan covers ALL styles for eligibility purposes,
            // but we should NOT auto-activate any styles. Styles should only be activated when
            // the plan explicitly includes specific styles (allowedStyles has style IDs).
          }
        }
      }
    }

    // Handle account credit items
    if (memberId) {
      for (const item of lineItems) {
        if (item.type === "credit") {
          await prisma.member.update({
            where: { id: memberId },
            data: {
              accountCreditCents: {
                increment: item.unitPriceCents * item.quantity,
              },
            },
          });
        }
      }
    }

    // Handle appointment items - create MemberServiceCredit records
    // (direct sales + bundle-contained services).
    if (memberId) {
      for (const item of sideEffectItems) {
        if (item.type === "service" && item.servicePackageId) {
          const pkg = await prisma.servicePackage.findUnique({
            where: { id: item.servicePackageId },
          });
          if (pkg) {
            const expiresAt = pkg.expirationDays
              ? new Date(Date.now() + pkg.expirationDays * 24 * 60 * 60 * 1000)
              : null;

            for (let q = 0; q < item.quantity; q++) {
              await prisma.memberServiceCredit.create({
                data: {
                  memberId,
                  servicePackageId: pkg.id,
                  creditsTotal: pkg.sessionsIncluded,
                  creditsRemaining: pkg.sessionsIncluded,
                  expiresAt,
                  transactionId: transaction.id,
                  status: "ACTIVE",
                },
              });
            }
          }
        }
      }
    }

    // Handle gift certificate items - create gift certificates,
    // stamped with THIS tenant's clientId so redemption stays scoped.
    for (const item of lineItems) {
      if (item.type === "gift") {
        const code = `GC-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;
        await prisma.giftCertificate.create({
          data: {
            code,
            amountCents: item.unitPriceCents * item.quantity,
            balanceCents: item.unitPriceCents * item.quantity,
            purchasedBy: memberName || null,
            recipientName: item.recipientName || null,
            transactionId: transaction.id,
            clientId,
          },
        });
      }
    }

    // Handle gift certificate redemption -- scoped to this tenant so
    // one gym's gift code can't be redeemed at another.
    const { redeemedGiftCode, redeemedGiftAmountCents } = body;
    if (redeemedGiftCode && redeemedGiftAmountCents > 0) {
      const giftCert = await prisma.giftCertificate.findFirst({
        where: { code: redeemedGiftCode, clientId },
      });
      if (giftCert && giftCert.status === "ACTIVE") {
        const newBalance = giftCert.balanceCents - redeemedGiftAmountCents;
        await prisma.giftCertificate.update({
          where: { id: giftCert.id },
          data: {
            balanceCents: Math.max(0, newBalance),
            status: newBalance <= 0 ? "REDEEMED" : "ACTIVE",
          },
        });
      }
    }

    // Handle ACCOUNT payment — deduct from member's accountCreditCents (can go negative)
    if (memberId && paymentMethod) {
      const accountAmount = getAccountPaymentAmount(paymentMethod, totalCents);
      if (accountAmount > 0) {
        await prisma.member.update({
          where: { id: memberId },
          data: {
            accountCreditCents: { decrement: accountAmount },
          },
        });
      }
    }

    // Burn one-time member discounts now that the charge is committed.
    if (appliedMemberDiscounts.length > 0) {
      await markDiscountsUsed(appliedMemberDiscounts);
    }

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return new NextResponse("Failed to create transaction", { status: 500 });
  }
}
