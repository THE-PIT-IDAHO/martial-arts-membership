-- Portal-cancellation cutoff (minutes before class start after which
-- a member can no longer cancel their booking). Blank = no restriction.
ALTER TABLE "ClassSession"
  ADD COLUMN "cancellationCutoffMins" INTEGER;
