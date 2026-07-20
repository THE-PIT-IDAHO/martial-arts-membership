-- Invite-only tier flow: lets a PricingTier be hidden from every gym
-- by default and only exposed to gyms that were explicitly entitled
-- to it via a signup link. Backs the "Free Testing" tier.
--
--   * PricingTier.inviteOnly    -- tier is hidden unless entitled
--   * SignupLink.grantsTierId   -- link grants this tier to signups
--   * Client.grantedTierIds     -- JSON array of tier ids the client
--                                  can see beyond the public catalog
--
-- All three columns are additive with safe defaults, so no existing
-- row is affected. The seed insert is idempotent -- only runs if a
-- Free Testing tier isn't already on file.

ALTER TABLE "PricingTier" ADD COLUMN "inviteOnly"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SignupLink"  ADD COLUMN "grantsTierId"   TEXT;
ALTER TABLE "Client"      ADD COLUMN "grantedTierIds" TEXT;

INSERT INTO "PricingTier" (
  "id", "name", "description", "priceCents", "billingPeriod",
  "maxMembers", "maxStyles", "maxRanksPerStyle", "maxMembershipPlans", "maxClasses",
  "maxUsers", "maxLocations", "maxReports", "maxPOSItems",
  "allowStripe", "allowPaypal", "allowSquare", "isActive", "sortOrder",
  "founderOnly", "inviteOnly",
  "createdAt", "updatedAt"
)
SELECT
  'free-testing-tier-seed', 'Free Testing',
  'Full-featured trial. Only visible to gyms invited via a link.',
  0, 'monthly',
  999999, 999999, 999999, 999999, 999999,
  999999, 999999, 999999, 999999,
  true, true, true, true, 990,
  false, true,
  NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "PricingTier" WHERE "id" = 'free-testing-tier-seed');
