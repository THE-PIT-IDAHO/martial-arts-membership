-- Gates member visibility of test results behind an explicit "Mark
-- Complete" click. Until this timestamp is set, the member portal
-- hides the participant row + PDF and the promotions eligibility
-- panel shows no test-grade indicator for that style.
--
-- Existing rows default to null so nothing is retroactively
-- exposed. Admins can bulk-publish historical results by setting
-- resultsPublishedAt manually if desired; the app-level flows only
-- ever stamp it forward as new participants are marked complete.
ALTER TABLE "TestingParticipant" ADD COLUMN "resultsPublishedAt" TIMESTAMP(3);
