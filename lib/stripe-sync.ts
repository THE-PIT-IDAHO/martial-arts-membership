import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, platformMetadata } from "@/lib/stripe";

/**
 * Sync every paid PricingTier to a Stripe Product + Price.
 *
 *  - Free tiers (priceCents === 0) are skipped -- nothing to charge,
 *    so no Stripe object is needed.
 *  - Product is created on first sync (name/description from tier);
 *    subsequent syncs `update()` the Product so name / description
 *    edits in /admin/pricing propagate to Stripe.
 *  - Price is created on first sync. Stripe Prices are IMMUTABLE, so
 *    when priceCents or billingPeriod change we create a NEW price
 *    and archive the old one. stripePriceId always points at the
 *    currently-active price.
 *  - Both stripeProductId and stripePriceId are written back to the
 *    PricingTier row so the checkout / portal routes can read them.
 *
 * Returns a per-tier summary so the /admin/pricing UI can show what
 * happened. Any Stripe error on a single tier is caught and reported
 * in the summary; the sync continues with the next tier.
 */
export type SyncResult = {
  tierId: string;
  name: string;
  action: "created" | "updated" | "unchanged" | "skipped" | "error";
  detail: string;
  productId?: string | null;
  priceId?: string | null;
  error?: string;
};

/** Map our billingPeriod string to a Stripe Recurring interval. */
function toStripeInterval(period: string): Stripe.PriceCreateParams.Recurring.Interval {
  const p = (period || "").toLowerCase();
  if (p === "yearly" || p === "annual" || p === "annually") return "year";
  if (p === "weekly") return "week";
  if (p === "daily") return "day";
  return "month";
}

export async function syncAllTiersToStripe(): Promise<SyncResult[]> {
  const stripe = getStripe();
  const tiers = await prisma.pricingTier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
  });

  const results: SyncResult[] = [];
  for (const tier of tiers) {
    try {
      results.push(await syncOneTier(stripe, tier));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        tierId: tier.id,
        name: tier.name,
        action: "error",
        detail: `Sync failed: ${msg}`,
        error: msg,
      });
    }
  }
  return results;
}

async function syncOneTier(
  stripe: Stripe,
  tier: Awaited<ReturnType<typeof prisma.pricingTier.findFirst>> extends infer T ? NonNullable<T> : never,
): Promise<SyncResult> {
  // Free tiers have nothing to charge -- no Stripe object needed.
  if (tier.priceCents <= 0) {
    return {
      tierId: tier.id,
      name: tier.name,
      action: "skipped",
      detail: "Free tier -- no Stripe product needed.",
    };
  }

  const productMetadata = platformMetadata({
    tierId: tier.id,
    tierName: tier.name,
  });

  // 1) Product: create-or-update.
  let productId = tier.stripeProductId;
  let productAction: "created" | "updated" = "updated";
  if (!productId) {
    const product = await stripe.products.create({
      name: `Dojo Storm — ${tier.name}`,
      description: tier.description || undefined,
      metadata: productMetadata,
    });
    productId = product.id;
    productAction = "created";
  } else {
    await stripe.products.update(productId, {
      name: `Dojo Storm — ${tier.name}`,
      description: tier.description || undefined,
      metadata: productMetadata,
    });
  }

  // 2) Price: create-if-missing OR create-new-and-archive-old when
  //    amount / interval changed. Stripe Prices are immutable, so
  //    "updating" a price is really: make a new one, deactivate the old.
  const interval = toStripeInterval(tier.billingPeriod);
  const existingPrice = tier.stripePriceId
    ? await stripe.prices.retrieve(tier.stripePriceId).catch(() => null)
    : null;

  const priceMatches =
    existingPrice &&
    existingPrice.active &&
    existingPrice.unit_amount === tier.priceCents &&
    existingPrice.currency === "usd" &&
    existingPrice.recurring?.interval === interval;

  let priceId = tier.stripePriceId;
  let priceAction: "created" | "unchanged" = "unchanged";
  if (!priceMatches) {
    const newPrice = await stripe.prices.create({
      product: productId,
      unit_amount: tier.priceCents,
      currency: "usd",
      recurring: { interval },
      metadata: productMetadata,
    });
    priceId = newPrice.id;
    priceAction = "created";
    // Archive the previous price if there was one (Stripe won't let
    // you delete prices attached to subscriptions; deactivating them
    // just hides them from new checkouts -- existing subscriptions
    // stay grandfathered on the old price until they upgrade).
    if (existingPrice && existingPrice.id !== newPrice.id) {
      await stripe.prices.update(existingPrice.id, { active: false }).catch(() => {
        // Best-effort archive; not a fatal error.
      });
    }
  }

  // 3) Persist back to the tier row.
  await prisma.pricingTier.update({
    where: { id: tier.id },
    data: { stripeProductId: productId, stripePriceId: priceId },
  });

  const action: SyncResult["action"] =
    productAction === "created" || priceAction === "created" ? "created" : "unchanged";
  const detail = describeAction(productAction, priceAction);
  return {
    tierId: tier.id,
    name: tier.name,
    action: action === "created" && productAction === "updated" ? "updated" : action,
    detail,
    productId,
    priceId,
  };
}

function describeAction(
  productAction: "created" | "updated",
  priceAction: "created" | "unchanged",
): string {
  if (productAction === "created" && priceAction === "created") {
    return "Created Stripe Product + Price.";
  }
  if (priceAction === "created") {
    return "Product up-to-date; created new Price (old archived).";
  }
  return "Product refreshed; Price unchanged.";
}
