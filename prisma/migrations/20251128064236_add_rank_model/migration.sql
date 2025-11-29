-- CreateTable
CREATE TABLE "Rank" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "thumbnail" TEXT,
    "styleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rank_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
