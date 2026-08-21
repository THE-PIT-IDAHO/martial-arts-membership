import { prisma } from "@/lib/prisma";
import { generateReceiptPdf, type ReceiptData } from "@/lib/receipt-pdf";

/**
 * Build a receipt PDF from a POS transaction id. Shared between the
 * receipt-only send path (/api/pos/send-receipt) and the combined
 * receipt+contract path (/api/contracts/sign) so the two never drift
 * out of sync.
 *
 * Returns null when the transaction can't be found, doesn't belong to
 * this tenant, or has no associated member (no one to send to). The
 * caller is expected to short-circuit in that case.
 */
export async function buildReceiptFromTransactionId(
  clientId: string,
  transactionId: string,
): Promise<{
  pdfBase64: string;
  fileName: string;
  memberId: string;
  memberName: string;
  transactionNumber: string;
  totalCents: number;
} | null> {
  const txn = await prisma.pOSTransaction.findUnique({
    where: { id: transactionId },
    include: { POSLineItem: true },
  });
  if (!txn || txn.clientId !== clientId) return null;
  if (!txn.memberId) return null;

  const settings = await prisma.settings.findMany({
    where: {
      clientId,
      key: { in: ["gymName", "gymAddress", "gymCity", "gymState", "gymZipCode", "gymPhone", "gymEmail"] },
    },
  });
  const get = (key: string) => settings.find((s) => s.key === key)?.value || "";

  const receiptData: ReceiptData = {
    transactionNumber: txn.transactionNumber || txn.id.slice(0, 8),
    date: new Date(txn.createdAt).toLocaleDateString(),
    memberName: txn.memberName || undefined,
    lineItems: txn.POSLineItem.map((li) => ({
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

  return {
    pdfBase64,
    fileName,
    memberId: txn.memberId,
    memberName: txn.memberName || "Member",
    transactionNumber: txn.transactionNumber || txn.id.slice(0, 8),
    totalCents: txn.totalCents,
  };
}
