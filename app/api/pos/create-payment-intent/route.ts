import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";

/**
 * POST /api/pos/create-payment-intent — Create a Stripe PaymentIntent for embedded card form
 * Returns clientSecret + publishableKey for Stripe Elements
 */
export async function POST(req: Request) {
  const clientId = await getClientId(req);
  const body = await req.json();
  const { amountCents, memberId, memberName, metadata } = body;

  if (amountCents == null || amountCents < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  // Get publishable key. Prefers per-tenant Settings (set by each gym in
  // Account → Payments); falls back to STRIPE_PUBLISHABLE_KEY env var as a
  // platform-wide default. (Publishable keys are public — priority just
  // matters for routing to the right Stripe account.)
  let publishableKey: string | undefined;
  const pkSetting = await prisma.settings.findUnique({
    where: { key_clientId: { key: "payment_stripe_publishable_key", clientId } },
  });
  publishableKey = pkSetting?.value || undefined;
  if (!publishableKey) {
    publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  }
  if (!publishableKey) {
    return NextResponse.json({ error: "Stripe publishable key not configured" }, { status: 400 });
  }

  // Get currency
  const currSetting = await prisma.settings.findUnique({
    where: { key_clientId: { key: "currency", clientId } },
  });
  const currency = currSetting?.value || "usd";

  // Get or create Stripe customer -- verify tenant first so a
  // caller can't attach a foreign gym's member to our Stripe account
  // by supplying their memberId.
  let stripeCustomerId: string | undefined;
  if (memberId) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { clientId: true, stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (member.stripeCustomerId) {
      stripeCustomerId = member.stripeCustomerId;
    } else {
      const customer = await stripeClient.customers.create({
        email: member.email || undefined,
        name: `${member.firstName} ${member.lastName}`,
        metadata: { memberId },
      });
      stripeCustomerId = customer.id;
      await prisma.member.update({
        where: { id: memberId },
        data: { stripeCustomerId: customer.id },
      });
    }
  }

  try {
    // $0 totals (e.g. 100%-off first month) can't go through PaymentIntent
    // — Stripe rejects amount=0. If there's a Stripe customer, fall back
    // to a SetupIntent so the card-entry form still appears, the card
    // gets collected and saved on the customer, and future recurring
    // charges can hit it normally. Without a customer there's nowhere to
    // save the card, so we just return a no-payment signal.
    if (amountCents === 0) {
      if (!stripeCustomerId) {
        return NextResponse.json({
          clientSecret: null,
          publishableKey: null,
          paymentIntentId: null,
          memberName: memberName || "",
          noPaymentNeeded: true,
        });
      }
      const setupIntent = await stripeClient.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          source: "admin_pos",
          clientId,
          ...(metadata || {}),
        },
      });
      return NextResponse.json({
        clientSecret: setupIntent.client_secret,
        publishableKey,
        paymentIntentId: null,
        setupIntentId: setupIntent.id,
        isSetupIntent: true,
        memberName: memberName || "",
      });
    }

    // NB: no `setup_future_usage: "off_session"` here.
    //
    // Previously this was always set when a stripeCustomerId was present.
    // It told Stripe to save the entered card on the customer for later
    // off-session charges -- which triggers the bank's Strong Customer
    // Authentication (SCA) + tighter Radar scrutiny even on card-present
    // one-off sales. In practice that flipped legitimate cross-payer
    // charges (grandma paying for grandchild's membership) into
    // `requires_action` / `processing` states that never resolved, and
    // the admin's UI hung waiting for a `succeeded` that Stripe was
    // never going to send.
    //
    // The card modal's "Save card as default" checkbox now handles
    // saving explicitly post-charge (PUT .../payment-methods/[pmId]/default
    // attaches the PM to the customer if needed). One-off sales stay
    // one-off; saves are opt-in.
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      metadata: {
        source: "admin_pos",
        clientId,
        ...(metadata || {}),
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey,
      paymentIntentId: paymentIntent.id,
      memberName: memberName || "",
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
