/*
  Warnings:

  - You are about to drop the column `endsAt` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `memberId` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `memberName` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `Appointment` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "priceCents" INTEGER,
    "color" TEXT DEFAULT '#6b7280',
    "coachId" TEXT,
    "coachName" TEXT,
    "styleId" TEXT,
    "styleName" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Appointment" ("clientId", "coachId", "coachName", "color", "createdAt", "description", "id", "notes", "title", "type", "updatedAt") SELECT "clientId", "coachId", "coachName", "color", "createdAt", "description", "id", "notes", "title", "type", "updatedAt" FROM "Appointment";
DROP TABLE "Appointment";
ALTER TABLE "new_Appointment" RENAME TO "Appointment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
