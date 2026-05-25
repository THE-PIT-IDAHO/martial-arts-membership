/**
 * Shared billing utility functions.
 * Consolidates calculateNextPaymentDate (previously duplicated in memberships + POS routes)
 * and adds billing period calculation helpers for the invoice system.
 */

export function calculateNextPaymentDate(startDate: Date, billingCycle: string): Date {
  const nextDate = new Date(startDate);
  const cycle = billingCycle?.toUpperCase() || "MONTHLY";

  switch (cycle) {
    case "DAILY":
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case "WEEKLY":
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case "MONTHLY":
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case "QUARTERLY":
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case "SEMI_ANNUALLY":
    case "SEMI-ANNUALLY":
    case "SEMIANNUALLY":
      nextDate.setMonth(nextDate.getMonth() + 6);
      break;
    case "YEARLY":
    case "ANNUALLY":
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }

  return nextDate;
}

/** Billing period end = one cycle after start, minus 1 day. */
export function calculateBillingPeriodEnd(periodStart: Date, billingCycle: string): Date {
  const end = calculateNextPaymentDate(periodStart, billingCycle);
  end.setDate(end.getDate() - 1);
  return end;
}

/**
 * Determine the effective price for a billing event.
 *
 * Under the current POS model, customPriceCents IS the recurring amount —
 * set by the admin's Price input in the Configure Membership modal. Auto-
 * billing charges that amount every cycle; the plan price is only used as
 * a fallback when no override was set.
 *
 * firstMonthDiscountOnly used to flip behavior — customPriceCents only for
 * the first cycle, then plan price thereafter — back when the POS Price
 * and Discount inputs were entangled. That semantic was retired; the field
 * is informational only now (records whether a first-payment discount was
 * applied at signup, but doesn't change what recurs).
 *
 * billingPeriodStart is kept in the signature for callers that already
 * pass it, but it's no longer needed.
 */
export function getEffectivePriceCents(
  membership: {
    customPriceCents: number | null;
    firstMonthDiscountOnly?: boolean;
    startDate?: Date | string;
  },
  plan: { priceCents: number | null },
  _billingPeriodStart?: Date,
): number {
  const planPrice = plan.priceCents ?? 0;
  return membership.customPriceCents ?? planPrice;
}

/** Apply family discount: reduces amount by familyDiscountPercent per additional member. */
export function applyFamilyDiscount(
  amountCents: number,
  familyDiscountPercent: number,
  familyMemberCount: number
): number {
  if (familyMemberCount < 2 || !familyDiscountPercent) return amountCents;
  const discount = Math.round(amountCents * (familyDiscountPercent / 100));
  return Math.max(0, amountCents - discount);
}

/** Generate a human-readable invoice number: INV-YYYYMMDD-XXXX */
export function generateInvoiceNumber(): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${date}-${rand}`;
}
