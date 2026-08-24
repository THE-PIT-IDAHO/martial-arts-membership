/**
 * Contract enforcement utilities
 * Handles contract end dates, early termination fees, and cancellation notice periods.
 */

interface MembershipForContract {
  startDate: Date | string;
  contractEndDate?: Date | string | null;
}

interface PlanForContract {
  contractLengthMonths?: number | null;
  cancellationFeeCents?: number | null;
  cancellationNoticeDays?: number | null;
}

/**
 * Calculate contract end date from start + plan.contractLengthMonths.
 *
 * End-EXCLUSIVE semantics: a 1-year contract starting Apr 1 ends
 * Mar 31 the following year; the next billing period picks up Apr 1.
 * The old implementation returned Apr 1 -> Apr 1 which effectively
 * gave the member one extra day and made the contract end date look
 * identical to the next-payment date.
 */
export function calculateContractEndDate(
  startDate: Date | string,
  contractLengthMonths: number
): Date {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + contractLengthMonths);
  d.setDate(d.getDate() - 1);
  return d;
}

/** Check if a membership is currently under contract */
export function isUnderContract(membership: MembershipForContract): boolean {
  if (!membership.contractEndDate) return false;
  return new Date(membership.contractEndDate) > new Date();
}

/** Get early termination fee in cents (0 if not under contract or no fee configured) */
export function calculateEarlyTerminationFee(
  membership: MembershipForContract,
  plan: PlanForContract
): number {
  if (!isUnderContract(membership)) return 0;
  return plan.cancellationFeeCents || 0;
}

/** Calculate when a cancellation takes effect (now + notice days) */
export function calculateCancellationEffectiveDate(
  plan: PlanForContract
): Date {
  const d = new Date();
  const noticeDays = plan.cancellationNoticeDays || 0;
  d.setDate(d.getDate() + noticeDays);
  return d;
}
