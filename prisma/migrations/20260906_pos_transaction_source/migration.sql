-- Where each POS transaction was initiated:
--   STAFF     admin rang it up in the POS panel
--   PORTAL    member self-checkout through the portal store
--   AUTO_BILL Stripe off-session charge from the billing cron
-- Nullable; historical rows stay null and reports treat null as
-- STAFF (before this column existed, everything except invoiced
-- auto-bills went through the admin POS panel).
ALTER TABLE "POSTransaction"
  ADD COLUMN "source" TEXT;
