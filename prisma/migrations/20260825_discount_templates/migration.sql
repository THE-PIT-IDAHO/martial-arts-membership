-- Reusable discount templates ("Family Discount", "Coach Comp",
-- promo codes). Attaching a template to a member spawns a
-- MemberDiscount row prefilled from the template; templates and
-- attached rows are decoupled after that.
CREATE TABLE "DiscountTemplate" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL DEFAULT 'default-client',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "appliesTo" TEXT NOT NULL DEFAULT 'ALL',
  "percentOff" DOUBLE PRECISION,
  "flatCents" INTEGER,
  "oneTime" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscountTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscountTemplate_clientId_active_idx" ON "DiscountTemplate"("clientId", "active");

-- Lightweight back-reference on MemberDiscount so we can ask "which
-- members are using Family Discount"; NOT enforced with a FK -- a
-- template can be deleted without wiping attached rows.
ALTER TABLE "MemberDiscount" ADD COLUMN "templateId" TEXT;
