// Computes the fee a member should pay for a single promotion.
//
// Layered precedence (highest wins, falls back if null):
//   1. Member.promotionFeeOverrideCents       (per-member override)
//   2. Style.promotionFeeCents                (per-style fee)
//   3. Settings "promotion_fee_cents"         (gym-wide default)
//   4. 0                                      (no fee)
//
// Then the member's active membership-plan discount is applied:
//   discounted = base - (base * percent/100)
//   discounted = discounted - flatCents
//   discounted = max(0, discounted)
// If the member has multiple active plans, the one that yields the lowest
// final cost wins (best discount for the member).
import { prisma } from "@/lib/prisma";

export type PromotionFeeBreakdown = {
  baseCostCents: number;
  discountCents: number;
  costCents: number;
  discountSourcePlanId: string | null;
  discountSourcePlanName: string | null;
  source: "member" | "style" | "global" | "none";
};

async function getGlobalDefaultFee(clientId: string): Promise<number> {
  const row = await prisma.settings.findFirst({
    where: { clientId, key: "promotion_fee_cents" },
    select: { value: true },
  });
  if (!row?.value) return 0;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function computePromotionFee(opts: {
  memberId: string;
  styleId: string;
  clientId: string;
}): Promise<PromotionFeeBreakdown> {
  const [member, style] = await Promise.all([
    prisma.member.findUnique({
      where: { id: opts.memberId },
      select: {
        promotionFeeOverrideCents: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            membershipPlan: {
              select: {
                id: true,
                name: true,
                rankPromotionDiscountPercent: true,
                rankPromotionDiscountFlatCents: true,
              },
            },
          },
        },
      },
    }),
    prisma.style.findUnique({
      where: { id: opts.styleId },
      select: { promotionFeeCents: true },
    }),
  ]);

  // Determine base.
  let baseCostCents = 0;
  let source: PromotionFeeBreakdown["source"] = "none";
  if (member?.promotionFeeOverrideCents != null) {
    baseCostCents = member.promotionFeeOverrideCents;
    source = "member";
  } else if (style?.promotionFeeCents != null) {
    baseCostCents = style.promotionFeeCents;
    source = "style";
  } else {
    const global = await getGlobalDefaultFee(opts.clientId);
    if (global > 0) {
      baseCostCents = global;
      source = "global";
    }
  }

  // Find the active plan that yields the best (lowest) post-discount price.
  let bestDiscount = 0;
  let bestPlanId: string | null = null;
  let bestPlanName: string | null = null;
  for (const m of member?.memberships ?? []) {
    const pct = m.membershipPlan.rankPromotionDiscountPercent ?? 0;
    const flat = m.membershipPlan.rankPromotionDiscountFlatCents ?? 0;
    if (pct === 0 && flat === 0) continue;
    const afterPct = baseCostCents - Math.floor((baseCostCents * pct) / 100);
    const after = Math.max(0, afterPct - flat);
    const discount = baseCostCents - after;
    if (discount > bestDiscount) {
      bestDiscount = discount;
      bestPlanId = m.membershipPlan.id;
      bestPlanName = m.membershipPlan.name;
    }
  }

  const costCents = Math.max(0, baseCostCents - bestDiscount);

  return {
    baseCostCents,
    discountCents: bestDiscount,
    costCents,
    discountSourcePlanId: bestPlanId,
    discountSourcePlanName: bestPlanName,
    source,
  };
}
