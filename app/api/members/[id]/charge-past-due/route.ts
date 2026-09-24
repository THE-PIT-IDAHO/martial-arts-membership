import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { chargeStoredPaymentMethod, getCurrency } from "@/lib/payment";
import { applyAccountCreditToInvoice } from "@/lib/billing";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/members/[id]/charge-past-due
 *
 * Bulk-charge every PAST_DUE / FAILED invoice for this member --
 * intended for the "Charge Balance" button on the profile's
 * Past-Due tile. Bypasses the dunning gate (cardPredatesInvoice,
 * autoChargePastDueEnabled, etc.) since this is an explicit
 * admin-initiated action.
 *
 * PAYS_FOR pivot is handled by chargeStoredPaymentMethod
 * internally, so calling this for a payee (e.g. Isabella) charges
 * the payer's card (e.g. Colten's) automatically.
 *
 * Returns per-invoice results so the UI can show partial success
 * (some paid, some declined) with the specific decline reason.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await props.params;
  const clientId = await getClientId(req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, clientId: true, firstName: true, lastName: true, accountCreditCents: true },
  });
  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      memberId,
      status: { in: ["PAST_DUE", "FAILED"] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amountCents: true,
      creditAppliedCents: true,
      status: true,
    },
    orderBy: { dueDate: "asc" },
  });

  // Absorbed-debt case: a maxed-out invoice moves the amount off
  // Invoice.amountCents and DECREMENTS Member.accountCreditCents,
  // so the real owed balance ends up on the member's credit row
  // (as a negative number). Cruz's Stela case: $30 past-due sits
  // there with no open invoice, so the invoice-only endpoint had
  // nothing to charge and the profile tile had no button.
  const negativeCreditOwed = Math.max(0, -(member.accountCreditCents || 0));

  if (invoices.length === 0 && negativeCreditOwed === 0) {
    return NextResponse.json({
      success: true,
      chargedCount: 0,
      results: [],
      message: "No past-due balance to charge.",
    });
  }

  const currency = await getCurrency(clientId);

  const results: Array<{
    invoiceId: string;
    invoiceNumber: string | null;
    amountCents: number;
    status: "paid" | "credit_only" | "failed" | "skipped";
    error?: string;
    externalPaymentId?: string;
  }> = [];

  let chargedCount = 0;
  let totalChargedCents = 0;

  for (const inv of invoices) {
    const outstanding = Math.max(0, inv.amountCents - inv.creditAppliedCents);
    if (outstanding <= 0) {
      results.push({ invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amountCents: 0, status: "skipped" });
      continue;
    }

    // Try account credit first (draws from the payee's own credit,
    // not the payer's -- same as the auto-billing cron does).
    let remaining = outstanding;
    const creditResult = await applyAccountCreditToInvoice({
      memberId,
      invoiceId: inv.id,
      amountOwed: outstanding,
    });
    if (creditResult.fullyPaidByCredit) {
      results.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amountCents: outstanding,
        status: "credit_only",
      });
      chargedCount++;
      continue;
    }
    remaining = creditResult.remainingCents;

    try {
      const chargeResult = await chargeStoredPaymentMethod({
        memberId,
        amountCents: remaining,
        currency,
        description: `Invoice ${inv.invoiceNumber || inv.id} — Manual charge`,
        invoiceId: inv.id,
      });
      if (chargeResult.success && chargeResult.externalPaymentId) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            paymentMethod: (chargeResult.processor || "stripe").toUpperCase(),
            externalPaymentId: chargeResult.externalPaymentId,
            paymentProcessor: chargeResult.processor || "stripe",
            ...(chargeResult.processor === "stripe"
              ? { stripePaymentIntentId: chargeResult.externalPaymentId }
              : {}),
            lastRetryDate: new Date(),
            nextRetryDate: null,
            lastChargeError: null,
            lastChargeErrorAt: null,
          },
        });
        results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountCents: remaining,
          status: "paid",
          externalPaymentId: chargeResult.externalPaymentId,
        });
        chargedCount++;
        totalChargedCents += remaining;
      } else {
        const errMsg = chargeResult.error || "Charge declined";
        await prisma.invoice.update({
          where: { id: inv.id },
          data: {
            lastChargeError: errMsg,
            lastChargeErrorAt: new Date(),
            lastRetryDate: new Date(),
            retryCount: { increment: 1 },
          },
        });
        results.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountCents: remaining,
          status: "failed",
          error: errMsg,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Charge attempt threw";
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          lastChargeError: errMsg,
          lastChargeErrorAt: new Date(),
          lastRetryDate: new Date(),
          retryCount: { increment: 1 },
        },
      }).catch(() => {});
      results.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amountCents: remaining,
        status: "failed",
        error: errMsg,
      });
    }
  }

  // After invoices, tackle the negative-credit portion. Charging
  // this amount and, on success, incrementing accountCreditCents
  // back up brings the balance to zero. Only fires if there's
  // still a negative balance -- an invoice-only charge above may
  // have already lifted the credit through applyAccountCreditToInvoice
  // side effects, so re-read fresh.
  let creditChargeResult: {
    amountCents: number;
    status: "paid" | "failed" | "skipped";
    error?: string;
    externalPaymentId?: string;
  } | null = null;
  if (negativeCreditOwed > 0) {
    const fresh = await prisma.member.findUnique({
      where: { id: memberId },
      select: { accountCreditCents: true },
    });
    const remaining = Math.max(0, -(fresh?.accountCreditCents || 0));
    if (remaining > 0) {
      try {
        const chargeResult = await chargeStoredPaymentMethod({
          memberId,
          amountCents: remaining,
          currency,
          description: `Account balance -- ${member.firstName} ${member.lastName}`,
        });
        if (chargeResult.success && chargeResult.externalPaymentId) {
          // Bring accountCreditCents back up by the charged
          // amount. On a full-payment case this lands it at 0.
          await prisma.member.update({
            where: { id: memberId },
            data: { accountCreditCents: { increment: remaining } },
          });
          creditChargeResult = {
            amountCents: remaining,
            status: "paid",
            externalPaymentId: chargeResult.externalPaymentId,
          };
          chargedCount++;
          totalChargedCents += remaining;
        } else {
          creditChargeResult = {
            amountCents: remaining,
            status: "failed",
            error: chargeResult.error || "Charge declined",
          };
        }
      } catch (err) {
        creditChargeResult = {
          amountCents: remaining,
          status: "failed",
          error: err instanceof Error ? err.message : "Charge attempt threw",
        };
      }
    }
  }

  const totalTargets = invoices.length + (negativeCreditOwed > 0 ? 1 : 0);

  logAudit({
    entityType: "Member",
    entityId: memberId,
    action: "UPDATE",
    summary: `Manual charge of past-due balance for ${member.firstName} ${member.lastName}: ${chargedCount}/${totalTargets} target${totalTargets === 1 ? "" : "s"} paid ($${(totalChargedCents / 100).toFixed(2)})`,
    clientId,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    chargedCount,
    totalInvoices: invoices.length,
    totalChargedCents,
    results,
    creditCharge: creditChargeResult,
  });
}
