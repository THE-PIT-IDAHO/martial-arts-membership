-- Simplify class-pack fields per Cruz's follow-up feedback:
-- - Drop passDurationDays: a day pass is just a plan with
--   contractLengthMonths = "1 day". No dedicated column needed.
-- - Drop creditsRecurring: refill semantics come from the existing
--   autoRenew flag (autoRenew=true + classCredits set = refills each
--   cycle; autoRenew=false = one-shot pack).
-- - Drop creditExpiryDays: credit expiry is what the existing
--   contractLengthMonths already models when the plan is a class pack.
--
-- classCredits stays on MembershipPlan; remainingClassCredits +
-- creditsExpireAt stay on Membership. creditsExpireAt is now seeded
-- from Membership.contractEndDate (which is itself computed from the
-- plan's contractLengthMonths) instead of a separate plan column.
ALTER TABLE "MembershipPlan"
  DROP COLUMN IF EXISTS "passDurationDays",
  DROP COLUMN IF EXISTS "creditsRecurring",
  DROP COLUMN IF EXISTS "creditExpiryDays";
