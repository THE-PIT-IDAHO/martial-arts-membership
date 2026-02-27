import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  calculateNextPaymentDate,
  calculateBillingPeriodEnd,
  getEffectivePriceCents,
  generateInvoiceNumber,
  applyFamilyDiscount,
} from "@/lib/billing";
import { sendInvoiceCreatedEmail, sendPastDueAlertEmail, sendDunningEmail, sendPromotionEligibilityAlertEmail } from "@/lib/notifications";
import { calculateNextRetryDate, getDunningEmailLevel, shouldSuspendMembership } from "@/lib/dunning";
import { getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";
import { getActiveProcessor, chargeStoredPaymentMethod, getCurrency, type ProcessorType } from "@/lib/payment";

// POST /api/billing/auto-run
// Called automatically from the dashboard on first load of the day.
// Checks if billing has already run today; if not, runs billing + past-due sweep.
export async function POST() {
  try {
    const tz = (await getSetting("timezone")) || "America/Denver";
    const today = getTodayInTimezone(tz); // YYYY-MM-DD in gym's timezone

    // Check if already run today
    const lastRunSetting = await prisma.settings.findUnique({
      where: { key: "billing_last_auto_run" },
    });

    if (lastRunSetting?.value === today) {
      return NextResponse.json({ skipped: true, message: "Already run today" });
    }

    // Check if auto-generate is enabled
    const autoGenSetting = await prisma.settings.findUnique({
      where: { key: "billing_auto_generate" },
    });
    if (autoGenSetting?.value === "false") {
      return NextResponse.json({ skipped: true, message: "Auto-generate disabled" });
    }

    // --- Run billing (same logic as /api/billing/run) ---
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const graceSetting = await prisma.settings.findFirst({
      where: { key: "billing_grace_period_days" },
    });
    const gracePeriodDays = graceSetting ? parseInt(graceSetting.value) || 7 : 7;

    // Check if a payment processor is available for auto-charge
    const activeProcessor = await getActiveProcessor();
    const currency = await getCurrency();

    const dueMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        nextPaymentDate: { lte: now },
        membershipPlan: { autoRenew: true },
      },
      include: {
        membershipPlan: {
          select: { priceCents: true, billingCycle: true, name: true, familyDiscountPercent: true },
        },
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stripeCustomerId: true,
            defaultPaymentMethodId: true,
            paypalPayerId: true,
            squareCustomerId: true,
            relationshipsFrom: { select: { toMemberId: true } },
            relationshipsTo: { select: { fromMemberId: true } },
          },
        },
      },
    });

    let invoicesCreated = 0;
    let invoicesSkipped = 0;

    for (const ms of dueMemberships) {
      try {
        if (!ms.nextPaymentDate) {
          invoicesSkipped++;
          continue;
        }

        const billingPeriodStart = new Date(ms.nextPaymentDate);
        const billingPeriodEnd = calculateBillingPeriodEnd(
          billingPeriodStart,
          ms.membershipPlan.billingCycle
        );

        const dueDate = new Date(billingPeriodStart);
        dueDate.setDate(dueDate.getDate() + gracePeriodDays);

        let amountCents = getEffectivePriceCents(
          ms,
          ms.membershipPlan,
          billingPeriodStart
        );

        // Apply family discount if plan has one and member has family relationships
        let familyDiscountNote = "";
        const familyDiscountPct = ms.membershipPlan.familyDiscountPercent;
        if (familyDiscountPct && familyDiscountPct > 0) {
          const relatedIds = new Set([
            ...ms.member.relationshipsFrom.map(r => r.toMemberId),
            ...ms.member.relationshipsTo.map(r => r.fromMemberId),
          ]);
          const familyMemberCount = relatedIds.size + 1; // include self
          if (familyMemberCount >= 2) {
            const originalAmount = amountCents;
            amountCents = applyFamilyDiscount(amountCents, familyDiscountPct, familyMemberCount);
            familyDiscountNote = `Family discount (${familyDiscountPct}%): -$${((originalAmount - amountCents) / 100).toFixed(2)}`;
          }
        }

        try {
          const invoiceNumber = generateInvoiceNumber();
          await prisma.invoice.create({
            data: {
              invoiceNumber,
              membershipId: ms.id,
              memberId: ms.member.id,
              amountCents,
              billingPeriodStart,
              billingPeriodEnd,
              dueDate,
              notes: familyDiscountNote || null,
              clientId: "default-client",
            },
          });
          invoicesCreated++;

          // Attempt auto-charge if member has a stored payment method
          if (activeProcessor && ms.member.defaultPaymentMethodId) {
            try {
              const chargeResult = await chargeStoredPaymentMethod({
                memberId: ms.member.id,
                amountCents,
                currency,
                description: `Invoice ${invoiceNumber} — ${ms.membershipPlan.name}`,
                invoiceId: invoiceNumber,
              });
              if (chargeResult.success && chargeResult.externalPaymentId) {
                await prisma.invoice.updateMany({
                  where: { invoiceNumber },
                  data: {
                    status: "PAID",
                    paidAt: new Date(),
                    paymentMethod: (chargeResult.processor || activeProcessor).toUpperCase(),
                    externalPaymentId: chargeResult.externalPaymentId,
                    paymentProcessor: chargeResult.processor || activeProcessor,
                    ...(chargeResult.processor === "stripe"
                      ? { stripePaymentIntentId: chargeResult.externalPaymentId }
                      : {}),
                  },
                });
              }
            } catch {
              // Charge failed — invoice stays PENDING, will enter dunning if past due
            }
          }

          sendInvoiceCreatedEmail({
            memberId: ms.member.id,
            memberName: `${ms.member.firstName} ${ms.member.lastName}`,
            invoiceNumber,
            amountCents,
            dueDate,
            planName: ms.membershipPlan.name,
          }).catch(() => {});
        } catch (e: unknown) {
          if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
            invoicesSkipped++;
            continue;
          }
          throw e;
        }

        const nextPayment = calculateNextPaymentDate(
          billingPeriodStart,
          ms.membershipPlan.billingCycle
        );
        await prisma.membership.update({
          where: { id: ms.id },
          data: { nextPaymentDate: nextPayment },
        });
      } catch {
        // continue to next membership
      }
    }

    // --- Run past-due sweep ---
    const pastDueInvoices = await prisma.invoice.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: new Date() },
      },
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    let pastDueCount = 0;
    for (const invoice of pastDueInvoices) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAST_DUE",
          nextRetryDate: calculateNextRetryDate(0), // start dunning cycle
        },
      });
      pastDueCount++;

      sendPastDueAlertEmail({
        memberId: invoice.member.id,
        memberName: `${invoice.member.firstName} ${invoice.member.lastName}`,
        amountCents: invoice.amountCents,
        invoiceNumber: invoice.invoiceNumber || undefined,
        dueDate: invoice.dueDate,
      }).catch(() => {});
    }

    // --- Dunning / Payment Retry ---
    let dunningProcessed = 0;
    let membershipsSuspended = 0;

    const dunningSetting = await prisma.settings.findUnique({
      where: { key: "dunning_enabled" },
    });
    const dunningEnabled = dunningSetting?.value !== "false"; // default enabled

    if (dunningEnabled) {
      const maxRetriesSetting = await prisma.settings.findUnique({
        where: { key: "dunning_max_retries" },
      });
      const maxRetries = maxRetriesSetting ? parseInt(maxRetriesSetting.value) || 4 : 4;

      // Find past-due or failed invoices due for retry
      const dunningInvoices = await prisma.invoice.findMany({
        where: {
          status: { in: ["PAST_DUE", "FAILED"] },
          nextRetryDate: { lte: new Date() },
        },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              stripeCustomerId: true,
              defaultPaymentMethodId: true,
              paypalPayerId: true,
              squareCustomerId: true,
            },
          },
          membership: {
            select: { id: true, status: true },
          },
        },
      });

      for (const inv of dunningInvoices) {
        try {
          // Attempt charge via active processor if member has stored payment method
          if (activeProcessor && inv.member.defaultPaymentMethodId) {
            try {
              const chargeResult = await chargeStoredPaymentMethod({
                memberId: inv.member.id,
                amountCents: inv.amountCents,
                currency,
                description: `Invoice ${inv.invoiceNumber || inv.id} — Dunning retry`,
                invoiceId: inv.id,
              });
              if (chargeResult.success && chargeResult.externalPaymentId) {
                await prisma.invoice.update({
                  where: { id: inv.id },
                  data: {
                    status: "PAID",
                    paidAt: new Date(),
                    paymentMethod: (chargeResult.processor || activeProcessor).toUpperCase(),
                    externalPaymentId: chargeResult.externalPaymentId,
                    paymentProcessor: chargeResult.processor || activeProcessor,
                    ...(chargeResult.processor === "stripe"
                      ? { stripePaymentIntentId: chargeResult.externalPaymentId }
                      : {}),
                    lastRetryDate: new Date(),
                    nextRetryDate: null,
                  },
                });
                dunningProcessed++;
                continue; // skip further dunning for this invoice
              }
            } catch {
              // Charge failed — continue with normal dunning
            }
          }

          const newRetryCount = inv.retryCount + 1;
          const level = getDunningEmailLevel(newRetryCount);

          if (shouldSuspendMembership(newRetryCount, maxRetries)) {
            // Max retries reached — mark invoice FAILED, suspend membership, apply negative balance
            await prisma.invoice.update({
              where: { id: inv.id },
              data: {
                status: "FAILED",
                retryCount: newRetryCount,
                lastRetryDate: new Date(),
                nextRetryDate: null, // stop retrying
              },
            });

            if (inv.membership.status === "ACTIVE") {
              await prisma.membership.update({
                where: { id: inv.membership.id },
                data: { status: "PAUSED", nextPaymentDate: null },
              });
              membershipsSuspended++;
            }

            // Apply negative balance to member account
            await prisma.member.update({
              where: { id: inv.member.id },
              data: { accountCreditCents: { decrement: inv.amountCents } },
            });

            sendDunningEmail({
              memberId: inv.member.id,
              memberName: `${inv.member.firstName} ${inv.member.lastName}`,
              amountCents: inv.amountCents,
              invoiceNumber: inv.invoiceNumber || undefined,
              level: "suspension",
            }).catch(() => {});
          } else {
            // Schedule next retry + send dunning email
            const nextRetryDate = calculateNextRetryDate(newRetryCount);
            await prisma.invoice.update({
              where: { id: inv.id },
              data: {
                retryCount: newRetryCount,
                lastRetryDate: new Date(),
                nextRetryDate,
              },
            });

            sendDunningEmail({
              memberId: inv.member.id,
              memberName: `${inv.member.firstName} ${inv.member.lastName}`,
              amountCents: inv.amountCents,
              invoiceNumber: inv.invoiceNumber || undefined,
              level,
            }).catch(() => {});
          }

          dunningProcessed++;
        } catch {
          // continue
        }
      }
    }

    // --- Process scheduled cancellations ---
    // Memberships where cancellationEffectiveDate has passed but status is still ACTIVE
    let cancellationsProcessed = 0;
    const scheduledCancellations = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        cancellationEffectiveDate: { lte: new Date() },
      },
    });

    for (const ms of scheduledCancellations) {
      try {
        await prisma.membership.update({
          where: { id: ms.id },
          data: { status: "CANCELED", nextPaymentDate: null },
        });
        cancellationsProcessed++;
      } catch {
        // continue
      }
    }

    // --- Expire trial passes ---
    try {
      const expired = await prisma.trialPass.updateMany({
        where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
        data: { status: "EXPIRED" },
      });
      if (expired.count > 0) {
        console.log(`Auto-expired ${expired.count} trial passes`);
      }
    } catch (err) {
      console.error("Trial expiry error:", err);
    }

    // --- Send promotion eligibility alert (fire-and-forget) ---
    try {
      const stylesWithBelts = await prisma.style.findMany({
        where: { beltSystemEnabled: true },
        select: { name: true, beltConfig: true, ranks: { select: { name: true, order: true, classRequirement: true }, orderBy: { order: "asc" } } },
      });
      if (stylesWithBelts.length > 0) {
        const membersWithStyles = await prisma.member.findMany({
          where: { status: "ACTIVE", stylesNotes: { not: null } },
          select: {
            firstName: true, lastName: true, stylesNotes: true,
            attendances: { select: { attendanceDate: true, checkedInAt: true, source: true, classSession: { select: { classType: true, styleName: true, styleNames: true } } } },
          },
        });
        const eligible: { memberName: string; styleName: string; currentRank: string; nextRank: string }[] = [];
        for (const m of membersWithStyles) {
          let ms: any[];
          try { ms = JSON.parse(m.stylesNotes!); } catch { continue; }
          for (const s of ms) {
            if (s.active === false) continue;
            const sc = stylesWithBelts.find((st) => st.name.toLowerCase() === (s.name || "").toLowerCase());
            if (!sc || sc.ranks.length === 0) continue;
            const ci = sc.ranks.findIndex((r) => r.name === s.rank);
            if (ci < 0 || ci >= sc.ranks.length - 1) continue;
            const nr = sc.ranks[ci + 1];
            const sa = m.attendances.filter((a) => {
              if (s.attendanceResetDate) {
                const ad = a.attendanceDate ? new Date(a.attendanceDate).toISOString().split("T")[0] : a.checkedInAt ? new Date(a.checkedInAt).toISOString().split("T")[0] : null;
                if (ad && ad < s.attendanceResetDate) return false;
              }
              if (a.source === "IMPORTED") return true;
              if (!a.classSession) return false;
              if (a.classSession.styleNames) { try { const n: string[] = JSON.parse(a.classSession.styleNames); return n.some((x) => x.toLowerCase() === s.name.toLowerCase()); } catch {} }
              return a.classSession.styleName?.toLowerCase() === s.name.toLowerCase();
            });
            let reqs: { count: number; required: number }[] = [];
            if (sc.beltConfig) {
              try {
                const bc = typeof sc.beltConfig === "string" ? JSON.parse(sc.beltConfig) : sc.beltConfig;
                const brk = bc.ranks?.find((r: any) => r.name === nr.name);
                if (brk?.classRequirements?.length) {
                  reqs = brk.classRequirements.filter((r: any) => r.label && r.minCount > 0).map((r: any) => ({
                    count: sa.filter((a) => a.classSession?.classType?.toLowerCase() === r.label.toLowerCase()).length,
                    required: r.minCount,
                  }));
                }
              } catch {}
            }
            if (reqs.length === 0 && nr.classRequirement) {
              reqs = [{ count: sa.length, required: nr.classRequirement }];
            }
            if (reqs.length === 0 || reqs.every((r) => r.count >= r.required)) {
              eligible.push({ memberName: `${m.firstName} ${m.lastName}`, styleName: s.name, currentRank: sc.ranks[ci].name, nextRank: nr.name });
            }
          }
        }

        // Deduplication: only email NEWLY eligible members
        if (eligible.length > 0) {
          const lastNotifiedSetting = await prisma.settings.findUnique({
            where: { key: "promotion_eligible_last_notified" },
          });
          const previousKeys = new Set<string>();
          if (lastNotifiedSetting?.value) {
            try {
              const arr = JSON.parse(lastNotifiedSetting.value);
              if (Array.isArray(arr)) arr.forEach((k: string) => previousKeys.add(k));
            } catch { /* ignore */ }
          }

          const makeKey = (e: { memberName: string; styleName: string; nextRank: string }) =>
            `${e.memberName}|${e.styleName}|${e.nextRank}`;

          const currentKeys = eligible.map(makeKey);
          const newlyEligible = eligible.filter((e) => !previousKeys.has(makeKey(e)));

          if (newlyEligible.length > 0) {
            sendPromotionEligibilityAlertEmail({ eligible: newlyEligible }).catch(() => {});
          }

          await prisma.settings.upsert({
            where: { key: "promotion_eligible_last_notified" },
            update: { value: JSON.stringify(currentKeys) },
            create: { key: "promotion_eligible_last_notified", value: JSON.stringify(currentKeys), clientId: "default-client" },
          });
        }
      }
    } catch (err) {
      console.error("Promotion eligibility email error:", err);
    }

    // Mark as run today
    await prisma.settings.upsert({
      where: { key: "billing_last_auto_run" },
      update: { value: today },
      create: { key: "billing_last_auto_run", value: today, clientId: "default-client" },
    });

    logAudit({
      entityType: "Billing",
      entityId: today,
      action: "BILLING_RUN",
      summary: `Auto billing run: ${invoicesCreated} invoices created, ${pastDueCount} past-due, ${dunningProcessed} dunning, ${membershipsSuspended} suspended, ${cancellationsProcessed} cancellations`,
    }).catch(() => {});

    return NextResponse.json({
      skipped: false,
      invoicesCreated,
      invoicesSkipped,
      pastDueMarked: pastDueCount,
      dunningProcessed,
      membershipsSuspended,
      cancellationsProcessed,
    });
  } catch (error) {
    console.error("Error in auto billing run:", error);
    return new NextResponse("Failed to run auto billing", { status: 500 });
  }
}
