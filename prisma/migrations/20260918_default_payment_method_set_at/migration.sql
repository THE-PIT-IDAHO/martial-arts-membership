-- Timestamp of when Member.defaultPaymentMethodId was last set.
-- The dunning loop reads this to skip PAST_DUE invoices whose
-- createdAt predates the current card, so adding a card to a
-- member with outstanding balances doesn't retroactively auto-
-- charge those pre-existing invoices. Admin retains manual
-- control via the "Charge Now" button on each invoice.
ALTER TABLE "Member"
  ADD COLUMN "defaultPaymentMethodSetAt" TIMESTAMP;

-- Backfill for rows that already have a card on file. Setting
-- the timestamp to the member's createdAt means every existing
-- invoice is "≥ setAt" (since invoice.createdAt cannot predate
-- member.createdAt), so the dunning loop's new guard preserves
-- current behavior for all legacy data -- only NEW cards added
-- after this migration get the "don't retroactively charge"
-- protection.
UPDATE "Member"
  SET "defaultPaymentMethodSetAt" = "createdAt"
  WHERE "defaultPaymentMethodId" IS NOT NULL
    AND "defaultPaymentMethodSetAt" IS NULL;
