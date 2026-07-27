-- Tracks the portion of an invoice paid out of the member's account
-- credit balance before the card was charged. Enables the "credit
-- first, then card" auto-billing rule without silently reducing
-- amountCents (which is the original amount owed and should stay
-- immutable so invoice history reads cleanly).
ALTER TABLE "Invoice" ADD COLUMN "creditAppliedCents" INTEGER NOT NULL DEFAULT 0;
