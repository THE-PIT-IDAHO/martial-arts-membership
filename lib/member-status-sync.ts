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
export async function syncMemberStatusFromMemberships(memberId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { status: true },
  });
  if (!member) return false;

  const hasActive = await prisma.membership.findFirst({
    where: {
      memberId,
      status: { in: ["ACTIVE", "CANCELED"] },
    },
    select: { id: true },
  });

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
    ? ["ACTIVE", ...preserved]
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
