import { prisma } from "@/lib/prisma";

/**
 * Class-credit bookkeeping for class-pack / day-pass style memberships.
 *
 * A "credit-based" membership is any ACTIVE Membership whose plan has
 * classCredits set. Its remainingClassCredits column is authoritative;
 * attendance decrements it, and it auto-expires when the balance hits
 * zero or when creditsExpireAt passes.
 *
 * Time-based memberships are untouched by this file -- they run on
 * billing cycles, not credit counts.
 */

export type CreditDeductionResult = {
  /** true when this check-in actually decremented a credit on one of
   *  the member's memberships. false when the member has no credit-
   *  based membership (they're on a time-based plan, or on nothing). */
  deducted: boolean;
  /** true when the decrement drove the balance to zero and the
   *  membership was flipped to EXPIRED in the same transaction. */
  membershipExpired: boolean;
  /** id of the membership that was decremented, or null. */
  membershipId: string | null;
  /** balance AFTER the deduction, or null when nothing was deducted. */
  remainingAfter: number | null;
};

/**
 * Deduct one class credit from the member's active credit-based
 * membership. No-op when the member has none, or when the balance is
 * already zero (returns deducted: false in both cases -- callers can
 * decide whether to hard-block the check-in).
 *
 * If multiple credit-based memberships are active (unusual but
 * possible), the one expiring soonest is preferred so the member
 * burns the most-perishable credits first.
 */
export async function deductClassCreditForMember(
  memberId: string,
): Promise<CreditDeductionResult> {
  const now = new Date();

  // Candidates: ACTIVE credit-based memberships whose credits haven't
  // yet expired (creditsExpireAt null = never expires). Sorted so
  // soonest-expiring wins, then oldest (FIFO across never-expiring).
  const candidates = await prisma.membership.findMany({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { gt: 0 },
      OR: [
        { creditsExpireAt: null },
        { creditsExpireAt: { gt: now } },
      ],
    },
    orderBy: [
      { creditsExpireAt: "asc" },
      { startDate: "asc" },
    ],
    select: { id: true, remainingClassCredits: true },
  });

  if (candidates.length === 0) {
    return { deducted: false, membershipExpired: false, membershipId: null, remainingAfter: null };
  }

  const target = candidates[0];
  const nextBalance = (target.remainingClassCredits ?? 0) - 1;
  const shouldExpire = nextBalance <= 0;

  await prisma.membership.update({
    where: { id: target.id },
    data: {
      remainingClassCredits: nextBalance,
      ...(shouldExpire && { status: "EXPIRED" }),
    },
  });

  return {
    deducted: true,
    membershipExpired: shouldExpire,
    membershipId: target.id,
    remainingAfter: nextBalance,
  };
}

/**
 * Expire credit-based memberships whose creditsExpireAt has passed.
 * Called from the auto-billing / lifecycle cron so passes with unused
 * credits don't sit forever in ACTIVE.
 */
export async function expireLapsedCreditMemberships(
  clientId: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await prisma.membership.updateMany({
    where: {
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      creditsExpireAt: { lt: now },
      member: { clientId },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
