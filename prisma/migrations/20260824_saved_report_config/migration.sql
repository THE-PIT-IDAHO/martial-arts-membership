-- Persisted report configs. Replaces the old localStorage-only
-- storage so a report built at the gym is visible from any device
-- signed into the same tenant.
CREATE TABLE "SavedReportConfig" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "configJson" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedReportConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedReportConfig_clientId_updatedAt_idx" ON "SavedReportConfig"("clientId", "updatedAt");
