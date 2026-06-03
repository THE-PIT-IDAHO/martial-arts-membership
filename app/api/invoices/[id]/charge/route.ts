import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { chargeStoredPaymentMethod, getCurrency } from "@/lib/payment";

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

    if (!invoice.member.defaultPaymentMethodId) {
      return NextResponse.json(
        { error: "Member has no default payment method on file" },
        { status: 400 },
      );
    }

    const currency = await getCurrency();
    const planName = invoice.membership?.membershipPlan?.name || "Membership";

    const chargeResult = await chargeStoredPaymentMethod({
      memberId: invoice.memberId,
      amountCents: invoice.amountCents,
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
        },
      });
      return NextResponse.json({ success: true, externalPaymentId: chargeResult.externalPaymentId });
    }

    // Charge failed — persist the error to the invoice notes so it shows
    // in the UI without needing to re-hit the processor.
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
