import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { isStripeConfigured } from "@/lib/stripe";
import { syncAllTiersToStripe } from "@/lib/stripe-sync";

/**
 * POST /api/admin/tiers/sync-stripe -- platform admin only.
 *
 * Fires off the Stripe Product / Price sync for every active tier.
 * Called by the "Sync to Stripe" button on /admin/pricing. Returns
 * a per-tier summary so the UI can show what changed.
 */
export async function POST(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured. Add STRIPE_SECRET_KEY to the environment (Vercel > Settings > Environment Variables) and try again.",
        },
        { status: 400 },
      );
    }

    const results = await syncAllTiersToStripe();
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[admin/tiers/sync-stripe] fatal:", err);
    const msg = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
