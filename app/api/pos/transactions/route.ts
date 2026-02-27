import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { parseLocalDate } from "@/lib/dates";
import { calculateNextPaymentDate } from "@/lib/billing";
import { getAccountPaymentAmount } from "@/lib/payment-utils";

type RankPdf = {
  name: string;
  url: string;
};

type BeltRank = {
  name: string;
  order: number;
  pdfDocuments?: RankPdf[];
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
};

// Helper function to get first rank from beltConfig
function getFirstRankFromBeltConfig(beltConfig: string | null): string | null {
  if (!beltConfig) return null;
  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (config.ranks && Array.isArray(config.ranks) && config.ranks.length > 0) {
      // Sort by order and return the first (lowest order) rank
      const sortedRanks = [...config.ranks].sort((a: BeltRank, b: BeltRank) => a.order - b.order);
      return sortedRanks[0].name;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// Helper function to add rank PDFs to member's styleDocuments
function addRankPdfsToDocuments(
  beltConfig: string | null,
  targetRankName: string,
  currentDocs: StyleDocument[]
): { docs: StyleDocument[]; hasChanges: boolean } {
  if (!beltConfig) return { docs: currentDocs, hasChanges: false };

  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (!config.ranks || !Array.isArray(config.ranks)) {
      return { docs: currentDocs, hasChanges: false };
    }

    // Find the target rank
    const targetRank = config.ranks.find((r: BeltRank) => r.name === targetRankName);
    if (!targetRank) return { docs: currentDocs, hasChanges: false };

    // Get all ranks up to and including the target rank (by order number)
    const ranksToInclude = config.ranks.filter((r: BeltRank) => r.order <= targetRank.order);

    let hasChanges = false;
    const updatedDocs = [...currentDocs];

    // Add PDFs from all these ranks
    for (const rank of ranksToInclude) {
      if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

      for (const rankPdf of rank.pdfDocuments) {
        // Check if this PDF already exists (by name)
        const exists = updatedDocs.some((doc) => doc.name === rankPdf.name);
        if (!exists) {
          const newDoc: StyleDocument = {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: rankPdf.name,
            url: rankPdf.url,
            uploadedAt: new Date().toISOString(),
          };
          updatedDocs.push(newDoc);
          hasChanges = true;
        }
      }
    }

    return { docs: updatedDocs, hasChanges };
  } catch {
    return { docs: currentDocs, hasChanges: false };
  }
}

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
    const { memberId, memberName, lineItems, paymentMethod, notes, discountCents = 0, taxCents = 0 } = body;

    if (!lineItems || lineItems.length === 0) {
      return new NextResponse("At least one line item is required", { status: 400 });
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
    const totalCents = subtotalCents - discountCents + taxCents;

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
        discountCents,
        totalCents,
        paymentMethod: paymentMethod || "CASH",
        notes: notes || null,
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

    // Update inventory for product items (variant-level + base quantity)
    for (const item of lineItems) {
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

    // Create Membership records for membership sales
    if (memberId) {
      for (const item of lineItems) {
        if (item.type === "membership" && item.membershipPlanId) {
          // Get the membership plan to compare prices, get allowed styles, and billing cycle
          const plan = await prisma.membershipPlan.findUnique({
            where: { id: item.membershipPlanId },
            select: { priceCents: true, setupFeeCents: true, allowedStyles: true, billingCycle: true },
          });

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

          // Create a new Membership record linking member to the plan
          await prisma.membership.create({
            data: {
              memberId: memberId,
              membershipPlanId: item.membershipPlanId,
              startDate,
              endDate,
              status: "ACTIVE",
              customPriceCents: customPrice,
              firstMonthDiscountOnly: item.firstMonthDiscountOnly || false,
              lastPaymentDate: startDate,
              nextPaymentDate,
            },
          });

          // Update member status to ACTIVE when purchasing a membership
          // Keep other statuses like COACH, PARENT but replace INACTIVE with ACTIVE
          const member = await prisma.member.findUnique({
            where: { id: memberId },
            select: { id: true, status: true, stylesNotes: true, styleDocuments: true, primaryStyle: true, rank: true },
          });

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
          }

          // Auto-assign included styles, reactivate existing inactive styles, and add rank PDFs
          if (member) {
            if (plan?.allowedStyles) {
              const includedStyleIds: string[] = JSON.parse(plan.allowedStyles);

              if (includedStyleIds.length > 0) {
                // Get the styles with their beltConfig (contains ranks and PDFs)
                const stylesWithConfig = await prisma.style.findMany({
                  where: { id: { in: includedStyleIds } },
                  select: { id: true, name: true, beltConfig: true },
                });

                const planStyleNames = stylesWithConfig.map(s => s.name.toLowerCase());

                // Parse existing styles
                const existingStyles: Array<{
                  name: string;
                  rank?: string;
                  beltSize?: string;
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
    if (memberId) {
      for (const item of lineItems) {
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

    // Handle gift certificate items - create gift certificates
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
          },
        });
      }
    }

    // Handle gift certificate redemption
    const { redeemedGiftCode, redeemedGiftAmountCents } = body;
    if (redeemedGiftCode && redeemedGiftAmountCents > 0) {
      const giftCert = await prisma.giftCertificate.findFirst({
        where: { code: redeemedGiftCode },
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

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return new NextResponse("Failed to create transaction", { status: 500 });
  }
}
