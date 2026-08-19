-- Link a Member row to an admin User row when the member has been
-- granted admin login access via the "Admin" button on their profile.
-- Nullable + additive so existing rows are unaffected; unique so a
-- User row can only be linked back to one Member. onDelete SetNull
-- keeps the Member alive if the User row gets removed independently.
ALTER TABLE "Member" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Member_userId_key" ON "Member"("userId");
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-user data scoping for class / appointment views. "all" (default)
-- sees every entity in the gym; "own" filters to entities coached by
-- the User's linked Member. Chosen per user at grant time via the
-- Admin modal on the member profile.
ALTER TABLE "User" ADD COLUMN "classScope" TEXT NOT NULL DEFAULT 'all';
