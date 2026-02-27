import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

// GET /api/members/[id]/payment-methods — list saved cards for a member
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: memberId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stripeCustomerId: true, defaultPaymentMethodId: true },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (!member?.stripeCustomerId) {
    return NextResponse.json({ paymentMethods: [], defaultId: null });
  }

  const stripeClient = await getStripeClient();
  if (!stripeClient) {
    return NextResponse.json({ paymentMethods: [], defaultId: null });
  }

  try {
    const methods = await stripeClient.paymentMethods.list({
      customer: member.stripeCustomerId,
      type: "card",
    });

    const paymentMethods = methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || "unknown",
      last4: pm.card?.last4 || "****",
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    }));

    return NextResponse.json({
      paymentMethods,
      defaultId: member.defaultPaymentMethodId,
    });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    return NextResponse.json({ error: "Failed to load payment methods" }, { status: 500 });
  }
}

// POST /api/members/[id]/payment-methods — create Stripe Setup session to add a card
export async function POST(_req: NextRequest, { params }: Params) {
  const { id: memberId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      clientId: true,
      firstName: true,
      lastName: true,
      email: true,
      stripeCustomerId: true,
    },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const stripeClient = await getStripeClient();
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  try {
    // Get or create Stripe customer
    let stripeCustomerId = member.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripeClient.customers.create({
        email: member.email || undefined,
        name: `${member.firstName} ${member.lastName}`,
        metadata: { memberId: member.id },
      });
      stripeCustomerId = customer.id;
      await prisma.member.update({
        where: { id: member.id },
        data: { stripeCustomerId },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const session = await stripeClient.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "setup",
      payment_method_types: ["card"],
      success_url: `${baseUrl}/members/${memberId}?setup=success`,
      cancel_url: `${baseUrl}/members/${memberId}`,
      metadata: { memberId: member.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating setup session:", error);
    return NextResponse.json({ error: "Failed to create setup session" }, { status: 500 });
  }
}
