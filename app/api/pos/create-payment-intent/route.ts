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

  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const stripeClient = await getStripeClient();
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  // Get publishable key
  const pkSetting = await prisma.settings.findUnique({
    where: { key_clientId: { key: "payment_stripe_publishable_key", clientId } },
  });
  if (!pkSetting?.value) {
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
      publishableKey: pkSetting.value,
      paymentIntentId: paymentIntent.id,
      memberName: memberName || "",
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
