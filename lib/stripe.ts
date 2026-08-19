import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * This file exposes TWO Stripe entry points -- kept side-by-side on
 * purpose because they're aimed at very different flows:
 *
 * 1. `getStripeClient(clientId)`  -- TENANT-scoped. Used by member-
 *    billing code (POS, portal, member cards). Reads the per-gym
 *    Settings row `payment_stripe_secret_key` first, falls back to
 *    the STRIPE_SECRET_KEY env var. Never call without a clientId --
 *    picking a key without tenant context risks routing a charge
 *    into a different gym's Stripe account.
 *
 * 2. `getStripe()` + `isStripeConfigured()` -- PLATFORM-scoped. Used
 *    by the Dojo Storm subscription billing (charging gym owners
 *    for their tier). Reads STRIPE_SECRET_KEY directly; there's only
 *    one "platform" to bill. Also stamps every Product/Customer/
 *    Subscription with a `platform` metadata tag so bookkeeping can
 *    separate platform revenue from gym-member revenue when both
 *    flow through the same Stripe account.
 *
 * Required env vars for platform billing:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Optional:
 *   STRIPE_PUBLISHABLE_KEY (only if you add client-side Stripe.js)
 *   STRIPE_PLATFORM_METADATA (defaults to "dojostorm-platform")
 */

// ---------------------------------------------------------------------------
// Tenant-scoped (member billing) -- pre-existing API
// ---------------------------------------------------------------------------

/**
 * Get a Stripe client scoped to a specific tenant. Prefers the per-tenant
 * payment_stripe_secret_key Settings row (set by each gym in Account →
 * Payments), falls back to the STRIPE_SECRET_KEY env var as a
 * platform-wide default.
 *
 * clientId is REQUIRED because Stripe keys are per-gym: without it we
 * could pick another tenant's secret and route the charge into their
 * account. The audit found this as the single most severe leak before
 * launch. Callers that legitimately have no tenant context (Stripe
 * webhooks) must resolve the tenant from the event's metadata first.
 *
 * Priority is DB-first so that env vars set by the platform operator
 * can't silently override a gym's own Stripe credentials.
 *
 * Returns null if no key is configured anywhere.
 */
export async function getStripeClient(clientId: string): Promise<Stripe | null> {
  let key: string | undefined;
  const row = await prisma.settings.findUnique({
    where: { key_clientId: { key: "payment_stripe_secret_key", clientId } },
  });
  key = row?.value || undefined;
  if (!key) {
    key = process.env.STRIPE_SECRET_KEY;
  }
  if (!key) return null;
  return new Stripe(key, { typescript: true });
}

// ---------------------------------------------------------------------------
// Platform-scoped (Dojo Storm subscription billing)
// ---------------------------------------------------------------------------

let cachedPlatformClient: Stripe | null = null;

/** Returns true when STRIPE_SECRET_KEY is set. Platform routes should
 *  check this before touching Stripe so they can fail with a clear
 *  message instead of throwing from inside the SDK. */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Lazy-instantiated PLATFORM Stripe client (for Dojo Storm's own
 *  subscription billing). Throws with a specific error message if
 *  STRIPE_SECRET_KEY is missing -- caller is expected to gate on
 *  isStripeConfigured() first for a graceful UX. */
export function getStripe(): Stripe {
  if (cachedPlatformClient) return cachedPlatformClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to the environment (Vercel > Settings > Environment Variables) to enable platform subscription billing.",
    );
  }
  cachedPlatformClient = new Stripe(key, {
    typescript: true,
    appInfo: {
      name: "Dojo Storm Software",
      url: "https://dojostormsoftware.com",
    },
  });
  return cachedPlatformClient;
}

/** Metadata tag stamped on every Product / Customer / Subscription
 *  the platform module creates. Lets bookkeeping / reports filter
 *  platform revenue out of a shared Stripe account. */
export function platformMetadata(extra: Record<string, string> = {}): Record<string, string> {
  return {
    source: process.env.STRIPE_PLATFORM_METADATA || "dojostorm-platform",
    ...extra,
  };
}
