import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getAccountPaymentAmount } from "@/lib/payment-utils";
import { createRefund, getCurrency, type ProcessorType } from "@/lib/payment";

// GET /api/pos/transactions/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);

    const transaction = await prisma.pOSTransaction.findFirst({
      where: { id, clientId },
      include: {
        POSLineItem: true,
      },
    });

    if (!transaction) {
      return new NextResponse("Transaction not found", { status: 404 });
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return new NextResponse("Failed to load transaction", { status: 500 });
  }
}

// PATCH /api/pos/transactions/[id] - for refunds/voids
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);
    const body = await req.json();
    const { status, notes } = body;

    // Verify transaction belongs to tenant
    const existingTxn = await prisma.pOSTransaction.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!existingTxn) return new NextResponse("Transaction not found", { status: 404 });

    const transaction = await prisma.pOSTransaction.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        updatedAt: new Date(),
      },
      include: {
        POSLineItem: true,
      },
    });

    // If refunded or voided, reverse effects
    if (status === "REFUNDED" || status === "VOIDED") {
      for (const lineItem of transaction.POSLineItem) {
        // Restore product inventory
        if (lineItem.type === "product" && lineItem.itemId) {
          await prisma.pOSItem.update({
            where: { id: lineItem.itemId },
            data: {
              quantity: {
                increment: lineItem.quantity,
              },
              updatedAt: new Date(),
            },
          });
        }

        // Reverse account credit
        if (lineItem.type === "credit" && transaction.memberId) {
          await prisma.member.update({
            where: { id: transaction.memberId },
            data: {
              accountCreditCents: {
                decrement: lineItem.subtotalCents,
              },
            },
          });
        }
      }

      // Void any gift certificates created by this transaction
      await prisma.giftCertificate.updateMany({
        where: { transactionId: id },
        data: { status: "VOIDED" },
      });

      // Reverse ACCOUNT balance deduction
      if (transaction.memberId && transaction.paymentMethod) {
        const accountAmount = getAccountPaymentAmount(
          transaction.paymentMethod,
          transaction.totalCents
        );
        if (accountAmount > 0) {
          await prisma.member.update({
            where: { id: transaction.memberId },
            data: { accountCreditCents: { increment: accountAmount } },
          });
        }
      }

      // Refund via payment processor if the transaction was paid by card
      if (status === "REFUNDED" && transaction.paymentIntentId) {
        const processor = (transaction.paymentProcessor as ProcessorType) || "stripe";
        const currency = await getCurrency();
        const result = await createRefund(
          transaction.paymentIntentId,
          processor,
          transaction.totalCents,
          currency
        );
        if (!result.success) {
          return NextResponse.json({
            transaction,
            refundError: result.error || `${processor} refund failed. Please refund manually.`,
          });
        }
      }
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error("Error updating transaction:", error);
    return new NextResponse("Failed to update transaction", { status: 500 });
  }
}
