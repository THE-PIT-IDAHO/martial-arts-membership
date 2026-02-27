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

  const stripeClient = await getStripeClient();
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  try {
    // Verify this payment method belongs to the member's customer
    const pm = await stripeClient.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== member.stripeCustomerId) {
      return NextResponse.json({ error: "Payment method does not belong to this member" }, { status: 403 });
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
