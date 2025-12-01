-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MembershipPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER,
    "setupFeeCents" INTEGER,
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "contractLengthMonths" INTEGER,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "classesPerWeek" INTEGER,
    "classesPerMonth" INTEGER,
    "allowedStyles" TEXT,
    "familyDiscountPercent" INTEGER,
    "trialDays" INTEGER,
    "promoCode" TEXT,
    "cancellationNoticeDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT NOT NULL,
    CONSTRAINT "MembershipPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MembershipPlan" ("billingCycle", "clientId", "description", "id", "isActive", "name", "priceCents") SELECT "billingCycle", "clientId", "description", "id", "isActive", "name", "priceCents" FROM "MembershipPlan";
DROP TABLE "MembershipPlan";
ALTER TABLE "new_MembershipPlan" RENAME TO "MembershipPlan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
