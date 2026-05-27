// Per-tenant sequence generators for member numbers and membership-plan ids.
// Both start at the documented base (10000000 for members, 20000000 for
// membership plans) and find the LOWEST free value within the tenant — so
// every gym gets its own clean run starting from the base, regardless of
// what other gyms in the same database have already used.
//
// Previously two routes (waivers/add-child, public/waiver-submit) had their
// own copies that read the global max + 1 with no clientId filter, so a
// brand-new gym's first child got an absurd number like 10001234 (one
// past whatever the largest member number was across every tenant).
import { prisma } from "@/lib/prisma";

export const MIN_MEMBER_NUMBER = 10000000;
export const MIN_MEMBERSHIP_PLAN_NUMBER = 20000000;

export async function getNextMemberNumber(clientId: string): Promise<number> {
  const existing = await prisma.member.findMany({
    where: { clientId, memberNumber: { gte: MIN_MEMBER_NUMBER } },
    select: { memberNumber: true },
    orderBy: { memberNumber: "asc" },
  });
  let candidate = MIN_MEMBER_NUMBER;
  for (const row of existing) {
    if (row.memberNumber == null) continue;
    if (row.memberNumber === candidate) candidate++;
    else if (row.memberNumber > candidate) break;
  }
  return candidate;
}

export async function getNextMemberNumbers(clientId: string, count: number): Promise<number[]> {
  const existing = await prisma.member.findMany({
    where: { clientId, memberNumber: { gte: MIN_MEMBER_NUMBER } },
    select: { memberNumber: true },
    orderBy: { memberNumber: "asc" },
  });
  const used = new Set(
    existing.map((e) => e.memberNumber).filter((n): n is number => n != null),
  );
  const out: number[] = [];
  let candidate = MIN_MEMBER_NUMBER;
  while (out.length < count) {
    if (!used.has(candidate)) out.push(candidate);
    candidate++;
  }
  return out;
}

export async function getNextMembershipPlanId(clientId: string): Promise<string> {
  const existing = await prisma.membershipPlan.findMany({
    where: { clientId, membershipId: { not: null } },
    select: { membershipId: true },
  });
  const used = new Set(
    existing
      .map((p) => parseInt(p.membershipId || "", 10))
      .filter((n) => !isNaN(n) && n >= MIN_MEMBERSHIP_PLAN_NUMBER),
  );
  let candidate = MIN_MEMBERSHIP_PLAN_NUMBER;
  while (used.has(candidate)) candidate++;
  return String(candidate);
}
