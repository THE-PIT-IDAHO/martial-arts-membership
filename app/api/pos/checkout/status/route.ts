import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getActiveProcessor, getCheckoutStatus } from "@/lib/payment";

/**
 * GET /api/pos/checkout/status?session_id=xxx&order_id=yyy
 * Unified status polling for all payment processors.
 * POS frontend polls this every 2s while the payment popup is open.
 */
export async function GET(req: NextRequest) {
  const clientId = await getClientId(req);
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const orderId = req.nextUrl.searchParams.get("order_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const processor = await getActiveProcessor(clientId);
  if (!processor) {
    return NextResponse.json({ error: "No processor configured" }, { status: 400 });
  }

  try {
    const result = await getCheckoutStatus(clientId, sessionId, orderId || undefined);

    let transactionId: string | undefined;

    if (result.status === "complete") {
      // For split payments, the transaction was created before the payment — check metadata
      if (result.metadata?.transactionId) {
        transactionId = result.metadata.transactionId;
      } else if (result.externalPaymentId) {
        // For single CARD payments, look up by paymentIntentId (set by webhook).
        // Scope by clientId so a colliding paymentIntentId (extremely
        // unlikely but possible if the processor rotates keys) can't
        // reveal another tenant's transaction.
        const txn = await prisma.pOSTransaction.findFirst({
          where: { paymentIntentId: result.externalPaymentId, clientId },
          select: { id: true, transactionNumber: true },
        });
        if (txn) {
          transactionId = txn.id;
        }
      }
    }

    return NextResponse.json({
      status: result.status, // "pending", "complete", "expired", "failed"
      transactionId,
      processor,
    });
  } catch {
    return NextResponse.json({ error: "Failed to retrieve status" }, { status: 500 });
  }
}
