import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getActiveProcessor } from "@/lib/payment";
import { getStripeClient } from "@/lib/stripe";
import { getPayPalConfig, deletePayPalVaultedToken } from "@/lib/paypal";
import { getSquareConfig, deleteSquareCard } from "@/lib/square";

// DELETE /api/portal/payment-methods/[id] — remove a saved payment method
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: paymentMethodId } = await params;
  const processor = await getActiveProcessor();

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      stripeCustomerId: true,
      defaultPaymentMethodId: true,
      paypalPayerId: true,
      squareCustomerId: true,
    },
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
      await stripeClient.paymentMethods.detach(paymentMethodId);
    } else if (processor === "paypal") {
      const config = await getPayPalConfig();
      if (!config) {
        return NextResponse.json({ error: "PayPal not configured" }, { status: 400 });
      }
      await deletePayPalVaultedToken(config, paymentMethodId);
    } else if (processor === "square") {
      const config = await getSquareConfig();
      if (!config) {
        return NextResponse.json({ error: "Square not configured" }, { status: 400 });
      }
      await deleteSquareCard(config, paymentMethodId);
    }

    // Clear default if this was the default
    if (member.defaultPaymentMethodId === paymentMethodId) {
      await prisma.member.update({
        where: { id: auth.memberId },
        data: { defaultPaymentMethodId: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing payment method:", error);
    return NextResponse.json({ error: "Failed to remove payment method" }, { status: 500 });
  }
}
