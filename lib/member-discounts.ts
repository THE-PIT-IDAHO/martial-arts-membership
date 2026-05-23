import { prisma } from "@/lib/prisma";

export type DiscountScope = "POS" | "MEMBERSHIP" | "PROMOTION";

export interface AppliedMemberDiscount {
  id: string;
  label: string;
  percentOff: number;
  flatCents: number;
  oneTime: boolean;
}

// Pull all active MemberDiscount rows that apply to the given scope (or "ALL").
// Caller is responsible for actually subtracting from a charge and calling
// markUsed() once the charge is committed.
export async function getActiveMemberDiscounts(
  memberId: string,
  scope: DiscountScope,
): Promise<AppliedMemberDiscount[]> {
  const rows = await prisma.memberDiscount.findMany({
    where: {
      memberId,
      active: true,
      OR: [{ appliesTo: scope }, { appliesTo: "ALL" }],
    },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label || `${r.appliesTo} discount`,
    percentOff: r.percentOff ?? 0,
    flatCents: r.flatCents ?? 0,
    oneTime: r.oneTime,
  }));
}

// Compute the discount cents off `baseCents` for the given member+scope, using
// additive stacking on top of any caller-supplied existing discount.
// Returns the rows that were used so the caller can pass them to markUsed.
export async function applyMemberDiscounts(
  memberId: string,
  scope: DiscountScope,
  baseCents: number,
): Promise<{ discountCents: number; applied: AppliedMemberDiscount[] }> {
  const applied = await getActiveMemberDiscounts(memberId, scope);
  if (applied.length === 0) return { discountCents: 0, applied: [] };

  let totalPercent = 0;
  let totalFlat = 0;
  for (const d of applied) {
    totalPercent += d.percentOff || 0;
    totalFlat += d.flatCents || 0;
  }
  const fromPercent = Math.round((baseCents * Math.min(totalPercent, 100)) / 100);
  const discountCents = Math.min(baseCents, fromPercent + totalFlat);
  return { discountCents, applied };
}

// Mark one-time discounts as used after a successful charge. Lasting discounts
// (oneTime=false) are not touched.
export async function markDiscountsUsed(applied: AppliedMemberDiscount[]): Promise<void> {
  const oneTimeIds = applied.filter((d) => d.oneTime).map((d) => d.id);
  if (oneTimeIds.length === 0) return;
  await prisma.memberDiscount.updateMany({
    where: { id: { in: oneTimeIds } },
    data: { active: false, usedAt: new Date() },
  });
}
