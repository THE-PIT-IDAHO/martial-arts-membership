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
 * Handles customPriceCents and firstMonthDiscountOnly logic.
 */
export function getEffectivePriceCents(
  membership: {
    customPriceCents: number | null;
    firstMonthDiscountOnly: boolean;
    startDate: Date | string;
  },
  plan: { priceCents: number | null },
  billingPeriodStart: Date
): number {
  const planPrice = plan.priceCents ?? 0;

  if (membership.customPriceCents === null) return planPrice;

  if (membership.firstMonthDiscountOnly) {
    const startDate =
      typeof membership.startDate === "string"
        ? new Date(membership.startDate)
        : membership.startDate;
    // First period: billingPeriodStart is within 1 day of membership start
    const isFirstPeriod =
      billingPeriodStart.getTime() <= startDate.getTime() + 86400000;
    return isFirstPeriod ? membership.customPriceCents : planPrice;
  }

  return membership.customPriceCents;
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
