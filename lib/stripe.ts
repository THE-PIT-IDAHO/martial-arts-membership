import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * Get a Stripe client using the admin-configured key from Settings,
 * falling back to the STRIPE_SECRET_KEY environment variable.
 * Returns null if no key is configured anywhere.
 */
export async function getStripeClient(): Promise<Stripe | null> {
  const row = await prisma.settings.findUnique({
    where: { key: "payment_stripe_secret_key" },
  });
  const key = row?.value || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { typescript: true });
}
