import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import {
  getActiveProcessor,
  getCurrency,
  processPortalStoreCheckout,
} from "@/lib/payment";

// Same 500-char metadata guard the POS charge-saved-card route
// uses -- Stripe rejects any metadata value > 500 chars, and the
// serialized cartItems JSON can exceed that on multi-line carts.
function sanitizeStripeMetadata(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.entries(input).slice(0, 50);
  for (const [k, v] of entries) {
    if (v == null) continue;
    const s = typeof v === "string" ? v : String(v);
    const key = k.length > 40 ? k.slice(0, 40) : k;
    out[key] = s.length > 500 ? s.slice(0, 490) + "…[trunc]" : s;
  }
  return out;
}

/**
 * POST /api/portal/store/checkout-saved-card
 *
 * Portal store checkout for members who ALREADY have a card on
 * file (member.stripeCustomerId + defaultPaymentMethodId set).
 * Charges the saved card off-session in one round trip, then
 * runs the exact same cart -> POSTransaction + Membership +
 * welcome-email pipeline the Stripe-hosted-checkout webhook
 * uses (processPortalStoreCheckout). No card-entry UI is
 * exposed here -- members without a card get 400'd and are
 * expected to add one from Profile -> Payment Methods first.
 *
 * Currently Stripe-only. PayPal / Square get an error so the
 * portal can fall back to whatever flow they already have.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { items } = await req.json();
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      clientId: true,
      stripeCustomerId: true,
      defaultPaymentMethodId: true,
    },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const clientId = member.clientId;

  const processor = await getActiveProcessor(clientId);
  if (processor !== "stripe") {
    return NextResponse.json(
      { error: "Saved-card checkout is only available on Stripe. Use standard checkout." },
      { status: 400 },
    );
  }

  if (!member.stripeCustomerId || !member.defaultPaymentMethodId) {
    return NextResponse.json(
      { error: "No card on file. Add a card in Profile → Payment Methods to purchase memberships from the portal." },
      { status: 400 },
    );
  }

  // Split cart into POS items vs. membership plan items using the
  // same "plan_" prefix convention the existing checkout endpoint
  // uses.
  const posItemIds: string[] = [];
  const planItemIds: string[] = [];
  for (const cartItem of items) {
    if (typeof cartItem.itemId !== "string") continue;
    if (cartItem.itemId.startsWith("plan_")) {
      planItemIds.push(cartItem.itemId.replace("plan_", ""));
    } else {
      posItemIds.push(cartItem.itemId);
    }
  }

  // Fetch POS items with variants, scoped to this tenant so a
  // spoofed id can't pull a foreign gym's item into the cart.
  const posItems = posItemIds.length > 0
    ? await prisma.pOSItem.findMany({
        where: { id: { in: posItemIds }, isActive: true, clientId },
        include: { variants: true },
      })
    : [];
  const posItemMap = new Map(posItems.map((i) => [i.id, i]));

  // Membership plans -- REQUIRE availableOnline. Even though the
  // /api/portal/store/items endpoint filters to online-available
  // plans already, re-enforce here so a client that spoofs a
  // plan id can't purchase an in-house-only plan.
  const plans = planItemIds.length > 0
    ? await prisma.membershipPlan.findMany({
        where: { id: { in: planItemIds }, isActive: true, availableOnline: true, clientId },
      })
    : [];
  const planMap = new Map(plans.map((p) => [`plan_${p.id}`, p]));

  // Validate + total up, mirroring the shape /checkout produces.
  let subtotalCents = 0;
  for (const cartItem of items) {
    if (typeof cartItem.itemId !== "string") {
      return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
    }
    if (cartItem.itemId.startsWith("plan_")) {
      const plan = planMap.get(cartItem.itemId);
      if (!plan) {
        return NextResponse.json(
          { error: "Membership plan not found or not available online" },
          { status: 400 },
        );
      }
      subtotalCents += (plan.priceCents ?? 0) * (cartItem.quantity || 1);
    } else {
      const posItem = posItemMap.get(cartItem.itemId);
      if (!posItem) {
        return NextResponse.json({ error: `Item not found: ${cartItem.itemId}` }, { status: 400 });
      }
      const qty = cartItem.quantity || 1;
      if (posItem.variants.length > 0) {
        const variant = posItem.variants.find(
          (v) =>
            (v.size || null) === (cartItem.selectedSize || null) &&
            (v.color || null) === (cartItem.selectedColor || null),
        );
        const availableStock = variant ? variant.quantity : 0;
        if (availableStock < qty) {
          const varLabel = [cartItem.selectedSize, cartItem.selectedColor].filter(Boolean).join(" / ");
          return NextResponse.json(
            { error: `Insufficient stock for "${posItem.name}${varLabel ? ` (${varLabel})` : ""}". Available: ${availableStock}` },
            { status: 400 },
          );
        }
      } else if (posItem.quantity > 0 && posItem.quantity < qty) {
        return NextResponse.json(
          { error: `Insufficient stock for "${posItem.name}". Available: ${posItem.quantity}` },
          { status: 400 },
        );
      }
      subtotalCents += posItem.priceCents * qty;
    }
  }

  // Tax exactly the same way the hosted checkout does so the
  // amount matches what the receipt / activity log shows.
  const taxSetting = await prisma.settings.findUnique({
    where: { key_clientId: { key: "taxRate", clientId } },
  });
  const taxRatePercent = taxSetting ? Number(taxSetting.value) : 0;
  const taxCents = taxRatePercent > 0 ? Math.round((subtotalCents * taxRatePercent) / 100) : 0;
  const totalCents = subtotalCents + taxCents;

  if (totalCents <= 0) {
    return NextResponse.json({ error: "Cart total must be greater than $0" }, { status: 400 });
  }

  const currency = await getCurrency(clientId);

  const stripeClient = await getStripeClient(clientId);
  if (!stripeClient) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  let paymentIntentId: string;
  try {
    // off_session=true + confirm=true attempts the charge against
    // the saved payment method synchronously. `cartItems` is
    // stashed in metadata BUT no `source` field is set that
    // handleCheckoutCompleted keys on, so the Stripe webhook's
    // payment_intent.succeeded handler is a no-op for this PI
    // (it only acts on payment intents that carry an invoiceId)
    // -- the cart is processed synchronously below instead.
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: totalCents,
      currency: currency.toLowerCase(),
      customer: member.stripeCustomerId,
      payment_method: member.defaultPaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: sanitizeStripeMetadata({
        source: "portal_store_saved_card",
        memberId: member.id,
        clientId,
      }),
    });
    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { success: false, error: `Payment status: ${paymentIntent.status}` },
        { status: 400 },
      );
    }
    paymentIntentId = paymentIntent.id;
  } catch (error: unknown) {
    console.error("[portal/store/checkout-saved-card] Stripe charge failed:", error);
    const message = error instanceof Error ? error.message : "Payment failed";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  // Charge succeeded -- run the same cart-processing pipeline the
  // Stripe-hosted-checkout webhook uses so the POSTransaction,
  // Memberships, welcome email, style assignment, and inventory
  // decrements all fire the same way.
  try {
    await processPortalStoreCheckout({
      externalPaymentId: paymentIntentId,
      processor: "stripe",
      metadata: {
        memberId: member.id,
        clientId,
        cartItems: JSON.stringify(items),
      },
      amountTotalCents: totalCents,
      taxCents,
    });
  } catch (err) {
    // Payment already succeeded -- don't fail the request. Log so
    // an admin can reconcile if the downstream side effects need
    // to be re-run manually.
    console.error("[portal/store/checkout-saved-card] processPortalStoreCheckout failed after successful charge:", err, { paymentIntentId });
    return NextResponse.json(
      {
        success: true,
        paymentIntentId,
        warning: "Payment charged successfully but portal processing hit an error. Contact the gym to reconcile.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ success: true, paymentIntentId });
}
