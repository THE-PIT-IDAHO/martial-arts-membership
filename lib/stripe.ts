import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * Get a Stripe client. Prefers the per-tenant payment_stripe_secret_key
 * Settings row (set by each gym in Account → Payments), falls back to the
 * STRIPE_SECRET_KEY env var as a platform-wide default.
 *
 * Priority is DB-first so that env vars set by the platform operator can't
 * silently override a gym's own Stripe credentials.
 *
 * Returns null if no key is configured anywhere.
 */
export async function getStripeClient(): Promise<Stripe | null> {
  let key: string | undefined;
  const row = await prisma.settings.findFirst({
    where: { key: "payment_stripe_secret_key" },
  });
  key = row?.value || undefined;
  if (!key) {
    key = process.env.STRIPE_SECRET_KEY;
  }
  if (!key) return null;
  return new Stripe(key, { typescript: true });
}
