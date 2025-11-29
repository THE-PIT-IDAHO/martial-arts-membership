-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "classType" TEXT,
    "styleIds" TEXT,
    "styleNames" TEXT,
    "styleId" TEXT,
    "styleName" TEXT,
    "minRankId" TEXT,
    "minRankName" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "frequencyNumber" INTEGER,
    "frequencyUnit" TEXT,
    "scheduleStartDate" DATETIME,
    "scheduleEndDate" DATETIME,
    "isOngoing" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT DEFAULT '#a3a3a3',
    "programId" TEXT,
    "clientId" TEXT NOT NULL,
    CONSTRAINT "ClassSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClassSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClassSession" ("classType", "clientId", "color", "endsAt", "frequencyNumber", "frequencyUnit", "id", "isOngoing", "isRecurring", "minRankId", "minRankName", "name", "programId", "scheduleEndDate", "scheduleStartDate", "startsAt", "styleId", "styleIds", "styleName", "styleNames") SELECT "classType", "clientId", "color", "endsAt", "frequencyNumber", "frequencyUnit", "id", "isOngoing", "isRecurring", "minRankId", "minRankName", "name", "programId", "scheduleEndDate", "scheduleStartDate", "startsAt", "styleId", "styleIds", "styleName", "styleNames" FROM "ClassSession";
DROP TABLE "ClassSession";
ALTER TABLE "new_ClassSession" RENAME TO "ClassSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
