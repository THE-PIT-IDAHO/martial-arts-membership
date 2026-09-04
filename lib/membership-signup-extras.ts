/**
 * At signup time, compute the class-pack fields that get seeded onto
 * a new Membership row from its plan.
 *
 * Every caller that creates a Membership from a plan (POS checkout,
 * admin manual create, enrollment submission accept, trial convert,
 * payment-created signup) should spread this into the Prisma create
 * data so the two new columns behave the same everywhere.
 *
 * Credit-expiry deadline: derived from the caller's already-computed
 * contractEndDate. If the plan is a class pack and has a contract
 * length, credits inherit that same expiry date. If the plan has no
 * contract length, credits never expire.
 */

export type PlanSignupExtrasInput = {
  classCredits?: number | null;
};

export type MembershipSignupExtras = {
  /** Initial credit balance -- seeded when plan.classCredits is set. */
  remainingClassCredits?: number;
  /** Absolute wall-clock deadline for using credits, or null when the
   *  plan has no contract length to derive one from. */
  creditsExpireAt?: Date | null;
};

export function buildMembershipSignupExtras(
  plan: PlanSignupExtrasInput,
  _startDate: Date,
  contractEndDate: Date | null = null,
): MembershipSignupExtras {
  const extras: MembershipSignupExtras = {};

  // Class-credit seeding. Bank the full pack balance now; attendance
  // decrements. Credit expiry piggybacks on the plan's contract term
  // (contractEndDate) -- if the caller didn't compute one, credits
  // never expire.
  if (plan.classCredits && plan.classCredits > 0) {
    extras.remainingClassCredits = plan.classCredits;
    extras.creditsExpireAt = contractEndDate ?? null;
  }

  return extras;
}
