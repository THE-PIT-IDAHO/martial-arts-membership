import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import {
  handleCheckoutCompleted,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleRefundCompleted,
} from "@/lib/payment";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Webhook secret comes from the platform-level STRIPE_WEBHOOK_SECRET
  // env var. Per-tenant webhook secrets aren't supported here yet
  // because the webhook signature has to be verified before we know
  // which tenant the event belongs to (chicken and egg). Any per-
  // tenant Stripe integration should register the webhook under this
  // shared secret and rely on metadata.clientId in the event payload
  // for tenant resolution downstream.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Signature verification only needs a Stripe SDK instance (any
  // secret key works). Use env-level so we don't have to pick a
  // tenant before the event is even parsed. Downstream API calls
  // that need per-tenant Stripe keys resolve tenant from
  // metadata.clientId (see calls below).
  const envKey = process.env.STRIPE_SECRET_KEY;
  if (!envKey) {
    return NextResponse.json({ error: "Stripe env key not configured" }, { status: 500 });
  }
  const platformStripe = new Stripe(envKey, { typescript: true });

  let event: Stripe.Event;
  try {
    event = platformStripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Setup session (adding a card) — auto-set as default if member has none
    if (session.mode === "setup" && session.metadata?.memberId) {
      const memberId = session.metadata.memberId;
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { clientId: true, defaultPaymentMethodId: true, stripeCustomerId: true },
      });
      if (member?.stripeCustomerId && !member.defaultPaymentMethodId) {
        const setupIntentId = session.setup_intent as string;
        if (setupIntentId) {
          // Now that we know the tenant (from the member), use their
          // Stripe key for API calls.
          const stripeClient = await getStripeClient(member.clientId);
          if (!stripeClient) return NextResponse.json({ received: true });
          const setupIntent = await stripeClient.setupIntents.retrieve(setupIntentId);
          const pmId = typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;
          if (pmId) {
            await stripeClient.customers.update(member.stripeCustomerId, {
              invoice_settings: { default_payment_method: pmId },
            });
            await prisma.member.update({
              where: { id: memberId },
              data: { defaultPaymentMethodId: pmId },
            });
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // Payment session — delegate to shared handler
    const paymentIntentId = (session.payment_intent as string) || session.id;
    const metadata = (session.metadata || {}) as Record<string, string>;

    await handleCheckoutCompleted({
      externalPaymentId: paymentIntentId,
      processor: "stripe",
      metadata,
      amountTotalCents: session.amount_total || undefined,
      taxCents: session.total_details?.amount_tax || 0,
    });
  }

  // Off-session PaymentIntent success (auto-billing / dunning)
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.invoiceId) {
      await handlePaymentSucceeded({
        externalPaymentId: pi.id,
        processor: "stripe",
        invoiceId: pi.metadata.invoiceId,
      });
    }
  }

  // Off-session PaymentIntent failure
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.invoiceId) {
      await handlePaymentFailed({
        invoiceId: pi.metadata.invoiceId,
      });
    }
  }

  // Refund from Stripe dashboard
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const piId = typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

    if (piId) {
      await handleRefundCompleted({
        externalPaymentId: piId,
        isFullRefund: charge.amount_refunded >= charge.amount,
      });
    }
  }

  return NextResponse.json({ received: true });
}
