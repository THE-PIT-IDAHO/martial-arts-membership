-- Multi-style testing events: store style IDs/names as JSON arrays.
-- Existing rows keep using the singular styleId / styleName columns.
ALTER TABLE "TestingEvent" ADD COLUMN "styleIds" TEXT;
ALTER TABLE "TestingEvent" ADD COLUMN "styleNames" TEXT;
