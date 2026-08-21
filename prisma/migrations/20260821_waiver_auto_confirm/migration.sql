-- Waivers no longer require admin confirmation. A signed waiver is
-- treated as complete from the moment the visitor submits it, and
-- the acknowledgment email fires on submit. The admin "Confirm" step
-- has been removed from the UI + API entirely.
--
-- Backfill: everything sitting in confirmed=false becomes confirmed=true
-- (they were legit waivers that just never had an admin click the button).
UPDATE "SignedWaiver" SET "confirmed" = true, "confirmedAt" = COALESCE("confirmedAt", "signedAt") WHERE "confirmed" = false;

-- Also flip the default on new rows so any lingering create() that
-- forgets to set `confirmed` still lands as true.
ALTER TABLE "SignedWaiver" ALTER COLUMN "confirmed" SET DEFAULT true;
