// Helpers for the "minor" concept used by the member portal.
//
// A member counts as a minor when BOTH are true:
//   - They are under 18 years old (per dateOfBirth)
//   - They have at least one incoming MemberRelationship from a
//     parent/guardian (the row says "Parent of" or "Guardian of",
//     case-insensitive — legacy data also uses bare "PARENT" / "GUARDIAN")
//
// Documents flow follows from there:
//   - Minors don't see their own contracts/waivers in the portal.
//   - Their parents/guardians see the kid's contracts/waivers labeled
//     with the kid's first name on their own Documents tab.
import { prisma } from "@/lib/prisma";

export function isUnder18(dob: Date | null | undefined): boolean {
  if (!dob) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age < 18;
}

function isGuardianRelationship(label: string | null | undefined): boolean {
  if (!label) return false;
  const lower = label.toLowerCase();
  return lower.includes("parent") || lower.includes("guardian");
}

/**
 * True if memberId has at least one incoming parent/guardian relationship
 * AND is under 18. Used by the portal to decide whether to hide a member's
 * own contracts/waivers (those move to the parent's tab instead).
 */
export async function isMinor(memberId: string): Promise<boolean> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { dateOfBirth: true },
  });
  if (!m || !isUnder18(m.dateOfBirth)) return false;

  const incoming = await prisma.memberRelationship.findMany({
    where: { toMemberId: memberId },
    select: { relationship: true },
  });
  return incoming.some((r) => isGuardianRelationship(r.relationship));
}

/**
 * Returns the minor children (and dependents) of a parent/guardian — i.e.
 * the members that this member is responsible for AND who qualify as
 * minors under our definition. Used to pull the kids' contracts/waivers
 * into the parent's portal view.
 */
export async function getMinorChildren(parentId: string): Promise<
  Array<{ id: string; firstName: string; lastName: string }>
> {
  const outgoing = await prisma.memberRelationship.findMany({
    where: { fromMemberId: parentId },
    select: {
      relationship: true,
      toMember: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
    },
  });

  const children: Array<{ id: string; firstName: string; lastName: string }> = [];
  for (const rel of outgoing) {
    if (!isGuardianRelationship(rel.relationship)) continue;
    if (!rel.toMember) continue;
    if (!isUnder18(rel.toMember.dateOfBirth)) continue;
    children.push({
      id: rel.toMember.id,
      firstName: rel.toMember.firstName,
      lastName: rel.toMember.lastName,
    });
  }
  return children;
}

/**
 * Returns true iff `targetMemberId` is one of `parentId`'s minor children.
 * Used by the portal PDF route to authorize a parent fetching a child's
 * contract or waiver.
 */
export async function isMinorChildOf(
  parentId: string,
  targetMemberId: string,
): Promise<boolean> {
  if (parentId === targetMemberId) return false;
  const children = await getMinorChildren(parentId);
  return children.some((c) => c.id === targetMemberId);
}
