-- Adds a JSON array field to RankTestItem for bundling sub-exercises
-- (Pushups + Squats + Plank etc.) under one gradeable parent item.
-- Nullable + no default -- existing rows keep the null and render
-- exactly like before.
ALTER TABLE "RankTestItem" ADD COLUMN "subExercises" TEXT;
