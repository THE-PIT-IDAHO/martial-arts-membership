-- Track which class-pack Membership was decremented to cover each
-- Attendance row so a later unconfirm / delete refunds the credit to
-- the SAME membership -- even if the member has since bought a new
-- pack and the original one is now EXPIRED.
ALTER TABLE "Attendance"
  ADD COLUMN "creditDeductedFromMembershipId" TEXT;
