-- Bundles Phase 2: memberships + services can now be included in a
-- bundle alongside products. Exactly one of productId /
-- membershipPlanId / servicePackageId is populated per BundleItem
-- row, matching the row's `kind`.
ALTER TABLE "BundleItem" ADD COLUMN "membershipPlanId" TEXT;
ALTER TABLE "BundleItem" ADD COLUMN "servicePackageId" TEXT;
