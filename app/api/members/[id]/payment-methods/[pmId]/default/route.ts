import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; pmId: string }> };

// PUT /api/members/[id]/payment-methods/[pmId]/default — set as default payment method
export async function PUT(_req: NextRequest, { params }: Params) {
  const { id: memberId, pmId: paymentMethodId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stripeCustomerId: true },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (!member?.stripeCustomerId) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
  }

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  try {
    // A PM created via the embedded card modal is attached to no
    // customer by default now (the create-payment-intent route no
    // longer forces setup_future_usage: "off_session"). When the admin
    // checks "Save card as default" the PM arrives here unattached;
    // attach it to this member's Stripe customer first. If it's
    // already attached to a DIFFERENT customer, refuse -- that's a
    // sign the caller mixed up a PM from another member's dropdown.
    const pm = await stripeClient.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== member.stripeCustomerId) {
      return NextResponse.json({ error: "Payment method belongs to a different member" }, { status: 403 });
    }
    if (!pm.customer) {
      await stripeClient.paymentMethods.attach(paymentMethodId, { customer: member.stripeCustomerId });
    }

    // Set as default on Stripe customer
    await stripeClient.customers.update(member.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Save in our DB
    await prisma.member.update({
      where: { id: memberId },
      data: { defaultPaymentMethodId: paymentMethodId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    return NextResponse.json({ error: "Failed to set default" }, { status: 500 });
  }
}
