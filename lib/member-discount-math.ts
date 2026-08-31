/**
 * Pure discount math — no DB imports, safe to bundle in the browser.
 *
 * Duplicated shape of the DB row so callers on both sides (server routes,
 * client-rendered pages) can pass their own already-fetched rows without
 * importing Prisma types. Kept ONLY the fields the math needs.
 *
 * The server-side computeMembershipDiscountCents in lib/billing.ts is a
 * re-export from this file, so the two never drift.
 */

export type MemberDiscountRowForMath = {
  appliesTo: string;
  percentOff: number | null;
  flatCents: number | null;
};

/**
 * Discount cents that a member's discount rows apply to a membership-
 * scope charge. Rows with appliesTo === "MEMBERSHIP" or "ALL" count;
 * "POS" and "PROMOTION" rows are ignored (they apply to different flows).
 *
 * Percent components are summed and capped at 100%. Flat components are
 * summed unbounded. Final discount can never exceed the base.
 */
export function computeMembershipDiscountCents(
  baseCents: number,
  discountRows: MemberDiscountRowForMath[],
): number {
  if (baseCents <= 0 || discountRows.length === 0) return 0;
  const applicable = discountRows.filter(
    (r) => r.appliesTo === "MEMBERSHIP" || r.appliesTo === "ALL",
  );
  if (applicable.length === 0) return 0;
  let percent = 0;
  let flat = 0;
  for (const r of applicable) {
    percent += r.percentOff ?? 0;
    flat += r.flatCents ?? 0;
  }
  const fromPct = Math.round((baseCents * Math.min(percent, 100)) / 100);
  return Math.min(baseCents, fromPct + flat);
}

/**
 * Base recurring price after MEMBERSHIP + ALL scope discounts. Returns
 * 0 for a fully-comped membership. Revenue rollups should filter out
 * the 0 result so a fully-discounted member isn't counted as revenue.
 */
export function getEffectivePriceAfterDiscountCents(
  baseCents: number,
  discountRows: MemberDiscountRowForMath[],
): number {
  return Math.max(0, baseCents - computeMembershipDiscountCents(baseCents, discountRows));
}

// --- Shared MRR math (used by /api/dashboard AND /api/members so the
// dashboard "Monthly Recurring Revenue" number matches the reports
// "Monthly Payments" number, which used to diverge because the two
// endpoints computed it independently and only one normalized by
// billing cycle) ---

export type BillableMembershipInput = {
  status: string;
  endDate: Date | string | null;
  contractEndDate?: Date | string | null;
  membershipPlan: {
    autoRenew: boolean | null;
    billingCycle: string;
  };
};

/**
 * A membership contributes to MRR only if the gym still expects money
 * from it next cycle. Three conditions must all hold:
 *   - status = ACTIVE (canceled / expired / suspended do not bill)
 *   - endDate is unset OR in the future (past-endDate rows are treated
 *     as expired even if the lifecycle job hasn't flipped their status
 *     yet)
 *   - plan auto-renews OR the row is still inside its contract term
 *     (a one-shot, no-renew, no-contract plan is fully paid up front)
 */
export function isBillableMembership(
  m: BillableMembershipInput,
  now: Date = new Date(),
): boolean {
  if (m.status !== "ACTIVE") return false;
  if (m.endDate && new Date(m.endDate) <= now) return false;
  const willRenew = m.membershipPlan.autoRenew === true;
  const stillInContract = !!m.contractEndDate && new Date(m.contractEndDate) > now;
  return willRenew || stillInContract;
}

/**
 * Normalize a per-cycle recurring amount to its monthly equivalent so
 * a $1200/year plan and a $100/month plan both surface as $100 of MRR.
 * Weekly is approximated at 4 weeks/month (matches historical
 * dashboard code -- keep in sync if this changes).
 */
export function normalizeCentsToMonthly(cents: number, billingCycle: string): number {
  switch (billingCycle) {
    case "WEEKLY": return cents * 4;
    case "MONTHLY": return cents;
    case "QUARTERLY": return Math.round(cents / 3);
    case "SEMI_ANNUALLY": return Math.round(cents / 6);
    case "YEARLY": return Math.round(cents / 12);
    default: return cents;
  }
}

/**
 * Single-source MRR contribution for one membership. Returns 0 for
 * anything that fails the billable check OR whose effective price is
 * zero after discounts. Every dashboard / report that surfaces "monthly
 * recurring revenue" should go through here so numbers match.
 */
export function computeMembershipMonthlyRecurringCents(
  membership: BillableMembershipInput & {
    customPriceCents: number | null;
    membershipPlan: BillableMembershipInput["membershipPlan"] & { priceCents: number | null };
  },
  discountRows: MemberDiscountRowForMath[],
  now: Date = new Date(),
): number {
  if (!isBillableMembership(membership, now)) return 0;
  const raw = membership.customPriceCents ?? membership.membershipPlan.priceCents ?? 0;
  const effective = getEffectivePriceAfterDiscountCents(raw, discountRows);
  if (effective <= 0) return 0;
  return normalizeCentsToMonthly(effective, membership.membershipPlan.billingCycle);
}
