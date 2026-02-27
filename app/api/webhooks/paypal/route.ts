import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayPalConfig, verifyPayPalWebhook } from "@/lib/paypal";
import {
  handleCheckoutCompleted,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleRefundCompleted,
} from "@/lib/payment";

export async function POST(req: NextRequest) {
  const body = await req.text();

  const config = await getPayPalConfig();
  if (!config) {
    return NextResponse.json({ error: "PayPal not configured" }, { status: 500 });
  }

  // Verify webhook signature
  const webhookIdSetting = await prisma.settings.findFirst({
    where: { key: "payment_paypal_webhook_id" },
  });
  const webhookId = webhookIdSetting?.value;

  if (webhookId) {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const verified = await verifyPayPalWebhook({
      config,
      webhookId,
      headers,
      body,
    });

    if (!verified) {
      console.error("PayPal webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  }

  let event: {
    event_type: string;
    resource: Record<string, unknown>;
  };

  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event_type;
  const resource = event.resource;

  // CHECKOUT.ORDER.APPROVED — user approved the payment, we need to capture
  // (Normally captured by the status polling endpoint, but handle here as backup)
  if (eventType === "CHECKOUT.ORDER.APPROVED") {
    // The capture will happen via the status polling endpoint
    // Just acknowledge
    return NextResponse.json({ received: true });
  }

  // PAYMENT.CAPTURE.COMPLETED — payment captured successfully
  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const captureId = resource.id as string;
    const customId = resource.custom_id as string | undefined;

    if (customId) {
      try {
        const metadata = JSON.parse(customId) as Record<string, string>;
        await handleCheckoutCompleted({
          externalPaymentId: captureId,
          processor: "paypal",
          metadata,
        });
      } catch {
        // custom_id might not be JSON (e.g., invoice ID for auto-billing)
        await handlePaymentSucceeded({
          externalPaymentId: captureId,
          processor: "paypal",
          invoiceId: customId,
        });
      }
    }

    return NextResponse.json({ received: true });
  }

  // PAYMENT.CAPTURE.DENIED — payment capture failed
  if (eventType === "PAYMENT.CAPTURE.DENIED") {
    const customId = resource.custom_id as string | undefined;
    if (customId) {
      await handlePaymentFailed({ invoiceId: customId });
    }
    return NextResponse.json({ received: true });
  }

  // PAYMENT.CAPTURE.REFUNDED — refund completed
  if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
    const captureId = resource.id as string;
    if (captureId) {
      await handleRefundCompleted({
        externalPaymentId: captureId,
        isFullRefund: true,
      });
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
