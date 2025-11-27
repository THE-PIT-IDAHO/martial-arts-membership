/*
  Warnings:

  - You are about to drop the column `programEnrollment` on the `Member` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "MemberRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberRelationship_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberRelationship_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "primaryStyle" TEXT,
    "stylesNotes" TEXT,
    "paymentNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "dateOfBirth" DATETIME,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "parentGuardianName" TEXT,
    "notes" TEXT,
    "startDate" DATETIME,
    "rank" TEXT,
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
INSERT INTO "new_Member" ("address", "city", "clientId", "createdAt", "dateOfBirth", "email", "emergencyContactName", "emergencyContactPhone", "firstName", "id", "lastName", "medicalNotes", "membershipType", "notes", "parentGuardianName", "paymentNotes", "phone", "photoUrl", "primaryStyle", "rank", "startDate", "state", "status", "stylesNotes", "uniformSize", "updatedAt", "waiverSigned", "waiverSignedAt", "zipCode") SELECT "address", "city", "clientId", "createdAt", "dateOfBirth", "email", "emergencyContactName", "emergencyContactPhone", "firstName", "id", "lastName", "medicalNotes", "membershipType", "notes", "parentGuardianName", "paymentNotes", "phone", "photoUrl", "primaryStyle", "rank", "startDate", "state", "status", "stylesNotes", "uniformSize", "updatedAt", "waiverSigned", "waiverSignedAt", "zipCode" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
