-- Plan-level toggle for when a class-pack credit is consumed:
-- false (default) = burn when admin CONFIRMS attendance
-- true            = burn as soon as the member SIGNS IN (row exists)
ALTER TABLE "MembershipPlan"
  ADD COLUMN "expireOnSignIn" BOOLEAN NOT NULL DEFAULT false;
