/**
 * Shared billing utility functions.
 * Consolidates calculateNextPaymentDate (previously duplicated in memberships + POS routes)
 * and adds billing period calculation helpers for the invoice system.
 */

import { prisma } from "@/lib/prisma";

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

/**
 * Draws down the member's accountCreditCents against the invoice
 * BEFORE the payment processor is touched. Auto-billing (and the
 * manual "Charge Now" path) call this first, then only charge the
 * card / PayPal / Square for whatever is still owed.
 *
 *   * Debits Member.accountCreditCents by the applied amount.
 *   * Adds the applied amount to Invoice.creditAppliedCents (running
 *     total -- callers can invoke this on the same invoice more
 *     than once without double-charging the member's credit).
 *   * If credit fully covers the amount owed, flips the invoice to
 *     PAID with paymentMethod = "ACCOUNT_CREDIT" so the past-due
 *     sweep leaves it alone and the invoice shows a clean receipt.
 *
 * Everything runs inside one Prisma transaction so a race between
 * two charge paths on the same invoice can't debit the credit
 * twice. Returns 0-applied when the member has no credit on file --
 * safe to call unconditionally.
 */
export async function applyAccountCreditToInvoice(params: {
  memberId: string;
  invoiceId: string;
  amountOwed: number;
}): Promise<{
  creditApplied: number;
  remainingCents: number;
  fullyPaidByCredit: boolean;
}> {
  if (params.amountOwed <= 0) {
    return { creditApplied: 0, remainingCents: 0, fullyPaidByCredit: true };
  }
  return await prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: params.memberId },
      select: { accountCreditCents: true },
    });
    const available = member?.accountCreditCents ?? 0;
    if (available <= 0) {
      return { creditApplied: 0, remainingCents: params.amountOwed, fullyPaidByCredit: false };
    }
    const creditApplied = Math.min(available, params.amountOwed);
    const remainingCents = params.amountOwed - creditApplied;

    await tx.member.update({
      where: { id: params.memberId },
      data: { accountCreditCents: { decrement: creditApplied } },
    });

    if (remainingCents === 0) {
      await tx.invoice.update({
        where: { id: params.invoiceId },
        data: {
          creditAppliedCents: { increment: creditApplied },
          status: "PAID",
          paidAt: new Date(),
          paymentMethod: "ACCOUNT_CREDIT",
          nextRetryDate: null,
        },
      });
      return { creditApplied, remainingCents: 0, fullyPaidByCredit: true };
    }

    await tx.invoice.update({
      where: { id: params.invoiceId },
      data: { creditAppliedCents: { increment: creditApplied } },
    });
    return { creditApplied, remainingCents, fullyPaidByCredit: false };
  });
}
