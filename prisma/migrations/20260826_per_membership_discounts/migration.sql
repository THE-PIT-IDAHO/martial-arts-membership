-- Per-membership discount scoping + plan-level opt-out.
--
-- MemberDiscount.membershipId: when set, the discount applies only
-- when auto-billing charges THAT specific membership. NULL keeps
-- the legacy behavior (member-scoped, hits any charge). Not a hard
-- FK -- a cancelled membership row's discounts get orphaned but
-- can still be cleaned up via API without a cascade dance.
ALTER TABLE "MemberDiscount" ADD COLUMN "membershipId" TEXT;
CREATE INDEX "MemberDiscount_membershipId_idx" ON "MemberDiscount"("membershipId");

-- MembershipPlan.eligibleForDiscounts: default true; flip false
-- for plans already at a promo price so template / per-member
-- discounts don't stack on top.
ALTER TABLE "MembershipPlan" ADD COLUMN "eligibleForDiscounts" BOOLEAN NOT NULL DEFAULT true;
