-- Adds a "founderOnly" flag to PricingTier so the software owner's
-- internal tier stays out of the plan picker for every other gym.
-- The GET /api/plan endpoint filters these out unless the current
-- tenant is a platform-admin Client; PATCH also blocks the switch
-- server-side as defense-in-depth.
ALTER TABLE "PricingTier" ADD COLUMN "founderOnly" BOOLEAN NOT NULL DEFAULT false;

-- Seed a "Founder" tier (only if one doesn't already exist) so the
-- platform-admin gym has something to pick. Uses a stable known id
-- so re-running this migration on an env that already has it is a
-- no-op. Enterprise-tier limits (999999 across the board) plus every
-- payment integration enabled, at zero price. Nothing here touches
-- any pre-existing tier row.
INSERT INTO "PricingTier" (
  "id", "name", "description", "priceCents", "billingPeriod",
  "maxMembers", "maxStyles", "maxRanksPerStyle", "maxMembershipPlans", "maxClasses",
  "maxUsers", "maxLocations", "maxReports", "maxPOSItems",
  "allowStripe", "allowPaypal", "allowSquare", "isActive", "sortOrder", "founderOnly",
  "createdAt", "updatedAt"
)
SELECT
  'founder-tier-seed', 'Founder',
  'Reserved for the software owner. Enterprise access at no cost.',
  0, 'monthly',
  999999, 999999, 999999, 999999, 999999,
  999999, 999999, 999999, 999999,
  true, true, true, true, 999, true,
  NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "PricingTier" WHERE "founderOnly" = true);
