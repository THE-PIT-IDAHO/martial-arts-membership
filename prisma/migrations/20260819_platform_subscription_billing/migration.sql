-- Platform subscription billing. These columns track the Client's
-- subscription to the Dojo Storm SaaS itself (paid by the gym owner),
-- NOT the gym's own member billing. Populated when the owner completes
-- a Stripe Checkout on /settings/subscription. All nullable + no
-- defaults: existing gyms stay on their current grandfathered/trial
-- tier until they choose to subscribe.
ALTER TABLE "Client" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Client" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Client" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Client" ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "subscriptionCancelAt" TIMESTAMP(3);

-- PricingTier -> Stripe Product / Price mapping. Populated by the
-- /admin/pricing "Sync to Stripe" button; the checkout / portal /
-- change routes read stripePriceId from here.
ALTER TABLE "PricingTier" ADD COLUMN "stripeProductId" TEXT;
ALTER TABLE "PricingTier" ADD COLUMN "stripePriceId" TEXT;
