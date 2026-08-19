import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminSessionToken } from "@/lib/admin-auth";
import { getClientId } from "@/lib/tenant";
import { getStripe, isStripeConfigured, platformMetadata } from "@/lib/stripe";
import { ensureStripeCustomer } from "@/lib/platform-subscription";

/**
 * POST /api/billing/subscription/checkout  { tierId: string }
 *
 * Creates a Stripe Checkout Session for the given tier and returns
 * its hosted URL. Caller (the /settings/subscription page) redirects
 * the browser to that URL; Stripe collects the card + completes the
 * subscription creation server-side.
 *
 * On success the webhook (customer.subscription.created / .updated)
 * writes the subscription onto the Client. The success redirect just
 * bounces back to /settings/subscription with a success flag so the
 * UI can refresh.
 *
 * Guards:
 *  - OWNER-only
 *  - Stripe must be configured
 *  - Tier must be active, priced (priceCents > 0), and already synced
 *    to Stripe (has stripePriceId)
 */
export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/admin_session=([^;]+)/);
    if (!match) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await validateAdminSessionToken(match[1]);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const tierId = String(body.tierId || "");
    if (!tierId) return NextResponse.json({ error: "tierId is required" }, { status: 400 });

    const tier = await prisma.pricingTier.findUnique({ where: { id: tierId } });
    if (!tier || !tier.isActive) {
      return NextResponse.json({ error: "Tier not found or inactive" }, { status: 404 });
    }
    if (tier.priceCents <= 0) {
      return NextResponse.json(
        { error: "This tier is free -- no checkout needed." },
        { status: 400 },
      );
    }
    if (!tier.stripePriceId) {
      return NextResponse.json(
        {
          error:
            "This tier has not been synced to Stripe yet. Ask the platform admin to run \"Sync to Stripe\" from /admin/pricing.",
        },
        { status: 400 },
      );
    }

    const clientId = await getClientId(req);
    const customerId = await ensureStripeCustomer(clientId);

    // Success + cancel redirects back to /settings/subscription on the
    // same host the caller came from. We use the request's own origin
    // so the flow works on any tenant subdomain without config.
    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: tier.stripePriceId, quantity: 1 }],
      success_url: `${origin}/settings/subscription?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/subscription?canceled=1`,
      allow_promotion_codes: true,
      // billing_address_collection auto -- Stripe decides based on
      // whether tax settings require an address. Keeps the flow short
      // for US-only customers today.
      billing_address_collection: "auto",
      subscription_data: {
        metadata: platformMetadata({
          clientId,
          tierId: tier.id,
          tierName: tier.name,
        }),
      },
      metadata: platformMetadata({
        clientId,
        tierId: tier.id,
      }),
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[billing/subscription/checkout] fatal:", err);
    const msg = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
