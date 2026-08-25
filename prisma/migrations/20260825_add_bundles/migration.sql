-- Bundles: a "package deal" the POS sells as a single line -- pick
-- a bunch of products (with quantities), give the bundle one price.
-- On sale, inventory decrements for each contained product; tax
-- skips the bundle line entirely (Cruz's rule: items are free with
-- the bundle, no tax split).
CREATE TABLE "Bundle" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL DEFAULT 'default-client',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Bundle_clientId_idx" ON "Bundle"("clientId");

-- One row per product included in a bundle. `kind` stays a string so
-- a Phase 2 can add "membership" / "service" values without a
-- migration. `nameCached` survives the referenced POSItem being
-- renamed / deleted so the bundle card doesn't go blank.
CREATE TABLE "BundleItem" (
  "id" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'product',
  "productId" TEXT,
  "nameCached" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "selectedSize" TEXT,
  "selectedColor" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BundleItem_bundleId_idx" ON "BundleItem"("bundleId");

ALTER TABLE "BundleItem"
  ADD CONSTRAINT "BundleItem_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
