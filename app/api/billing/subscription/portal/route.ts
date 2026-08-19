import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminSessionToken } from "@/lib/admin-auth";
import { getClientId } from "@/lib/tenant";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

/**
 * POST /api/billing/subscription/portal
 *
 * Creates a Stripe Customer Portal session for the current gym owner
 * and returns its URL. Caller redirects the browser there. The
 * hosted portal lets the customer:
 *  - Update card on file
 *  - Cancel subscription (schedules cancel_at_period_end)
 *  - Download past invoices
 *  - Update billing email / address
 *
 * Requires the customer already has a Stripe Customer id (which
 * happens the first time they run through Checkout). If they don't,
 * returns 400 -- the UI won't show the "Manage subscription" button
 * in that state anyway.
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

    const clientId = await getClientId(req);
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { stripeCustomerId: true },
    });
    if (!client?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No Stripe Customer on file yet. Subscribe first via checkout." },
        { status: 400 },
      );
    }

    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: `${origin}/settings/subscription`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("[billing/subscription/portal] fatal:", err);
    const msg = err instanceof Error ? err.message : "Portal session failed";
    // Stripe throws a specific error if the Portal isn't configured in
    // the dashboard (dashboard > Settings > Billing > Customer Portal
    // > Activate). Bubble a hint up so the operator knows what to do.
    if (msg.toLowerCase().includes("customer portal")) {
      return NextResponse.json(
        {
          error:
            "Stripe Customer Portal isn't activated yet. Go to Stripe Dashboard → Settings → Billing → Customer Portal → Activate, then try again.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
