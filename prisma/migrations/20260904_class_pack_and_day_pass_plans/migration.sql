-- Class-pack and day-pass MembershipPlan modes.
--
-- passDurationDays  -- if set, signup end date = start + N days (day/week pass)
-- classCredits      -- if set, plan sells N class credits per signup or per cycle
-- creditsRecurring  -- when classCredits set: false = one-shot, true = reset per cycle
-- creditExpiryDays  -- credits expire N days after signup; null = never
ALTER TABLE "MembershipPlan"
  ADD COLUMN "passDurationDays" INTEGER,
  ADD COLUMN "classCredits" INTEGER,
  ADD COLUMN "creditsRecurring" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditExpiryDays" INTEGER;

-- Denormalized per-signup tracking. Populated at Membership creation
-- from the plan's classCredits / creditExpiryDays. Attendance
-- decrements remainingClassCredits; when it hits 0 the membership
-- auto-expires (status EXPIRED).
ALTER TABLE "Membership"
  ADD COLUMN "remainingClassCredits" INTEGER,
  ADD COLUMN "creditsExpireAt" TIMESTAMP(3);
