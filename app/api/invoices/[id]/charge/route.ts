import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { chargeStoredPaymentMethod, getCurrency } from "@/lib/payment";
import { applyAccountCreditToInvoice } from "@/lib/billing";

// POST /api/invoices/[id]/charge — retry an auto-charge against the stored
// payment method. Used by the "Charge Now" admin button on a pending
// invoice. Returns the processor error verbatim so the admin can see
// exactly what Stripe (or PayPal/Square) is saying — the auto-billing
// cron eats this error silently, so failed charges were previously
// invisible past "invoice still PENDING".
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        invoiceNumber: true,
        memberId: true,
        amountCents: true,
        creditAppliedCents: true,
        status: true,
        clientId: true,
        notes: true,
        member: { select: { firstName: true, lastName: true, defaultPaymentMethodId: true } },
        membership: {
          select: { membershipPlan: { select: { name: true } } },
        },
      },
    });

    if (!invoice || invoice.clientId !== clientId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "PAID") {
      return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
    }

    if (invoice.amountCents === 0) {
      // $0 invoices should be auto-PAID; if one slipped through PENDING,
      // mark it correctly here instead of hitting the processor with a
      // sub-minimum charge.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt: new Date(), paymentMethod: "COMPLIMENTARY" },
      });
      return NextResponse.json({ success: true, marked: "PAID" });
    }

    // Try account credit BEFORE the processor. If credit covers the
    // full remaining balance, no card charge is needed and we can
    // return success right here.
    const outstanding = invoice.amountCents - invoice.creditAppliedCents;
    let remainingCents = outstanding;
    let creditApplied = 0;
    if (outstanding > 0) {
      const creditResult = await applyAccountCreditToInvoice({
        memberId: invoice.memberId,
        invoiceId: invoice.id,
        amountOwed: outstanding,
      });
      creditApplied = creditResult.creditApplied;
      remainingCents = creditResult.remainingCents;
      if (creditResult.fullyPaidByCredit) {
        return NextResponse.json({
          success: true,
          paidBy: "ACCOUNT_CREDIT",
          creditAppliedCents: creditApplied,
        });
      }
    }

    // PAYS_FOR pivot: when Isabella (payee) has no card of her own
    // but Colten (payer) does, the "no card on file" gate below
    // was rejecting the charge before chargeStoredPaymentMethod
    // (which pivots internally) ever ran. Look up the payer's
    // card here so the gate honors the family relationship.
    let effectiveCardId = invoice.member.defaultPaymentMethodId;
    if (!effectiveCardId) {
      const payerRow = await prisma.memberRelationship.findFirst({
        where: {
          relationship: "PAYS_FOR",
          toMemberId: invoice.memberId,
          fromMember: { clientId },
        },
        select: {
          fromMember: { select: { defaultPaymentMethodId: true } },
        },
      });
      effectiveCardId = payerRow?.fromMember?.defaultPaymentMethodId || null;
    }

    if (!effectiveCardId) {
      // Credit only partially covered (or member had no credit) and
      // neither this member nor their payer has a card on file.
      return NextResponse.json(
        {
          error: creditApplied > 0
            ? `Applied $${(creditApplied / 100).toFixed(2)} from account credit, but no card on file (member's or their payer's) for the remaining $${(remainingCents / 100).toFixed(2)}`
            : "No card on file for this member or their payer",
        },
        { status: 400 },
      );
    }

    const currency = await getCurrency(clientId);
    const planName = invoice.membership?.membershipPlan?.name || "Membership";

    const chargeResult = await chargeStoredPaymentMethod({
      memberId: invoice.memberId,
      amountCents: remainingCents,
      currency,
      description: `Invoice ${invoice.invoiceNumber || invoice.id} — ${planName}`,
      invoiceId: invoice.invoiceNumber || invoice.id,
    }).catch((err: unknown) => ({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }));

    if (chargeResult.success && "externalPaymentId" in chargeResult && chargeResult.externalPaymentId) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paymentMethod: ((chargeResult as { processor?: string }).processor || "stripe").toUpperCase(),
          externalPaymentId: chargeResult.externalPaymentId,
          paymentProcessor: (chargeResult as { processor?: string }).processor || "stripe",
          ...((chargeResult as { processor?: string }).processor === "stripe"
            ? { stripePaymentIntentId: chargeResult.externalPaymentId }
            : {}),
          nextRetryDate: null,
          lastChargeError: null,
          lastChargeErrorAt: null,
        },
      });
      return NextResponse.json({ success: true, externalPaymentId: chargeResult.externalPaymentId });
    }

    // Charge failed — persist to notes for the invoice-level log AND
    // to lastChargeError so the dashboard past-due card + profile
    // activity feed can surface the reason without hitting the
    // processor again.
    const errMsg = chargeResult.error || "Unknown payment error";
    const stamp = new Date().toISOString();
    const noteLine = `[${stamp}] Charge failed: ${errMsg}`;
    const updatedNotes = invoice.notes ? `${invoice.notes}\n${noteLine}` : noteLine;
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        notes: updatedNotes,
        lastRetryDate: new Date(),
        retryCount: { increment: 1 },
        lastChargeError: errMsg,
        lastChargeErrorAt: new Date(),
      },
    });

    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 502 },
    );
  } catch (error) {
    console.error("Invoice charge error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Charge failed" },
      { status: 500 },
    );
  }
}
