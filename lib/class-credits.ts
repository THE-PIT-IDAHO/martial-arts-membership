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
 *   false (default) = burn on CONFIRM (admin confirms attendance)
 *   true            = burn on SIGN_IN (row created, whether confirmed
 *                     or not)
 *
 * Every attendance-write endpoint calls the helpers with the trigger
 * that just occurred; the helper only touches packs whose mode
 * matches. The membershipId that had a credit burned is returned so
 * the caller can persist it on Attendance.creditDeductedFromMembershipId
 * -- the refund flow reads that field back so the credit returns to
 * the SAME pack, even if the member has since bought a new pack and
 * the original one is now EXPIRED.
 *
 * Time-based memberships (no classCredits) are untouched by this file.
 */

export type CreditTrigger = "SIGN_IN" | "CONFIRM";

export type CreditDeductionResult = {
  deducted: boolean;
  membershipExpired: boolean;
  membershipId: string | null;
  remainingAfter: number | null;
};

export async function deductClassCreditForMember(
  memberId: string,
  trigger: CreditTrigger,
): Promise<CreditDeductionResult> {
  const now = new Date();

  // Sweep this member's ACTIVE class-pack memberships whose
  // creditsExpireAt has already passed.
  const preSwept = await prisma.membership.updateMany({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      creditsExpireAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
  if (preSwept.count > 0) {
    await syncMemberStatusFromMemberships(memberId);
  }

  // Fetch all active class-pack memberships so we can decide in JS
  // (avoids nested-Prisma-filter quirks).
  const allActive = await prisma.membership.findMany({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { not: null },
    },
    select: {
      id: true,
      remainingClassCredits: true,
      creditsExpireAt: true,
      membershipPlan: { select: { expireOnSignIn: true } },
    },
  });

  const wantSignIn = trigger === "SIGN_IN";
  const candidates = allActive.filter((m) => {
    if ((m.remainingClassCredits ?? 0) <= 0) return false;
    if (m.creditsExpireAt && m.creditsExpireAt <= now) return false;
    return m.membershipPlan.expireOnSignIn === wantSignIn;
  });

  if (candidates.length === 0) {
    return { deducted: false, membershipExpired: false, membershipId: null, remainingAfter: null };
  }

  // Soonest-expiring first, then oldest for FIFO across never-
  // expiring packs.
  candidates.sort((a, b) => {
    const aExp = a.creditsExpireAt ? a.creditsExpireAt.getTime() : Infinity;
    const bExp = b.creditsExpireAt ? b.creditsExpireAt.getTime() : Infinity;
    return aExp - bExp;
  });

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
 * Refund one class credit. Preferred flow is to pass
 * `specificMembershipId` -- the value stored on
 * Attendance.creditDeductedFromMembershipId when the deduction
 * originally fired -- so the credit returns to the exact pack that
 * paid, even if that pack is now EXPIRED and the member has bought
 * a new pack since.
 *
 * When specificMembershipId is null (legacy Attendance rows written
 * before the field existed, or the deduction never fired), falls
 * back to a mode-matched heuristic: any auto-expired pack first,
 * then any active pack.
 *
 * When re-activating an EXPIRED pack, sets balance to 1 rather than
 * incrementing -- an EXPIRED pack was drained to 0, so 1 is the
 * correct refunded balance.
 */
export async function refundClassCreditForMember(
  memberId: string,
  trigger: CreditTrigger,
  specificMembershipId: string | null = null,
): Promise<void> {
  const now = new Date();

  if (specificMembershipId) {
    const target = await prisma.membership.findUnique({
      where: { id: specificMembershipId },
      select: {
        id: true,
        memberId: true,
        status: true,
        remainingClassCredits: true,
      },
    });
    // Guard: the row must actually belong to this member.
    if (!target || target.memberId !== memberId) return;
    // Increment balance; if the pack was auto-expired at zero, also
    // flip status back to ACTIVE. Non-class-pack rows (remaining-
    // ClassCredits null) are silently skipped so a mis-persisted
    // reference doesn't corrupt a time-based membership.
    if (target.remainingClassCredits === null) return;
    const nextBalance = target.remainingClassCredits + 1;
    const wasExpired = target.status === "EXPIRED";
    await prisma.membership.update({
      where: { id: target.id },
      data: {
        remainingClassCredits: nextBalance,
        ...(wasExpired && { status: "ACTIVE" }),
      },
    });
    if (wasExpired) {
      await syncMemberStatusFromMemberships(memberId);
    }
    return;
  }

  // --- Fallback for attendance rows without a stored membership id. ---
  const wantSignIn = trigger === "SIGN_IN";

  // Prefer an EXPIRED pack drained to 0 whose plan matches -- most
  // likely the one just consumed. Re-activates + balance -> 1.
  const drained = await prisma.membership.findFirst({
    where: {
      memberId,
      status: "EXPIRED",
      remainingClassCredits: 0,
      OR: [
        { creditsExpireAt: null },
        { creditsExpireAt: { gt: now } },
      ],
    },
    orderBy: { startDate: "desc" },
    select: { id: true, membershipPlan: { select: { expireOnSignIn: true } } },
  });
  if (drained && drained.membershipPlan.expireOnSignIn === wantSignIn) {
    await prisma.membership.update({
      where: { id: drained.id },
      data: { status: "ACTIVE", remainingClassCredits: 1 },
    });
    await syncMemberStatusFromMemberships(memberId);
    return;
  }

  // Otherwise increment an active matching pack.
  const active = await prisma.membership.findFirst({
    where: {
      memberId,
      status: "ACTIVE",
      remainingClassCredits: { not: null },
      OR: [
        { creditsExpireAt: null },
        { creditsExpireAt: { gt: now } },
      ],
    },
    orderBy: [{ creditsExpireAt: "desc" }, { startDate: "desc" }],
    select: { id: true, remainingClassCredits: true, membershipPlan: { select: { expireOnSignIn: true } } },
  });
  if (active && active.membershipPlan.expireOnSignIn === wantSignIn) {
    await prisma.membership.update({
      where: { id: active.id },
      data: { remainingClassCredits: (active.remainingClassCredits ?? 0) + 1 },
    });
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

  const memberIds = Array.from(new Set(targets.map((t) => t.memberId)));
  for (const memberId of memberIds) {
    await syncMemberStatusFromMemberships(memberId).catch((err) => {
      console.error(`Member.status resync failed for member ${memberId}:`, err);
    });
  }

  return result.count;
}
