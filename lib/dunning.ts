/**
 * Dunning / payment retry utilities.
 * Defines retry schedule, email escalation levels, and suspension thresholds.
 */

/** Retry schedule: days until next retry attempt based on current retry count */
const RETRY_SCHEDULE_DAYS = [3, 7, 14, 30]; // after 1st fail: 3d, after 2nd: 7d, etc.

export type DunningLevel = "friendly" | "urgent" | "final" | "suspension";

/** Get days until next retry attempt */
export function getRetryDelayDays(retryCount: number): number {
  if (retryCount >= RETRY_SCHEDULE_DAYS.length) {
    return RETRY_SCHEDULE_DAYS[RETRY_SCHEDULE_DAYS.length - 1];
  }
  return RETRY_SCHEDULE_DAYS[retryCount];
}

/** Calculate next retry date from now */
export function calculateNextRetryDate(retryCount: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + getRetryDelayDays(retryCount));
  return d;
}

/** Get the email escalation level based on retry count */
export function getDunningEmailLevel(retryCount: number): DunningLevel {
  if (retryCount <= 1) return "friendly";
  if (retryCount === 2) return "urgent";
  if (retryCount === 3) return "final";
  return "suspension";
}

/** Whether this retry count should trigger membership suspension */
export function shouldSuspendMembership(retryCount: number, maxRetries: number): boolean {
  return retryCount >= maxRetries;
}
