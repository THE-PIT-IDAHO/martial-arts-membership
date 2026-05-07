import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { generateReceiptPdf, type ReceiptData } from "@/lib/receipt-pdf";
import { sendReceiptEmail } from "@/lib/notifications";

/**
 * POST /api/pos/send-receipt — Generate and email a receipt PDF for a transaction
 */
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
    }

    const txn = await prisma.pOSTransaction.findUnique({
      where: { id: transactionId },
      include: { POSLineItem: true },
    });

    if (!txn || txn.clientId !== clientId) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (!txn.memberId) {
      return NextResponse.json({ error: "No member associated with this transaction" }, { status: 400 });
    }

    // Get gym settings
    const settings = await prisma.settings.findMany({
      where: { clientId, key: { in: ["gymName", "gymAddress", "gymCity", "gymState", "gymZipCode", "gymPhone", "gymEmail"] } },
    });
    const get = (key: string) => settings.find(s => s.key === key)?.value || "";

    const receiptData: ReceiptData = {
      transactionNumber: txn.transactionNumber || txn.id.slice(0, 8),
      date: new Date(txn.createdAt).toLocaleDateString(),
      memberName: txn.memberName || undefined,
      lineItems: txn.POSLineItem.map(li => ({
        itemName: li.itemName,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        subtotalCents: li.subtotalCents,
      })),
      subtotalCents: txn.subtotalCents,
      discountCents: txn.discountCents,
      taxCents: txn.taxCents,
      totalCents: txn.totalCents,
      paymentMethod: txn.paymentMethod,
      gymName: get("gymName") || "Martial Arts School",
      gymAddress: get("gymAddress"),
      gymCity: get("gymCity"),
      gymState: get("gymState"),
      gymZipCode: get("gymZipCode"),
      gymPhone: get("gymPhone"),
      gymEmail: get("gymEmail"),
    };

    const pdfBase64 = generateReceiptPdf(receiptData);
    const fileName = `Receipt - ${txn.memberName || "Member"} - ${txn.transactionNumber || txn.id.slice(0, 8)}.pdf`;

    await sendReceiptEmail({
      memberId: txn.memberId,
      memberName: txn.memberName || "Member",
      transactionNumber: txn.transactionNumber || txn.id.slice(0, 8),
      totalCents: txn.totalCents,
      pdfBase64,
      fileName,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Error sending receipt:", error);
    return NextResponse.json({ error: "Failed to send receipt" }, { status: 500 });
  }
}
