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

/** Calculate contract end date from start + plan.contractLengthMonths */
export function calculateContractEndDate(
  startDate: Date | string,
  contractLengthMonths: number
): Date {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + contractLengthMonths);
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
