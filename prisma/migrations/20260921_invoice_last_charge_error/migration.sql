-- Persist the last processor-decline reason on the invoice so the
-- dashboard Past Due card can label WHY a charge failed, and the
-- member profile's activity feed can surface each failed attempt
-- (retry count already lives on Invoice.retryCount).
-- Nullable; existing rows stay null until the next failed attempt.
ALTER TABLE "Invoice"
  ADD COLUMN "lastChargeError"   TEXT,
  ADD COLUMN "lastChargeErrorAt" TIMESTAMP;
