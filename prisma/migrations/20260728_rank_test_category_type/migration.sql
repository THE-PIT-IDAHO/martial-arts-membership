-- Add a display / grading style tag to RankTestCategory. Drives how
-- the grading sheet renders each section:
--   demonstration  -> per-item scoring (Techniques, Forms, Katas)
--   workout        -> stopwatch on every item, bundle heading
--                     (Gatekeeper, Fitness)
--   information    -> check-only knowledge section
-- Additive with a safe default so every existing category keeps its
-- current behavior. Explicit DEFAULT + backfill so any rows created
-- outside Prisma still get the same value.
ALTER TABLE "RankTestCategory" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'demonstration';
