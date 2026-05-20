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

  // $0 totals (e.g. 100%-off first month, fully redeemed gift cert) skip
  // Stripe entirely — there's no payment to capture. We return a shape the
  // frontend already handles (clientSecret null → falls through to the
  // standard non-card transaction-create path).
  if (amountCents === 0) {
    return NextResponse.json({
      clientSecret: null,
      publishableKey: null,
      paymentIntentId: null,
      memberName: memberName || "",
      noPaymentNeeded: true,
    });
  }

  const stripeClient = await getStripeClient();
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

  // Get or create Stripe customer
  let stripeCustomerId: string | undefined;
  if (memberId) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });
    if (member?.stripeCustomerId) {
      stripeCustomerId = member.stripeCustomerId;
    } else if (member) {
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
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      ...(stripeCustomerId ? { customer: stripeCustomerId, setup_future_usage: "off_session" } : {}),
      metadata: {
        source: "admin_pos",
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
