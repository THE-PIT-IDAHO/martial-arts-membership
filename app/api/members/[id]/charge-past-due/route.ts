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
    select: { id: true, clientId: true, firstName: true, lastName: true },
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

  if (invoices.length === 0) {
    return NextResponse.json({
      success: true,
      chargedCount: 0,
      results: [],
      message: "No past-due invoices to charge.",
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

  logAudit({
    entityType: "Member",
    entityId: memberId,
    action: "UPDATE",
    summary: `Manual charge of past-due balance for ${member.firstName} ${member.lastName}: ${chargedCount}/${invoices.length} invoices paid ($${(totalChargedCents / 100).toFixed(2)})`,
    clientId,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    chargedCount,
    totalInvoices: invoices.length,
    totalChargedCents,
    results,
  });
}
