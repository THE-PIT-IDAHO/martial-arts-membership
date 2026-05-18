-- AlterTable: add per-style minimum rank IDs (JSON array aligned with styleIds)
ALTER TABLE "ClassSession" ADD COLUMN "minRankIds" TEXT;
