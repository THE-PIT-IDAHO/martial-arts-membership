import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { createRefund, type ProcessorType } from "@/lib/payment";

// POST /api/invoices/:id/refund — Refund a paid invoice through the payment processor
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
        member: { select: { firstName: true, lastName: true } },
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

    // Process refund through payment processor
    const result = await createRefund(
      invoice.externalPaymentId,
      invoice.paymentProcessor as ProcessorType,
      invoice.amountCents,
      "usd"
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Refund failed" }, { status: 400 });
    }

    // Update invoice status
    await prisma.invoice.update({
      where: { id },
      data: { status: "VOID", notes: `Refunded on ${new Date().toLocaleDateString()}` },
    });

    // If there's a linked transaction, mark it as refunded too
    if (invoice.transactionId) {
      await prisma.pOSTransaction.update({
        where: { id: invoice.transactionId },
        data: { status: "REFUNDED" },
      }).catch(() => {}); // Ignore if transaction doesn't exist
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing refund:", error);
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}
