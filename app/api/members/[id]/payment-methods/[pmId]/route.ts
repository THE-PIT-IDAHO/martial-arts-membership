import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getClientId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string; pmId: string }> };

// DELETE /api/members/[id]/payment-methods/[pmId] — remove a saved card
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: memberId, pmId: paymentMethodId } = await params;
  const clientId = await getClientId(_req);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stripeCustomerId: true, defaultPaymentMethodId: true },
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

    await stripeClient.paymentMethods.detach(paymentMethodId);

    // Clear default if this was the default
    if (member.defaultPaymentMethodId === paymentMethodId) {
      await prisma.member.update({
        where: { id: memberId },
        data: { defaultPaymentMethodId: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing payment method:", error);
    return NextResponse.json({ error: "Failed to remove card" }, { status: 500 });
  }
}
