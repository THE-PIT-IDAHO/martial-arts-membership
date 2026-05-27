-- Drop the global @unique on membershipId — it caused cross-tenant
-- collisions when the per-tenant auto-generator picked an id that
-- another gym already used.
DROP INDEX IF EXISTS "MembershipPlan_membershipId_key";

-- Add a per-tenant unique to keep ids unique within each gym.
CREATE UNIQUE INDEX IF NOT EXISTS "MembershipPlan_membershipId_clientId_key"
  ON "MembershipPlan"("membershipId", "clientId");
