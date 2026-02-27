import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getActiveProcessor } from "@/lib/payment";
import { getStripeClient } from "@/lib/stripe";

// PUT /api/portal/payment-methods/[id]/default — set as default payment method
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: paymentMethodId } = await params;
  const processor = await getActiveProcessor();

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { stripeCustomerId: true, paypalPayerId: true, squareCustomerId: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  try {
    if (processor === "stripe") {
      if (!member.stripeCustomerId) {
        return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
      }
      const stripeClient = await getStripeClient();
      if (!stripeClient) {
        return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
      }
      const pm = await stripeClient.paymentMethods.retrieve(paymentMethodId);
      if (pm.customer !== member.stripeCustomerId) {
        return NextResponse.json({ error: "Not your payment method" }, { status: 403 });
      }
      await stripeClient.customers.update(member.stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }
    // PayPal and Square: just update the DB default — no processor-side "default" concept

    await prisma.member.update({
      where: { id: auth.memberId },
      data: { defaultPaymentMethodId: paymentMethodId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    return NextResponse.json({ error: "Failed to set default" }, { status: 500 });
  }
}
