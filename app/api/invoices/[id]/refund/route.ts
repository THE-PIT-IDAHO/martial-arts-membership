import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { createRefund, type ProcessorType } from "@/lib/payment";

// POST /api/invoices/:id/refund — Refund a paid invoice through the
// payment processor AND write the balance adjustment back to the
// member so the app matches reality.
//
// The old flow just voided the invoice and stopped. That left the
// member showing as paid-through-the-next-cycle even though the
// money had been returned to their card, so nothing prompted them
// for the money they still owed for the service. Now the refund
// also debits their account: the processor-refunded amount comes
// off Member.accountCreditCents, so if they had credit it gets
// drawn down first, and if not the balance goes negative (the
// existing convention for "owes money"). Auto-billing already
// respects this on the next cycle -- the credit-first helper
// treats a non-positive balance as "no credit to apply".
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, accountCreditCents: true } },
        membership: { select: { membershipPlan: { select: { name: true } } } },
      },
    });

    if (!invoice || invoice.clientId !== clientId) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status !== "PAID") {
      return NextResponse.json({ error: "Only paid invoices can be refunded" }, { status: 400 });
    }

    if (!invoice.externalPaymentId || !invoice.paymentProcessor) {
      return NextResponse.json({ error: "No payment processor data — cannot refund automatically" }, { status: 400 });
    }

    // The processor was only charged for the portion NOT covered by
    // account credit at billing time. Refunding more than that would
    // over-refund the card.
    const refundAmountCents = invoice.amountCents - invoice.creditAppliedCents;
    if (refundAmountCents <= 0) {
      return NextResponse.json(
        { error: "This invoice was paid entirely from account credit — nothing to refund on the card. Void the invoice manually if needed." },
        { status: 400 },
      );
    }

    const result = await createRefund(
      clientId,
      invoice.externalPaymentId,
      invoice.paymentProcessor as ProcessorType,
      refundAmountCents,
      "usd"
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Refund failed" }, { status: 400 });
    }

    // Void the invoice + write the balance adjustment atomically so
    // a mid-flight failure can't leave the member with a decremented
    // balance and a still-PAID invoice (or vice versa).
    const prevBalance = invoice.member.accountCreditCents;
    const newBalance = prevBalance - refundAmountCents;
    const balanceNote = newBalance < 0
      ? `Owes $${(Math.abs(newBalance) / 100).toFixed(2)}`
      : `Credit balance $${(newBalance / 100).toFixed(2)}`;
    const noteLine =
      `Refunded $${(refundAmountCents / 100).toFixed(2)} on ${new Date().toLocaleDateString()}. ` +
      `Balance adjusted by -$${(refundAmountCents / 100).toFixed(2)} (${balanceNote}).`;

    await prisma.$transaction([
      prisma.invoice.update({
        where: { id },
        data: {
          status: "VOID",
          notes: invoice.notes ? `${invoice.notes}\n${noteLine}` : noteLine,
        },
      }),
      prisma.member.update({
        where: { id: invoice.member.id },
        data: { accountCreditCents: { decrement: refundAmountCents } },
      }),
    ]);

    // If there's a linked transaction, mark it as refunded too. Not
    // in the transaction above because it may not exist and we don't
    // want a P2025 to roll back the invoice / balance updates.
    if (invoice.transactionId) {
      await prisma.pOSTransaction.update({
        where: { id: invoice.transactionId },
        data: { status: "REFUNDED" },
      }).catch(() => {});
    }

    // How much of the debt was absorbed by pre-existing positive
    // credit vs. how much dropped the account into the negative
    // (owes) side. Purely informational for the client alert.
    const absorbedByCredit = Math.max(0, Math.min(prevBalance, refundAmountCents));
    const owedAfterCredit = Math.max(0, refundAmountCents - Math.max(0, prevBalance));

    return NextResponse.json({
      success: true,
      refundedCents: refundAmountCents,
      newBalanceCents: newBalance,
      absorbedByCredit,
      owedAfterCredit,
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}
