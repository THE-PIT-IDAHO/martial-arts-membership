import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, getStripeClient, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import {
  handleCheckoutCompleted,
  handlePaymentSucceeded,
  handlePaymentFailed,
  handleRefundCompleted,
} from "@/lib/payment";
import {
  applySubscriptionToClient,
  findClientByStripeCustomerId,
} from "@/lib/platform-subscription";

// App Router needs the raw request body for Stripe signature
// validation; req.text() below preserves it. Do NOT switch to
// req.json() -- that reparses and breaks the HMAC check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe -- Stripe → us.
 *
 * ONE webhook endpoint for the whole product, routing events to
 * two independent flows:
 *
 *   MEMBER billing (tenant-scoped) -- pre-existing:
 *     - checkout.session.completed (mode=setup)   → save member card
 *     - checkout.session.completed (mode=payment) → member invoice paid
 *     - payment_intent.succeeded / .payment_failed → auto-billing / dunning
 *     - charge.refunded → invoice refund
 *
 *   PLATFORM subscription billing (gym-owner-scoped) -- new:
 *     - checkout.session.completed (mode=subscription) → subscribe
 *     - customer.subscription.created / .updated / .deleted → sync state
 *     - invoice.payment_succeeded / .payment_failed → status flip
 *     - customer.deleted → wipe our Stripe id on the Client
 *
 * Router `dispatchStripeEvent` demuxes by event.type + session.mode
 * so neither flow can accidentally act on the other's events.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // constructEvent does NOT hit the Stripe API -- it just verifies the
  // HMAC signature -- so the SDK's API-key argument is unused here.
  // Prefer the platform client (uses STRIPE_SECRET_KEY) when available;
  // fall back to a placeholder-key SDK for signature verification only
  // so per-tenant-DB-key installs still process webhooks.
  const stripeForVerify = isStripeConfigured()
    ? getStripe()
    : new Stripe("sk_placeholder", { typescript: true });

  let event: Stripe.Event;
  try {
    event = stripeForVerify.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Once signature verifies we've held up Stripe's half of the
  // contract. If a handler throws, log + 200 so Stripe stops retrying
  // for something a retry cannot fix. Genuinely-transient failures
  // should surface through our own alerting, not Stripe's.
  try {
    await dispatchStripeEvent(event);
  } catch (err) {
    console.error(`[webhooks/stripe] handler failed for ${event.id} (${event.type}):`, err);
  }
  return NextResponse.json({ received: true });
}

async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    // ---- checkout.session.completed: routes by session.mode ----
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        await handlePlatformSubscriptionCheckout(session);
        return;
      }
      if (session.mode === "setup") {
        await handleMemberSetupSession(session);
        return;
      }
      // Payment session — delegate to shared member handler
      const paymentIntentId = (session.payment_intent as string) || session.id;
      const metadata = (session.metadata || {}) as Record<string, string>;
      await handleCheckoutCompleted({
        externalPaymentId: paymentIntentId,
        processor: "stripe",
        metadata,
        amountTotalCents: session.amount_total || undefined,
        taxCents: session.total_details?.amount_tax || 0,
      });
      return;
    }

    // ---- Platform subscription lifecycle ----
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const client = await findClientByStripeCustomerId(customerId);
      if (!client) {
        console.warn(`[webhooks/stripe] subscription event for unknown customer ${customerId}`);
        return;
      }
      await applySubscriptionToClient(client.id, sub);
      return;
    }

    // Platform subscription invoicing -- reflects status back onto the
    // Client (past_due after failure, active after next success). Only
    // fires for subscription-scoped invoices; ad-hoc member charges go
    // through payment_intent.* below.
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const subField = (inv as unknown as { subscription?: string | { id: string } | null })
        .subscription;
      const subId = typeof subField === "string" ? subField : subField?.id;
      if (!subId) return;
      const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      if (!customerId) return;
      const client = await findClientByStripeCustomerId(customerId);
      if (!client) return;
      if (!isStripeConfigured()) return;
      const sub = await getStripe().subscriptions.retrieve(subId);
      await applySubscriptionToClient(client.id, sub);
      return;
    }

    case "customer.deleted": {
      const cust = event.data.object as Stripe.Customer;
      const client = await findClientByStripeCustomerId(cust.id);
      if (client) {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            subscriptionStatus: null,
            subscriptionCurrentPeriodEnd: null,
            subscriptionCancelAt: null,
          },
        });
      }
      return;
    }

    // ---- Member billing: off-session auto-billing / dunning ----
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.invoiceId) {
        await handlePaymentSucceeded({
          externalPaymentId: pi.id,
          processor: "stripe",
          invoiceId: pi.metadata.invoiceId,
        });
      }
      return;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.invoiceId) {
        await handlePaymentFailed({ invoiceId: pi.metadata.invoiceId });
      }
      return;
    }

    // Member refunds from the Stripe dashboard
    case "charge.refunded": {
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
      return;
    }

    default:
      // Everything else is fine to ignore. Stripe treats a 2xx as
      // delivered; unhandled events pile up in the dashboard but
      // don't cause retries.
      return;
  }
}

// ---------------------------------------------------------------------------
// Handlers -- session.mode-specific splits kept private to this file so the
// two flows read one after the other in dispatchStripeEvent.
// ---------------------------------------------------------------------------

/** subscription-mode checkout completed → hydrate the platform subscription
 *  onto the target Client (redundant with customer.subscription.created but
 *  guards against the ordering flake where checkout fires first). */
async function handlePlatformSubscriptionCheckout(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (!session.subscription) return;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!customerId) return;
  const client = await findClientByStripeCustomerId(customerId);
  if (!client) return;
  if (!isStripeConfigured()) return;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const sub = await getStripe().subscriptions.retrieve(subId);
  await applySubscriptionToClient(client.id, sub);
}

/** Member setup session (adding a card via the portal / member profile).
 *  If it's the member's first card, promote it to their default so
 *  auto-billing can charge it. */
async function handleMemberSetupSession(session: Stripe.Checkout.Session): Promise<void> {
  const memberId = session.metadata?.memberId;
  if (!memberId) return;
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, defaultPaymentMethodId: true, stripeCustomerId: true },
  });
  if (!member?.stripeCustomerId || member.defaultPaymentMethodId) return;
  const setupIntentId = session.setup_intent as string;
  if (!setupIntentId) return;

  // We now know the tenant; use their key for the API call.
  const stripeClient = await getStripeClient(member.clientId);
  if (!stripeClient) return;
  const setupIntent = await stripeClient.setupIntents.retrieve(setupIntentId);
  const pmId = typeof setupIntent.payment_method === "string"
    ? setupIntent.payment_method
    : setupIntent.payment_method?.id;
  if (!pmId) return;
  await stripeClient.customers.update(member.stripeCustomerId, {
    invoice_settings: { default_payment_method: pmId },
  });
  await prisma.member.update({
    where: { id: memberId },
    data: { defaultPaymentMethodId: pmId },
  });
}
