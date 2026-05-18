import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * Get a Stripe client. Prefers STRIPE_SECRET_KEY from environment variables
 * (recommended — keeps the secret out of the DB), falls back to the
 * payment_stripe_secret_key Settings row for legacy / self-hosted setups.
 * Returns null if no key is configured anywhere.
 */
export async function getStripeClient(): Promise<Stripe | null> {
  let key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const row = await prisma.settings.findFirst({
      where: { key: "payment_stripe_secret_key" },
    });
    key = row?.value || undefined;
  }
  if (!key) return null;
  return new Stripe(key, { typescript: true });
}
