import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

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
