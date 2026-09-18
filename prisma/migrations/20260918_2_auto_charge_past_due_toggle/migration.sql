-- Per-member kill switch for the dunning loop. Default TRUE
-- keeps existing behavior (past-due invoices auto-retry) for
-- every current member; admin can flip individual members to
-- FALSE from the profile to require manual charging via the
-- "Charge Now" button. Fresh recurring cycles are unaffected --
-- they still auto-generate + charge as the "set" auto-pay.
ALTER TABLE "Member"
  ADD COLUMN "autoChargePastDueEnabled" BOOLEAN NOT NULL DEFAULT true;
