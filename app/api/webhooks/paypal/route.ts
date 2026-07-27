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

  // Parse body FIRST to extract the tenant clientId from the
  // metadata we injected during createPayPalCheckoutSession. Then
  // fetch that tenant's PayPal config for signature verification.
  // Body isn't trusted yet -- we only use the parsed metadata to
  // pick the correct config; verification either succeeds or
  // rejects.
  let event: {
    event_type: string;
    resource: Record<string, unknown>;
  };

  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const resource = event.resource;
  const customIdRaw = resource.custom_id as string | undefined;
  let tenantClientId: string | undefined;
  if (customIdRaw) {
    try {
      const parsed = JSON.parse(customIdRaw);
      if (parsed && typeof parsed === "object" && typeof parsed.clientId === "string") {
        tenantClientId = parsed.clientId;
      }
    } catch { /* customId may not be JSON */ }
  }

  // No tenant on the event -- can't route it. Log and drop rather
  // than falling back to any tenant's config.
  if (!tenantClientId) {
    console.error("PayPal webhook: could not resolve tenant from custom_id metadata");
    return NextResponse.json({ received: true });
  }

  const config = await getPayPalConfig(tenantClientId);
  if (!config) {
    return NextResponse.json({ error: "PayPal not configured for this tenant" }, { status: 500 });
  }

  // Verify webhook signature using THIS tenant's PayPal webhook id.
  let webhookId: string | undefined = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    const row = await prisma.settings.findUnique({
      where: { key_clientId: { key: "payment_paypal_webhook_id", clientId: tenantClientId } },
    });
    webhookId = row?.value || undefined;
  }

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

  const eventType = event.event_type;

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
