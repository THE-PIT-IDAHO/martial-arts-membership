import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  calculateNextPaymentDate,
  calculateBillingPeriodEnd,
  getEffectivePriceCents,
  generateInvoiceNumber,
  applyFamilyDiscount,
  applyAccountCreditToInvoice,
} from "@/lib/billing";
import { sendInvoiceCreatedEmail, sendPastDueAlertEmail, sendDunningEmail, sendPromotionEligibilityAlertEmail } from "@/lib/notifications";
import { calculateNextRetryDate, getDunningEmailLevel, shouldSuspendMembership } from "@/lib/dunning";
import { getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";
import { getActiveProcessor, chargeStoredPaymentMethod, getCurrency, type ProcessorType } from "@/lib/payment";
import { getClientId } from "@/lib/tenant";
import { applyMemberDiscounts, markDiscountsUsed } from "@/lib/member-discounts";
import { syncMemberStyles } from "@/lib/member-styles";
import { isStaging } from "@/lib/env";

// Vercel cron sends a GET request to the path on its schedule. The
// dashboard caller still uses POST. Both delegate to the same handler.
export async function GET(req: Request) {
  return POST(req);
}

type TenantResult = {
  clientId: string;
  skipped?: boolean;
  message?: string;
  invoicesCreated?: number;
  invoicesSkipped?: number;
  pastDueMarked?: number;
  dunningProcessed?: number;
  membershipsSuspended?: number;
  cancellationsProcessed?: number;
  error?: string;
};

// POST /api/billing/auto-run
//
// Two callers:
//   1. Dashboard (browser, admin cookie + x-tenant-slug header): run
//      billing for that single tenant. Used as a daily catch-up when an
//      admin signs in.
//   2. Vercel cron: middleware verifies CRON_SECRET and sets x-cron-mode.
//      We then iterate every Client with autoRenew memberships and run
//      billing for each.
//
// Cron history: before this fix, middleware 401'd every cron call (no
// admin cookie) so the route never ran. Recurring memberships have not
// been auto-charged for any gym since the multi-tenant refactor — they
// just sat past-due with stale nextPaymentDate.
export async function POST(req: Request) {
  try {
    const isCronCall = req.headers.get("x-cron-mode") === "true";

    // Hard-stop on staging. The staging DB is a Neon branch of prod,
    // so any auto-billing here would (a) mint duplicate Invoice rows
    // that overwrite prod-copied state, (b) hit real Stripe / PayPal
    // if a live processor key ever leaked into the staging env, and
    // (c) fire notification emails to real customer addresses. Manual
    // "Charge Now" runs from the staging dashboard are still blocked
    // -- deliberate; use prod for real charges. Explicit early-return
    // + JSON so scheduled runs on staging show as no-ops instead of
    // silently churning through prod-copied data.
    if (isStaging()) {
      return NextResponse.json({
        skipped: true,
        reason: "Auto-billing is disabled on the staging deployment.",
        isCronCall,
      });
    }

    let tenantIds: string[];
    if (isCronCall) {
      // Iterate every tenant that has at least one auto-renew membership.
      const candidates = await prisma.client.findMany({
        where: {
          members: {
            some: {
              memberships: {
                some: {
                  status: "ACTIVE",
                  membershipPlan: { autoRenew: true },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      tenantIds = candidates.map((c) => c.id);
    } else {
      // Dashboard caller — middleware already validated the admin session
      // and set x-tenant-slug. Run for that single tenant.
      tenantIds = [await getClientId(req)];
    }

    const results: TenantResult[] = [];
    for (const clientId of tenantIds) {
      try {
        const r = await processBillingForTenant(clientId);
        results.push(r);
      } catch (err) {
        console.error(`Auto-billing failed for tenant ${clientId}:`, err);
        results.push({
          clientId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // For the dashboard caller (single tenant), preserve the old response
    // shape so the front-end doesn't need to change. For the cron we
    // return a summary array.
    if (results.length === 1) {
      const r = results[0];
      if (r.error) {
        return NextResponse.json({ error: r.error }, { status: 500 });
      }
      if (r.skipped) {
        return NextResponse.json({ skipped: true, message: r.message });
      }
      return NextResponse.json({
        skipped: false,
        invoicesCreated: r.invoicesCreated || 0,
        invoicesSkipped: r.invoicesSkipped || 0,
        pastDueMarked: r.pastDueMarked || 0,
        dunningProcessed: r.dunningProcessed || 0,
        membershipsSuspended: r.membershipsSuspended || 0,
        cancellationsProcessed: r.cancellationsProcessed || 0,
      });
    }
    return NextResponse.json({ tenants: results.length, results });
  } catch (error) {
    console.error("Error in auto billing run:", error);
    return new NextResponse("Failed to run auto billing", { status: 500 });
  }
}

/**
 * Idempotent housekeeping the tenant needs on every dashboard load,
 * NOT once per day like invoice generation. Kept outside
 * processBillingForTenant's "Already run today" gate so that:
 *   * a fixed-term membership whose endDate just passed lands on
 *     EXPIRED the next time an admin opens the dashboard, and
 *   * the owning member drops from ACTIVE -> INACTIVE in the same
 *     pass so the Members list Inactive tab picks them up.
 *
 * Both steps are updateMany / conditional-write operations that only
 * touch rows meeting their criteria, so re-running them multiple
 * times a day is a no-op after the first sweep of the day.
 */
async function runMembershipHousekeeping(clientId: string): Promise<void> {
  const now = new Date();

  // Members touched by any part of housekeeping. syncMemberStyles is
  // called once per member at the end so the styles/rank PDFs on
  // stylesNotes match the fresh membership statuses -- the previous
  // pass expired memberships but never told the styles to follow.
  const touchedMemberIds = new Set<string>();

  // 1. Auto-expire fixed-term memberships past endDate.
  //    Recurring memberships have endDate === null and are unaffected.
  try {
    const expiring = await prisma.membership.findMany({
      where: {
        member: { clientId },
        status: "ACTIVE",
        endDate: { not: null, lt: now },
      },
      select: { id: true, memberId: true },
    });
    if (expiring.length > 0) {
      await prisma.membership.updateMany({
        where: { id: { in: expiring.map((m) => m.id) } },
        data: { status: "EXPIRED", nextPaymentDate: null },
      });
      for (const m of expiring) touchedMemberIds.add(m.memberId);
      console.log(`[housekeeping ${clientId}] auto-expired ${expiring.length} membership(s) past endDate`);
    }
  } catch (err) {
    console.error(`[housekeeping ${clientId}] membership expiry error:`, err);
  }

  // 2. Flip members to INACTIVE when nothing keeps them "current".
  //    A member is still "currently active" if any membership either:
  //      * has status ACTIVE, OR
  //      * has status CANCELED but endDate is still in the future
  //        (paid through their cancellation notice period).
  //    Anything else -> INACTIVE. Preserves non-participation tags
  //    (COACH, PARENT, BANNED) and strips participation tags
  //    (ACTIVE, PROSPECT, CANCELED) before prepending INACTIVE.
  try {
    const activeMembers = await prisma.member.findMany({
      where: { clientId, status: { contains: "ACTIVE" } },
      select: {
        id: true,
        status: true,
        memberships: { select: { status: true, endDate: true } },
      },
    });
    let deactivated = 0;
    for (const m of activeMembers) {
      const stillCurrent = m.memberships.some((ms) => {
        if (ms.status === "ACTIVE") return true;
        if (ms.status === "CANCELED" && ms.endDate && ms.endDate > now) return true;
        return false;
      });
      if (stillCurrent) continue;

      const currentTags = (m.status || "").split(",").map((s) => s.trim()).filter(Boolean);
      const preserved = currentTags.filter((s) => !["ACTIVE", "PROSPECT", "CANCELED"].includes(s));
      if (!preserved.includes("INACTIVE")) preserved.unshift("INACTIVE");
      const newStatus = preserved.join(",");
      if (newStatus === m.status) continue;
      try {
        await prisma.member.update({
          where: { id: m.id },
          data: { status: newStatus },
        });
        touchedMemberIds.add(m.id);
        deactivated += 1;
      } catch { /* keep going */ }
    }
    if (deactivated > 0) {
      console.log(`[housekeeping ${clientId}] auto-set ${deactivated} member(s) to INACTIVE (no current membership)`);
    }
  } catch (err) {
    console.error(`[housekeeping ${clientId}] member auto-deactivate error:`, err);
  }

  // 3. Sync per-style entries + rank PDFs so any style tied to a
  //    membership we just expired flips to `active: false` on the
  //    member's stylesNotes. Matches what PATCH /api/memberships/[id]
  //    already does when an admin manually changes a status.
  for (const memberId of touchedMemberIds) {
    try {
      await syncMemberStyles(memberId);
    } catch (err) {
      console.error(`[housekeeping ${clientId}] syncMemberStyles failed for ${memberId}:`, err);
    }
  }

  // 4. Catch-up sweep: sync ANY member whose stylesNotes has a style
  //    marked active but whose memberships have no ACTIVE/CANCELED
  //    row to back that up. This picks up members whose membership
  //    was auto-expired on a previous run of this sweep (before we
  //    called syncMemberStyles here) or whose styles got out of sync
  //    for any other historical reason. Idempotent -- syncMemberStyles
  //    no-ops when there's nothing to change.
  try {
    const stale = await prisma.member.findMany({
      where: {
        clientId,
        stylesNotes: { not: null },
        // Only inspect members with zero ACTIVE / CANCELED memberships;
        // members with an active-side membership are trivially in sync
        // via the PATCH endpoint and don't need a catch-up.
        NOT: {
          memberships: {
            some: { status: { in: ["ACTIVE", "CANCELED"] } },
          },
        },
      },
      select: { id: true, stylesNotes: true },
    });
    let synced = 0;
    for (const m of stale) {
      // Only sync when the notes actually have an active style to
      // demote -- syncMemberStyles is cheap but not free, and most
      // never-enrolled members will have styles they never activated.
      let hasActive = false;
      try {
        const parsed = JSON.parse(m.stylesNotes || "[]");
        if (Array.isArray(parsed)) {
          hasActive = parsed.some((s: { active?: boolean }) => s?.active !== false);
        }
      } catch { /* ignore */ }
      if (!hasActive) continue;
      if (touchedMemberIds.has(m.id)) continue; // already synced above
      try {
        await syncMemberStyles(m.id);
        synced += 1;
      } catch (err) {
        console.error(`[housekeeping ${clientId}] catch-up syncMemberStyles failed for ${m.id}:`, err);
      }
    }
    if (synced > 0) {
      console.log(`[housekeeping ${clientId}] catch-up: synced styles for ${synced} member(s) with no active membership`);
    }
  } catch (err) {
    console.error(`[housekeeping ${clientId}] style catch-up sweep error:`, err);
  }
}

async function processBillingForTenant(clientId: string): Promise<TenantResult> {
  try {
    // Housekeeping runs EVERY call, not once per day. These sweeps
    // touch only rows that need it (updateMany with filters, or a
    // read-then-conditional-write), so it's safe to re-run. Living
    // above the "Already run today" guard means an admin who loaded
    // the dashboard earlier can trigger the flip later the same day
    // by reloading -- the previous placement inside the guard was
    // the reason a member whose membership just lapsed today stayed
    // on the Active tab despite a second dashboard visit.
    await runMembershipHousekeeping(clientId);

    const tz = (await getSetting("timezone", clientId)) || "America/Denver";
    const today = getTodayInTimezone(tz); // YYYY-MM-DD in gym's timezone

    // Check if already run today
    const lastRunSetting = await prisma.settings.findFirst({
      where: { key: "billing_last_auto_run", clientId },
    });

    if (lastRunSetting?.value === today) {
      return { clientId, skipped: true, message: "Already run today" };
    }

    // Check if auto-generate is enabled
    const autoGenSetting = await prisma.settings.findFirst({
      where: { key: "billing_auto_generate", clientId },
    });
    if (autoGenSetting?.value === "false") {
      return { clientId, skipped: true, message: "Auto-generate disabled" };
    }

    // --- Run billing (same logic as /api/billing/run) ---
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const graceSetting = await prisma.settings.findFirst({
      where: { key: "billing_grace_period_days", clientId },
    });
    const gracePeriodDays = graceSetting ? parseInt(graceSetting.value) || 7 : 7;

    // Check if a payment processor is available for auto-charge
    const activeProcessor = await getActiveProcessor(clientId);
    const currency = await getCurrency(clientId);

    const dueMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        nextPaymentDate: { lte: now },
        membershipPlan: { autoRenew: true },
        member: { clientId },
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
        const discountNotes: string[] = [];
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
            discountNotes.push(
              `Family discount (${familyDiscountPct}%): -$${((originalAmount - amountCents) / 100).toFixed(2)}`,
            );
          }
        }

        // Stack any per-member discounts (MEMBERSHIP or ALL scope) on top.
        const { discountCents: memberDiscCents, applied: appliedMemberDiscs } =
          await applyMemberDiscounts(ms.member.id, "MEMBERSHIP", amountCents);
        if (memberDiscCents > 0) {
          amountCents = Math.max(0, amountCents - memberDiscCents);
          discountNotes.push(
            `Member discount: -$${(memberDiscCents / 100).toFixed(2)}`,
          );
        }

        try {
          const invoiceNumber = generateInvoiceNumber();
          // $0 invoices (coach comps, fully-discounted plans) skip the
          // processor entirely. Stripe rejects sub-minimum charges, which
          // would leave the row PENDING → the past-due sweep would then
          // flip it to PAST_DUE and start emailing the member as if they
          // owed money. Mark them PAID at creation so they read as a
          // clean monthly receipt.
          const isZeroDollar = amountCents === 0;
          const createdInvoice = await prisma.invoice.create({
            data: {
              invoiceNumber,
              membershipId: ms.id,
              memberId: ms.member.id,
              amountCents,
              billingPeriodStart,
              billingPeriodEnd,
              dueDate,
              notes: discountNotes.length > 0 ? discountNotes.join(" | ") : null,
              clientId,
              ...(isZeroDollar
                ? {
                    status: "PAID",
                    paidAt: new Date(),
                    paymentMethod: "COMPLIMENTARY",
                  }
                : {}),
            },
            select: { id: true },
          });
          invoicesCreated++;

          // Burn one-time member discounts once the invoice exists.
          if (appliedMemberDiscs.length > 0) {
            await markDiscountsUsed(appliedMemberDiscs);
          }

          // Draw down account credit BEFORE the processor. If the
          // member has enough credit to cover the full amount, the
          // helper marks the invoice PAID and there is nothing to
          // charge. Otherwise we charge only the remainder.
          let remainingCents = amountCents;
          if (!isZeroDollar) {
            const creditResult = await applyAccountCreditToInvoice({
              memberId: ms.member.id,
              invoiceId: createdInvoice.id,
              amountOwed: amountCents,
            });
            remainingCents = creditResult.remainingCents;
          }

          // Attempt auto-charge on the remaining balance only.
          if (!isZeroDollar && remainingCents > 0 && activeProcessor && ms.member.defaultPaymentMethodId) {
            try {
              const chargeResult = await chargeStoredPaymentMethod({
                memberId: ms.member.id,
                amountCents: remainingCents,
                currency,
                description: `Invoice ${invoiceNumber} — ${ms.membershipPlan.name}`,
                invoiceId: invoiceNumber,
              });
              if (chargeResult.success && chargeResult.externalPaymentId) {
                await prisma.invoice.update({
                  where: { id: createdInvoice.id },
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
    // amountCents > 0 — a $0 invoice has nothing to dun on. If one ever
    // ended up PENDING (legacy data from before the $0 short-circuit),
    // upgrade it to PAID/COMPLIMENTARY rather than flipping it PAST_DUE.
    await prisma.invoice.updateMany({
      where: { clientId, status: "PENDING", amountCents: 0 },
      data: { status: "PAID", paidAt: new Date(), paymentMethod: "COMPLIMENTARY" },
    });

    const pastDueInvoices = await prisma.invoice.findMany({
      where: {
        clientId,
        status: "PENDING",
        amountCents: { gt: 0 },
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

    const dunningSetting = await prisma.settings.findFirst({
      where: { key: "dunning_enabled", clientId },
    });
    const dunningEnabled = dunningSetting?.value !== "false"; // default enabled

    if (dunningEnabled) {
      const maxRetriesSetting = await prisma.settings.findFirst({
        where: { key: "dunning_max_retries", clientId },
      });
      const maxRetries = maxRetriesSetting ? parseInt(maxRetriesSetting.value) || 4 : 4;

      // Find past-due or failed invoices due for retry
      const dunningInvoices = await prisma.invoice.findMany({
        where: {
          clientId,
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
          // Draw down remaining account credit BEFORE hitting the
          // processor again. Someone may have added credit since the
          // invoice went past due; if the credit now covers the
          // outstanding balance the helper marks the invoice PAID and
          // we don't need to touch the card at all.
          const outstanding = inv.amountCents - inv.creditAppliedCents;
          let dunningRemaining = outstanding;
          if (outstanding > 0) {
            const creditResult = await applyAccountCreditToInvoice({
              memberId: inv.member.id,
              invoiceId: inv.id,
              amountOwed: outstanding,
            });
            if (creditResult.fullyPaidByCredit) {
              dunningProcessed++;
              continue;
            }
            dunningRemaining = creditResult.remainingCents;
          }

          // Attempt charge via active processor if member has stored payment method
          if (dunningRemaining > 0 && activeProcessor && inv.member.defaultPaymentMethodId) {
            try {
              const chargeResult = await chargeStoredPaymentMethod({
                memberId: inv.member.id,
                amountCents: dunningRemaining,
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
        member: { clientId },
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
        where: { clientId, status: "ACTIVE", expiresAt: { lt: new Date() } },
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
      // Scope to this tenant -- previously matched member styles by
      // name against every gym's belt configs, so a Kempo student in
      // gym A could be flagged eligible using gym B's belt requirements.
      const stylesWithBelts = await prisma.style.findMany({
        where: { clientId, beltSystemEnabled: true },
        select: { name: true, beltConfig: true, ranks: { select: { name: true, order: true, classRequirement: true }, orderBy: { order: "asc" } } },
      });
      if (stylesWithBelts.length > 0) {
        const membersWithStyles = await prisma.member.findMany({
          where: { clientId, status: "ACTIVE", stylesNotes: { not: null } },
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
            if (!sc) continue;
            // Prefer beltConfig.ranks (granular progression with stripes etc.)
            let ranks: Array<{ name: string; order?: number; classRequirement?: number | null }> = sc.ranks;
            if (sc.beltConfig) {
              try {
                const bc = typeof sc.beltConfig === "string" ? JSON.parse(sc.beltConfig) : sc.beltConfig;
                if (Array.isArray(bc.ranks) && bc.ranks.length > 0) {
                  ranks = [...bc.ranks].sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0));
                }
              } catch {}
            }
            if (ranks.length === 0) continue;
            const ci = ranks.findIndex((r) => r.name.toLowerCase() === (s.rank || "").toLowerCase());
            if (ci < 0 || ci >= ranks.length - 1) continue;
            const nr = ranks[ci + 1];
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
                  reqs = brk.classRequirements.filter((r: any) => r.label && r.minCount > 0).map((r: any) => {
                    const isAny = r.label === "*";
                    return {
                      count: sa.filter((a) => isAny || a.classSession?.classType?.toLowerCase() === r.label.toLowerCase()).length,
                      required: r.minCount,
                    };
                  });
                }
              } catch {}
            }
            if (reqs.length === 0 && nr.classRequirement) {
              reqs = [{ count: sa.length, required: nr.classRequirement }];
            }
            // Match dashboard: only flag when there ARE configured requirements
            // and the member has met all of them. Empty requirements list
            // means undefined criteria, not "automatically eligible".
            if (reqs.length > 0 && reqs.every((r) => r.count >= r.required)) {
              eligible.push({ memberName: `${m.firstName} ${m.lastName}`, styleName: s.name, currentRank: ranks[ci].name, nextRank: nr.name });
            }
          }
        }

        // Deduplication: only email NEWLY eligible members
        if (eligible.length > 0) {
          const lastNotifiedSetting = await prisma.settings.findFirst({
            where: { key: "promotion_eligible_last_notified", clientId },
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
            sendPromotionEligibilityAlertEmail({ eligible: newlyEligible, clientId }).catch(() => {});
          }

          const existingPromoSetting = await prisma.settings.findFirst({ where: { key: "promotion_eligible_last_notified", clientId } });
          if (existingPromoSetting) {
            await prisma.settings.update({ where: { id: existingPromoSetting.id }, data: { value: JSON.stringify(currentKeys) } });
          } else {
            await prisma.settings.create({ data: { key: "promotion_eligible_last_notified", value: JSON.stringify(currentKeys), clientId } });
          }
        }
      }
    } catch (err) {
      console.error("Promotion eligibility email error:", err);
    }

    // Mark as run today
    const existingLastRun = await prisma.settings.findFirst({ where: { key: "billing_last_auto_run", clientId } });
    if (existingLastRun) {
      await prisma.settings.update({ where: { id: existingLastRun.id }, data: { value: today } });
    } else {
      await prisma.settings.create({ data: { key: "billing_last_auto_run", value: today, clientId } });
    }

    logAudit({
      entityType: "Billing",
      entityId: today,
      action: "BILLING_RUN",
      summary: `Auto billing run: ${invoicesCreated} invoices created, ${pastDueCount} past-due, ${dunningProcessed} dunning, ${membershipsSuspended} suspended, ${cancellationsProcessed} cancellations`,
      clientId,
    }).catch(() => {});

    return {
      clientId,
      skipped: false,
      invoicesCreated,
      invoicesSkipped,
      pastDueMarked: pastDueCount,
      dunningProcessed,
      membershipsSuspended,
      cancellationsProcessed,
    };
  } catch (error) {
    console.error(`Error processing billing for tenant ${clientId}:`, error);
    return {
      clientId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
