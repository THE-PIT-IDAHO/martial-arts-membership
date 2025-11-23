-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dateOfBirth" DATETIME,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "parentGuardianName" TEXT,
    "notes" TEXT,
    "rank" TEXT,
    "startDate" DATETIME,
    "programEnrollment" TEXT,
    "uniformSize" TEXT,
    "medicalNotes" TEXT,
    "waiverSigned" BOOLEAN NOT NULL DEFAULT false,
    "waiverSignedAt" DATETIME,
    "membershipType" TEXT,
    "clientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Member_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("clientId", "createdAt", "email", "firstName", "id", "lastName", "phone", "status", "updatedAt") SELECT "clientId", "createdAt", "email", "firstName", "id", "lastName", "phone", "status", "updatedAt" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
