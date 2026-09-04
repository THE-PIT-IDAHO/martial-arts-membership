/**
 * At signup time, compute the class-pack / day-pass fields that get
 * seeded onto a new Membership row from its plan.
 *
 * Every caller that creates a Membership from a plan (POS checkout,
 * admin manual create, enrollment submission accept, trial convert,
 * payment-created signup) should spread this into the Prisma create
 * data so the three new columns behave the same everywhere.
 *
 * Nothing here overrides a value the caller has already computed --
 * callers still own the base contractEndDate / renewal cadence. This
 * only supplies the NEW day-pass endDate + credit tracking, and only
 * when the plan opts into one of those modes.
 */

export type PlanSignupExtrasInput = {
  passDurationDays?: number | null;
  classCredits?: number | null;
  creditsRecurring?: boolean | null;
  creditExpiryDays?: number | null;
};

export type MembershipSignupExtras = {
  /** endDate override for day-pass style plans (startDate + N days).
   *  Absent when the plan is not a day pass -- callers keep their own
   *  endDate logic in that case. */
  endDate?: Date;
  /** Initial credit balance -- seeded when plan.classCredits is set. */
  remainingClassCredits?: number;
  /** Absolute wall-clock deadline for using credits, or null when the
   *  plan opts out of expiry. */
  creditsExpireAt?: Date | null;
};

export function buildMembershipSignupExtras(
  plan: PlanSignupExtrasInput,
  startDate: Date,
): MembershipSignupExtras {
  const extras: MembershipSignupExtras = {};

  // Day-pass / N-day-pass endDate: exactly N days from signup at the
  // same time-of-day (i.e. the pass runs for a full 24h * N, matching
  // "buy at 6pm, valid until 6pm tomorrow" -- simpler and less
  // surprising than truncating to midnight of the Nth day).
  if (plan.passDurationDays && plan.passDurationDays > 0) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + plan.passDurationDays);
    extras.endDate = end;
  }

  // Class-credit seeding. Bank the full pack balance now; attendance
  // decrements. Recurring packs will refill in the billing job (out
  // of scope for this helper).
  if (plan.classCredits && plan.classCredits > 0) {
    extras.remainingClassCredits = plan.classCredits;
    if (plan.creditExpiryDays && plan.creditExpiryDays > 0) {
      const expires = new Date(startDate);
      expires.setDate(expires.getDate() + plan.creditExpiryDays);
      extras.creditsExpireAt = expires;
    } else {
      extras.creditsExpireAt = null;
    }
  }

  return extras;
}
