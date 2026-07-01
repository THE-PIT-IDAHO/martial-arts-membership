-- Adds per-style default visibility of class-progress bars on the member portal.
-- Hidden by default. Per-member override lives inside stylesNotes JSON.
ALTER TABLE "Style" ADD COLUMN "showProgressInPortal" BOOLEAN NOT NULL DEFAULT false;
