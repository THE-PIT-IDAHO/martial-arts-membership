import { prisma } from "@/lib/prisma";
import { syncMemberStatusFromMemberships } from "@/lib/member-status-sync";

/**
 * Class-credit bookkeeping for class-pack memberships.
 *
 * A "credit-based" membership is any ACTIVE Membership whose plan has
 * classCredits set. Its remainingClassCredits column is authoritative;
 * attendance decrements it, and it auto-expires when the balance hits
 * zero or when creditsExpireAt passes.
 *
 * When the credit burns depends on plan.expireOnSignIn:
 *   false (default) = burn on CONFIRM (only when admin confirms
 *                     attendance -- "did they actually attend?")
 *   true            = burn on SIGN_IN (as soon as an attendance row
 *                     exists, whether confirmed or not -- "did they
 *                     walk in the door?")
 *
 * Every attendance-write endpoint calls the helpers with the trigger
 * that just occurred; the helper only touches packs whose mode
 * matches, so cross-mode calls are safe no-ops.
 *
 * Time-based memberships (no classCredits) are untouched by this file
 * regardless of any trigger.
 */

export type CreditTrigger = "SIGN_IN" | "CONFIRM";

export type CreditDeductionResult = {
  /** true when this call actually decremented a credit. */
  deducted: boolean;
  /** true when the decrement drove balance to zero and the membership
   *  was flipped to EXPIRED in the same update. */
  membershipExpired: boolean;
  /** id of the membership decremented, or null. */
  membershipId: string | null;
  /** balance AFTER the deduction, or null when nothing was deducted. */
  remainingAfter: number | null;
};

/**
 * Deduct one class credit if the member has an ACTIVE class-pack
 * membership whose plan's mode matches `trigger`. Multi-pack members
 * (unusual) burn the soonest-expiring credit first.
 *
 * No-ops when the member has no matching pack, or when the balance
 * is already zero (candidates filter both out).
 */
export async function deductClassCreditForMember(
  memberId: string,
  trigger: CreditTrigger,
): Promise<CreditDeductionResult> {
  const now = new Date();

  // Sweep this member's ACTIVE class-pack memberships whose
  // creditsExpireAt has already passed. Keeps check-ins between the
  // expiry deadline and the next daily cron run from getting a free
  // class -- and matches Cruz's rule "expire whichever comes first,
  // credits depleted OR expiry date reached."
  const preSwept = await prisma.membership.updateMany({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      creditsExpireAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
  // Re-sync the Member.status ACTIVE/INACTIVE axis if the sweep
  // actually changed anything -- otherwise the members list keeps
  // showing "Active" while the profile shows the pack as EXPIRED.
  if (preSwept.count > 0) {
    await syncMemberStatusFromMemberships(memberId);
  }

  // Candidates: ACTIVE credit-based packs with credits left, unexpired,
  // AND whose plan's mode matches this trigger. Soonest-expiring first
  // so members burn the most-perishable credits ahead of never-
  // expiring ones.
  const candidates = await prisma.membership.findMany({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { gt: 0 },
      OR: [
        { creditsExpireAt: null },
        { creditsExpireAt: { gt: now } },
      ],
      membershipPlan:
        trigger === "SIGN_IN"
          ? { expireOnSignIn: true }
          : { expireOnSignIn: false },
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

  // Re-sync Member.status on the ACTIVE/INACTIVE axis when a pack
  // expired. Without this, the members list keeps rendering
  // "Active" for a member whose only membership just got auto-
  // expired at zero balance.
  if (shouldExpire) {
    await syncMemberStatusFromMemberships(memberId);
  }

  return {
    deducted: true,
    membershipExpired: shouldExpire,
    membershipId: target.id,
    remainingAfter: nextBalance,
  };
}

/**
 * Refund one class credit -- the reverse of deductClassCreditForMember.
 * Used when the attendance action that consumed the credit is undone
 * (unconfirm for CONFIRM-mode packs, delete-row for either mode).
 *
 * Prefers to refund an ACTIVE pack matching the trigger. Falls back to
 * an EXPIRED pack that had been auto-expired at zero balance -- re-
 * activates it and gives the credit back so the undo is a real undo.
 *
 * Silently no-ops when the member has no matching class-pack.
 */
export async function refundClassCreditForMember(
  memberId: string,
  trigger: CreditTrigger,
): Promise<void> {
  const now = new Date();

  const modeFilter =
    trigger === "SIGN_IN"
      ? { expireOnSignIn: true }
      : { expireOnSignIn: false };

  const active = await prisma.membership.findFirst({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      OR: [
        { creditsExpireAt: null },
        { creditsExpireAt: { gt: now } },
      ],
      membershipPlan: modeFilter,
    },
    orderBy: [{ creditsExpireAt: "desc" }, { startDate: "desc" }],
    select: { id: true, remainingClassCredits: true },
  });
  if (active) {
    await prisma.membership.update({
      where: { id: active.id },
      data: { remainingClassCredits: (active.remainingClassCredits ?? 0) + 1 },
    });
    return;
  }

  const expired = await prisma.membership.findFirst({
    where: {
      memberId,
      status: "EXPIRED",
      remainingClassCredits: 0,
      OR: [
        { creditsExpireAt: null },
        { creditsExpireAt: { gt: now } },
      ],
      membershipPlan: modeFilter,
    },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
  if (expired) {
    await prisma.membership.update({
      where: { id: expired.id },
      data: { status: "ACTIVE", remainingClassCredits: 1 },
    });
    // Re-activating the pack likely flips the member back onto the
    // ACTIVE side of the status axis -- resync so the members list
    // reflects it.
    await syncMemberStatusFromMemberships(memberId);
  }
}

/**
 * Expire credit-based memberships whose creditsExpireAt has passed.
 * Called from the lifecycle cron so passes with unused credits don't
 * sit forever in ACTIVE.
 */
export async function expireLapsedCreditMemberships(
  clientId: string,
  now: Date = new Date(),
): Promise<number> {
  // Find the affected memberships FIRST so we know which members to
  // resync after the bulk expire. updateMany doesn't return the rows
  // it touched, and we need memberIds to keep Member.status in
  // agreement (else the members list keeps rendering "Active" while
  // the profile shows an EXPIRED pack).
  const targets = await prisma.membership.findMany({
    where: {
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      creditsExpireAt: { lt: now },
      member: { clientId },
    },
    select: { memberId: true },
  });
  if (targets.length === 0) return 0;

  const result = await prisma.membership.updateMany({
    where: {
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      creditsExpireAt: { lt: now },
      member: { clientId },
    },
    data: { status: "EXPIRED" },
  });

  // Dedup memberIds so a member with multiple expiring packs only
  // gets synced once.
  const memberIds = Array.from(new Set(targets.map((t) => t.memberId)));
  for (const memberId of memberIds) {
    await syncMemberStatusFromMemberships(memberId).catch((err) => {
      console.error(`Member.status resync failed for member ${memberId}:`, err);
    });
  }

  return result.count;
}
