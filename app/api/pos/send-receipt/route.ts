import { NextResponse } from "next/server";
import { getClientId } from "@/lib/tenant";
import { sendPurchaseCompleteEmail } from "@/lib/notifications";
import { buildReceiptFromTransactionId } from "@/lib/receipt-from-transaction";

/**
 * POST /api/pos/send-receipt — Generate a receipt PDF for a POS
 * transaction and email it to the member as the "Purchase Complete"
 * email (no contract attachment). If the same checkout also produced
 * a signed contract, /api/contracts/sign handles the combined send
 * (receipt + contract in one email) instead -- the client-side POS
 * flow already skips this endpoint in that case.
 */
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
    }

    const receipt = await buildReceiptFromTransactionId(clientId, transactionId);
    if (!receipt) {
      return NextResponse.json(
        { error: "Transaction not found or no member associated" },
        { status: 404 },
      );
    }

    await sendPurchaseCompleteEmail({
      memberId: receipt.memberId,
      memberName: receipt.memberName,
      transactionNumber: receipt.transactionNumber,
      totalCents: receipt.totalCents,
      receiptPdfBase64: receipt.pdfBase64,
      receiptFileName: receipt.fileName,
      // No contract in this flow -- the /api/contracts/sign endpoint
      // handles combined send when a contract was signed.
      contractPdfBase64: null,
      contractFileName: null,
      clientId,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Error sending receipt:", error);
    return NextResponse.json({ error: "Failed to send receipt" }, { status: 500 });
  }
}
