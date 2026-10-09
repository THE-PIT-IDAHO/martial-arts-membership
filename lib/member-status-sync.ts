import { prisma } from "@/lib/prisma";

/**
 * Recompute a member's status tokens based on the current state of
 * their memberships.
 *
 * Member.status is a delimited string of tokens (e.g. "ACTIVE,COACH",
 * "INACTIVE,PARENT"). Non-membership tokens (COACH, PARENT, etc.) are
 * preserved verbatim; only the ACTIVE / INACTIVE / CANCELED / PROSPECT
 * axis is recomputed.
 *
 * Rules (mirror the memberships PATCH endpoint):
 *   - Any membership row with status ACTIVE or CANCELED (contract
 *     window still valid) → member is ACTIVE.
 *   - Otherwise (only PAUSED / EXPIRED left, or no memberships) →
 *     member is INACTIVE.
 *   - PROSPECT is treated as a stale bucket -- swept out either way,
 *     replaced by ACTIVE or INACTIVE.
 *
 * Called wherever a Membership row's status changes without going
 * through the PATCH endpoint (e.g. class-pack auto-expire at check-in
 * time, lifecycle expiry sweep) so the members list stays in sync
 * with the profile view.
 */
/**
 * Single source of truth for "does this membership still keep the
 * member on the Active list". A CANCELED membership only counts while
 * its notice period (cancellationEffectiveDate) or paid-through date
 * (endDate) is still in the future. Every status writer uses this so
 * the cancel endpoint, the housekeeping sweep, and the lifecycle
 * reconcile can't disagree and flip a member back and forth.
 */
export function isMembershipCurrent(
  ms: { status: string; endDate?: Date | null; cancellationEffectiveDate?: Date | null },
  now: Date = new Date(),
): boolean {
  if (ms.status === "ACTIVE") return true;
  if (ms.status === "CANCELED") {
    if (ms.cancellationEffectiveDate && ms.cancellationEffectiveDate > now) return true;
    if (ms.endDate && ms.endDate > now) return true;
  }
  return false;
}

export async function syncMemberStatusFromMemberships(memberId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { status: true },
  });
  if (!member) return false;

  const memberships = await prisma.membership.findMany({
    where: { memberId, status: { in: ["ACTIVE", "CANCELED"] } },
    select: { status: true, endDate: true, cancellationEffectiveDate: true },
  });
  const now = new Date();
  const current = memberships.filter((ms) => isMembershipCurrent(ms, now));
  const hasActive = current.length > 0;
  // Keep the CANCELED tag while the member is only current because of
  // a cancelled-but-not-yet-effective membership.
  const onlyCancelledCurrent = hasActive && current.every((ms) => ms.status === "CANCELED");

  const currentTokens = (member.status || "")
    .split(/[^A-Z_]+/i)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // Drop everything on the ACTIVE/INACTIVE/PROSPECT/CANCELED axis and
  // rebuild it. Keep every other token (COACH, PARENT, BANNED, ...)
  // in its original position.
  const AXIS = new Set(["ACTIVE", "INACTIVE", "PROSPECT", "CANCELED"]);
  const preserved = currentTokens.filter((t) => !AXIS.has(t));
  const rebuilt = hasActive
    ? ["ACTIVE", ...preserved, ...(onlyCancelledCurrent ? ["CANCELED"] : [])]
    : ["INACTIVE", ...preserved];

  const newStatus = rebuilt.join(",");
  if (newStatus === member.status) return false;

  await prisma.member.update({
    where: { id: memberId },
    data: { status: newStatus },
  });
  return true;
}

/**
 * Reconcile Member.status across an entire tenant. Walks every
 * member, recomputes the ACTIVE/INACTIVE axis from their memberships,
 * writes the row when it drifted. Called from the daily lifecycle
 * cron to catch old drift (e.g. a class pack that expired before the
 * inline resync was wired up).
 *
 * Returns the number of rows actually updated.
 */
export async function reconcileClientMemberStatuses(clientId: string): Promise<number> {
  const members = await prisma.member.findMany({
    where: { clientId },
    select: { id: true },
  });
  let updated = 0;
  for (const m of members) {
    const changed = await syncMemberStatusFromMemberships(m.id).catch(() => false);
    if (changed) updated += 1;
  }
  return updated;
}
