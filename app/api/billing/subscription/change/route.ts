import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminSessionToken } from "@/lib/admin-auth";
import { getClientId } from "@/lib/tenant";
import { getStripe, isStripeConfigured, platformMetadata } from "@/lib/stripe";
import { applySubscriptionToClient } from "@/lib/platform-subscription";

/**
 * POST /api/billing/subscription/change  { tierId: string }
 *
 * Change an EXISTING subscription to a different tier. Uses
 * subscription.update() with proration_behavior "create_prorations"
 * so the customer is charged the pro-rated difference immediately
 * on upgrade and credited on downgrade.
 *
 * If the customer doesn't have a live subscription yet, this returns
 * a 400 telling them to use /checkout instead (which is what the UI
 * does anyway for first-time subscriptions).
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
        { error: "Stripe is not configured." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const tierId = String(body.tierId || "");
    if (!tierId) return NextResponse.json({ error: "tierId is required" }, { status: 400 });

    const clientId = await getClientId(req);
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { stripeSubscriptionId: true, subscriptionStatus: true },
    });
    if (!client?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription. Use checkout to start a new one." },
        { status: 400 },
      );
    }

    const tier = await prisma.pricingTier.findUnique({ where: { id: tierId } });
    if (!tier || !tier.isActive) {
      return NextResponse.json({ error: "Tier not found or inactive" }, { status: 404 });
    }
    if (!tier.stripePriceId) {
      return NextResponse.json(
        {
          error:
            "Target tier has not been synced to Stripe yet. Ask the platform admin to run \"Sync to Stripe\".",
        },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    // Pull the current subscription so we know which item to swap.
    const sub = await stripe.subscriptions.retrieve(client.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json(
        { error: "Existing subscription has no items -- reach out for help." },
        { status: 500 },
      );
    }

    const updated = await stripe.subscriptions.update(client.stripeSubscriptionId, {
      items: [{ id: itemId, price: tier.stripePriceId }],
      // Upgrade -> immediate proration charge. Downgrade -> credit
      // applied to next invoice. Standard SaaS behavior.
      proration_behavior: "create_prorations",
      metadata: platformMetadata({
        clientId,
        tierId: tier.id,
        tierName: tier.name,
      }),
    });

    // Fast-path: update our Client immediately so the UI reflects the
    // change without waiting on the webhook round-trip. Webhook will
    // re-apply this same data shortly, which is idempotent.
    await applySubscriptionToClient(clientId, updated);

    return NextResponse.json({ ok: true, subscriptionId: updated.id, status: updated.status });
  } catch (err) {
    console.error("[billing/subscription/change] fatal:", err);
    const msg = err instanceof Error ? err.message : "Tier change failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
