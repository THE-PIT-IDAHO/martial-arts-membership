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
