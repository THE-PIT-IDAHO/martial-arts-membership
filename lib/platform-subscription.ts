import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, platformMetadata } from "@/lib/stripe";

/**
 * Helpers around a Client's PLATFORM subscription (their subscription
 * to the Dojo Storm SaaS itself). Kept in one place so the checkout /
 * change / portal / webhook routes stay short.
 */

export type SubscriptionSnapshot = {
  clientId: string;
  clientName: string;
  currentTierId: string | null;
  currentTierName: string | null;
  currentTierPriceCents: number | null;
  billingPeriod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: Date | null;
  subscriptionCancelAt: Date | null;
  trialExpiresAt: Date | null;
  /** True when there is no live subscription and the trial window is
   *  still open (trialExpiresAt in the future). */
  isOnTrial: boolean;
  /** True when the trial window has ended and there is no live paid
   *  subscription. UI shows an "add payment method" prompt. */
  isTrialExpired: boolean;
};

export async function getSubscriptionSnapshot(clientId: string): Promise<SubscriptionSnapshot> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      currentTierId: true,
      trialExpiresAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      subscriptionCancelAt: true,
    },
  });
  if (!client) throw new Error(`Client ${clientId} not found`);

  let tierName: string | null = null;
  let tierPrice: number | null = null;
  let tierPeriod: string | null = null;
  if (client.currentTierId) {
    const tier = await prisma.pricingTier.findUnique({
      where: { id: client.currentTierId },
      select: { name: true, priceCents: true, billingPeriod: true },
    });
    if (tier) {
      tierName = tier.name;
      tierPrice = tier.priceCents;
      tierPeriod = tier.billingPeriod;
    }
  }

  const now = Date.now();
  const trialEnd = client.trialExpiresAt?.getTime() ?? null;
  const hasLiveSub =
    !!client.stripeSubscriptionId &&
    ["active", "trialing", "past_due"].includes(client.subscriptionStatus || "");
  const isOnTrial = !hasLiveSub && !!trialEnd && trialEnd > now;
  const isTrialExpired = !hasLiveSub && !!trialEnd && trialEnd <= now;

  return {
    clientId: client.id,
    clientName: client.name,
    currentTierId: client.currentTierId,
    currentTierName: tierName,
    currentTierPriceCents: tierPrice,
    billingPeriod: tierPeriod,
    stripeCustomerId: client.stripeCustomerId,
    stripeSubscriptionId: client.stripeSubscriptionId,
    subscriptionStatus: client.subscriptionStatus,
    subscriptionCurrentPeriodEnd: client.subscriptionCurrentPeriodEnd,
    subscriptionCancelAt: client.subscriptionCancelAt,
    trialExpiresAt: client.trialExpiresAt,
    isOnTrial,
    isTrialExpired,
  };
}

/**
 * Return the Stripe Customer id for this Client, creating one on
 * first use. Idempotent: safe to call before every checkout. Uses
 * the OWNER's email + gym name for the Customer record so invoices
 * downstream carry a recognizable identity.
 */
export async function ensureStripeCustomer(clientId: string): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, slug: true, stripeCustomerId: true },
  });
  if (!client) throw new Error(`Client ${clientId} not found`);
  if (client.stripeCustomerId) return client.stripeCustomerId;

  // Pull the OWNER's email as the Customer contact. If there is more
  // than one OWNER, use the earliest-created (typically the founder).
  const owner = await prisma.user.findFirst({
    where: { clientId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true },
  });

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: owner?.email || undefined,
    name: client.name,
    metadata: platformMetadata({
      clientId: client.id,
      clientSlug: client.slug,
    }),
  });

  await prisma.client.update({
    where: { id: clientId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Copy the interesting fields off a Stripe Subscription onto our
 * Client row. Called from the webhook handler on every subscription
 * lifecycle event so our snapshot never drifts from Stripe.
 */
export async function applySubscriptionToClient(
  clientId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  // Which PricingTier does the first subscription item's price belong
  // to? Match by stripePriceId. If we can't find a match, keep the
  // existing currentTierId -- the operator may have removed the tier
  // row after the subscription was created.
  const priceId = subscription.items.data[0]?.price?.id || null;
  let tierId: string | null = null;
  if (priceId) {
    const tier = await prisma.pricingTier.findFirst({
      where: { stripePriceId: priceId },
      select: { id: true },
    });
    tierId = tier?.id ?? null;
  }

  // Stripe moved current_period_end from Subscription onto each
  // SubscriptionItem (since API 2025-04). Our subscriptions only
  // ever have one item (one tier per gym), so item[0] is authoritative.
  const item = subscription.items.data[0];
  const rawPeriodEnd = item?.current_period_end;
  const periodEnd =
    typeof rawPeriodEnd === "number" ? new Date(rawPeriodEnd * 1000) : null;
  const cancelAt =
    typeof subscription.cancel_at === "number"
      ? new Date(subscription.cancel_at * 1000)
      : null;

  await prisma.client.update({
    where: { id: clientId },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: periodEnd,
      subscriptionCancelAt: cancelAt,
      // Only update currentTierId when we matched; otherwise leave
      // whatever the operator set most recently.
      ...(tierId ? { currentTierId: tierId } : {}),
    },
  });
}

/** Look up the Client by its Stripe Customer id. Used by the webhook
 *  handler to route events back to the right gym. */
export async function findClientByStripeCustomerId(
  customerId: string,
): Promise<{ id: string } | null> {
  return prisma.client.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
}
