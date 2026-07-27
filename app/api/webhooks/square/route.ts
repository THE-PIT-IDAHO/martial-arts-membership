import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySquareWebhook } from "@/lib/square";
import {
  handleCheckoutCompleted,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleRefundCompleted,
} from "@/lib/payment";

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Parse body first so we can extract the tenant clientId from
  // payment.note (JSON we injected during createSquareCheckoutSession).
  // Then look up THAT tenant's Square webhook signature key.
  let event: {
    type: string;
    data?: {
      type?: string;
      id?: string;
      object?: {
        payment?: Record<string, unknown>;
        refund?: Record<string, unknown>;
      };
    };
  };

  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve tenant from payment note metadata (best effort). Refund
  // events don't carry a note themselves; they carry a payment_id
  // which we could then use to look up the local POSTransaction and
  // its clientId, but for signature verification we just fall through
  // to env-var mode when we can't resolve.
  const paymentNote = (event.data?.object?.payment?.note as string) || "";
  let tenantClientId: string | undefined;
  if (paymentNote) {
    try {
      const parsed = JSON.parse(paymentNote);
      if (parsed && typeof parsed === "object" && typeof parsed.clientId === "string") {
        tenantClientId = parsed.clientId;
      }
    } catch { /* not JSON */ }
  }

  // Verify webhook signature. Prefer env var; if not set, look up
  // the resolved tenant's signature key.
  let signatureKey: string | undefined = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey && tenantClientId) {
    const row = await prisma.settings.findUnique({
      where: { key_clientId: { key: "payment_square_webhook_signature_key", clientId: tenantClientId } },
    });
    signatureKey = row?.value || undefined;
  }

  if (signatureKey) {
    const signature = req.headers.get("x-square-hmacsha256-signature") || "";
    const notificationUrl =
      process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/square`
        : "";

    const verified = verifySquareWebhook({
      signatureKey,
      notificationUrl,
      body,
      signature,
    });

    if (!verified) {
      console.error("Square webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  const eventType = event.type;

  // payment.completed — payment was successful
  if (eventType === "payment.completed") {
    const payment = event.data?.object?.payment;
    if (payment) {
      const paymentId = payment.id as string;
      const note = (payment.note as string) || "";
      const referenceId = payment.reference_id as string | undefined;

      // Try to parse metadata from note field
      let metadata: Record<string, string> = {};
      if (note) {
        try {
          metadata = JSON.parse(note);
        } catch {
          // note is not JSON — treat referenceId as invoiceId
        }
      }

      if (metadata.source) {
        await handleCheckoutCompleted({
          externalPaymentId: paymentId,
          processor: "square",
          metadata,
        });
      } else if (referenceId) {
        // Off-session charge (auto-billing)
        await handlePaymentSucceeded({
          externalPaymentId: paymentId,
          processor: "square",
          invoiceId: referenceId,
        });
      }
    }

    return NextResponse.json({ received: true });
  }

  // payment.updated — check if payment failed
  if (eventType === "payment.updated") {
    const payment = event.data?.object?.payment;
    if (payment) {
      const status = payment.status as string;
      if (status === "FAILED" || status === "CANCELED") {
        const referenceId = payment.reference_id as string | undefined;
        if (referenceId) {
          await handlePaymentFailed({ invoiceId: referenceId });
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // refund.created — refund was issued (from Square dashboard)
  if (eventType === "refund.created" || eventType === "refund.updated") {
    const refund = event.data?.object?.refund;
    if (refund) {
      const paymentId = refund.payment_id as string;
      const status = refund.status as string;
      if (paymentId && status === "COMPLETED") {
        await handleRefundCompleted({
          externalPaymentId: paymentId,
          isFullRefund: true,
        });
      }
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
