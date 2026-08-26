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
// Optionally scoped to a specific membership: when `membershipId` is given,
// includes rows attached to THAT membership PLUS legacy member-scoped rows
// (membershipId = null). Rows attached to a DIFFERENT membership are
// excluded so per-membership discounts stay isolated.
// Caller is responsible for actually subtracting from a charge and calling
// markUsed() once the charge is committed.
export async function getActiveMemberDiscounts(
  memberId: string,
  scope: DiscountScope,
  membershipId?: string,
): Promise<AppliedMemberDiscount[]> {
  const rows = await prisma.memberDiscount.findMany({
    where: {
      memberId,
      active: true,
      // Scope match: caller passed POS/MEMBERSHIP/PROMOTION -- also
      // pick up "ALL"-scope rows.
      AND: [
        { OR: [{ appliesTo: scope }, { appliesTo: "ALL" }] },
        // Membership match: when a membershipId is provided, include
        // rows attached to THAT membership PLUS legacy member-scoped
        // (null) rows. Otherwise only null rows (POS-side calls that
        // don't have a membership context shouldn't pick up rows
        // attached to some other membership).
        membershipId
          ? { OR: [{ membershipId }, { membershipId: null }] }
          : { membershipId: null },
      ],
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
  membershipId?: string,
): Promise<{ discountCents: number; applied: AppliedMemberDiscount[] }> {
  const applied = await getActiveMemberDiscounts(memberId, scope, membershipId);
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
