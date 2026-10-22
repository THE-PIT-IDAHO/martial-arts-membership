-- Testing events can span multiple days. Null = single-day (all existing rows).
ALTER TABLE "TestingEvent" ADD COLUMN "endDate" TIMESTAMP;
