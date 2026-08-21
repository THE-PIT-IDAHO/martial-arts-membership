import { formatDateInTimezone, getDayOfWeekInTimezone } from "@/lib/dates";

/**
 * Shared "does this class actually run on this local date?" check.
 *
 * Used by:
 *   - /api/portal/bookings   -> hide ClassBooking rows that no longer
 *                              line up with the class schedule (ghost
 *                              bookings created before a schedule edit)
 *   - lib/ghost-bookings.ts  -> delete those same rows
 *
 * Matches the admin calendar's getClassesForDate rules from
 * /api/portal/classes: excludedDates, day-of-week (in the gym's local
 * timezone -- server runs UTC, so a class at 7pm Mountain stored as
 * next-day 01:00 UTC otherwise looks like a Saturday class), schedule
 * window, and frequency interval.
 *
 * Deliberately does NOT apply the "past today's start time" cutoff or
 * anything about member eligibility -- those are display concerns for
 * booking availability, not "does this booking still line up with a
 * real class occurrence" checks.
 */
export interface OccurrenceCheckClass {
  startsAt: Date;
  isRecurring: boolean;
  isOngoing: boolean;
  scheduleStartDate?: Date | null;
  scheduleEndDate?: Date | null;
  excludedDates?: string | null;
  frequencyNumber?: number | null;
  frequencyUnit?: string | null;
  classType?: string | null;
}

/**
 * @param cls        ClassSession row (schedule fields only)
 * @param localYmd   Target date as YYYY-MM-DD in the gym's local time
 * @param gymTz      IANA timezone, e.g. "America/Denver"
 */
export function classRunsOnDate(
  cls: OccurrenceCheckClass,
  localYmd: string,
  gymTz: string,
): boolean {
  // Admin calendar skips imported classes; be consistent.
  if (cls.classType === "Imported") return false;

  // Excluded dates always win.
  if (cls.excludedDates) {
    try {
      const excluded: string[] = JSON.parse(cls.excludedDates);
      if (excluded.includes(localYmd)) return false;
    } catch {
      /* malformed -> assume no exclusions */
    }
  }

  // One-off classes: startsAt's local date must equal the target.
  if (!cls.isRecurring) {
    return formatDateInTimezone(cls.startsAt, gymTz) === localYmd;
  }

  // --- Recurring: mirror /api/portal/classes filter logic exactly. ---

  // Day-of-week must match (in the gym's local timezone).
  const targetLocalMs = utcMsForLocalMidnight(localYmd, gymTz);
  const targetLocalNoon = new Date(targetLocalMs + 12 * 60 * 60 * 1000);
  const targetDow = getDayOfWeekInTimezone(targetLocalNoon, gymTz);
  const classDow = getDayOfWeekInTimezone(cls.startsAt, gymTz);
  if (targetDow !== classDow) return false;

  // Schedule window. If scheduleStartDate is missing entirely (legacy
  // rows from before the field existed), don't hold that against the
  // booking -- we'd rather show one class Cruz already cancelled than
  // hide half a member's roster.
  if (cls.scheduleStartDate) {
    const scheduleStartLocal = formatDateInTimezone(cls.scheduleStartDate, gymTz);
    if (localYmd < scheduleStartLocal) return false;
  }

  if (!cls.isOngoing && cls.scheduleEndDate) {
    const scheduleEndLocal = formatDateInTimezone(cls.scheduleEndDate, gymTz);
    if (localYmd > scheduleEndLocal) return false;
  }

  // Frequency interval (weekly/bi-weekly/etc, daily/N-daily). Skip when
  // scheduleStartDate is unknown -- we have no anchor to count from.
  const every = cls.frequencyNumber || 1;
  if (every > 1 && cls.scheduleStartDate) {
    const unit = (cls.frequencyUnit || "Week").toLowerCase();
    const scheduleStartLocal = formatDateInTimezone(cls.scheduleStartDate, gymTz);
    const scheduleStartMs = utcMsForLocalMidnight(scheduleStartLocal, gymTz);
    const daysSinceStart = Math.round(
      (targetLocalMs - scheduleStartMs) / (24 * 60 * 60 * 1000),
    );
    if (unit === "week") {
      const weeksDiff = Math.floor(daysSinceStart / 7);
      if (weeksDiff % every !== 0) return false;
    } else if (unit === "day") {
      if (daysSinceStart % every !== 0) return false;
    }
    // Unknown unit falls through as visible.
  }

  return true;
}

/**
 * Lightweight local-midnight-in-UTC-ms lookup. Duplicated small so this
 * module doesn't import lib/dates.ts's binary refinement version (which
 * uses getLocalParts and would create a subtle cycle if anything under
 * dates.ts ever imports this file). Accurate enough for date-only math
 * against the same gym timezone we're already using elsewhere.
 */
function utcMsForLocalMidnight(localYmd: string, timezone: string): number {
  const [y, m, d] = localYmd.split("-").map((n) => parseInt(n, 10));
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (t: string) => parseInt(p.find((x) => x.type === t)?.value || "0", 10);
    const gotMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const targetMs = Date.UTC(y, m - 1, d, 0, 0);
    const drift = targetMs - gotMs;
    if (drift === 0) break;
    guess += drift;
  }
  return guess;
}
