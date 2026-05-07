import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";

/**
 * POST /api/pos/charge-saved-card — Charge a member's saved default card
 * Used for POS transactions where the member already has a card on file.
 */
export async function POST(req: Request) {
  const clientId = await getClientId(req);
  const body = await req.json();
  const { memberId, amountCents, metadata } = body;

  if (!memberId) {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }
  if (!amountCents || amountCents <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { stripeCustomerId: true, defaultPaymentMethodId: true, clientId: true },
  });

  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (!member.stripeCustomerId || !member.defaultPaymentMethodId) {
    return NextResponse.json({ error: "Member has no saved card on file" }, { status: 400 });
  }

  const stripeClient = await getStripeClient();
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  // Get currency
  const currSetting = await prisma.settings.findUnique({
    where: { key_clientId: { key: "currency", clientId } },
  });
  const currency = currSetting?.value || "usd";

  try {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      customer: member.stripeCustomerId,
      payment_method: member.defaultPaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        source: "admin_pos",
        memberId,
        ...(metadata || {}),
      },
    });

    if (paymentIntent.status === "succeeded") {
      return NextResponse.json({
        success: true,
        paymentIntentId: paymentIntent.id,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Payment status: ${paymentIntent.status}`,
      });
    }
  } catch (error: unknown) {
    console.error("Error charging saved card:", error);
    const message = error instanceof Error ? error.message : "Payment failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
