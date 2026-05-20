// Attendance window: each rank in a Style's beltConfig can specify a
// time window for how far back classes count toward the next promotion.
// Example: if Yellow Belt has attendanceWindow { value: 6, unit: "months" }
// and the next promotion ceremony is March 15, the member's classes only
// count from Sept 15 → March 15. Classes before Sept 15 don't qualify.
//
// Used by /api/promotions/eligible to filter attendance entries.

export type DurationUnit = "days" | "weeks" | "months" | "years";

export type AttendanceWindow = {
  value: number | null | undefined;
  unit?: DurationUnit | string;
};

/**
 * Subtract an attendance window from an end date and return the start of
 * the window. Returns null if the window has no value (treat as unlimited).
 */
export function computeWindowStart(
  endDate: Date,
  window: AttendanceWindow | null | undefined,
): Date | null {
  if (!window || window.value == null) return null;
  const value = Number(window.value);
  if (!Number.isFinite(value) || value <= 0) return null;

  const d = new Date(endDate.getTime());
  const unit = (window.unit || "months").toString();

  if (unit === "days") {
    d.setDate(d.getDate() - value);
  } else if (unit === "weeks") {
    d.setDate(d.getDate() - value * 7);
  } else if (unit === "years") {
    d.setFullYear(d.getFullYear() - value);
  } else {
    // default: months
    d.setMonth(d.getMonth() - value);
  }
  return d;
}

/**
 * Effective start date for counting attendance toward the next promotion.
 * Takes the LATER of:
 *   - the member's attendanceResetDate for this style (e.g. last promotion)
 *   - endDate minus the rank's attendanceWindow (e.g. event date - 6 months)
 *
 * Returns null when neither bound applies (count everything).
 */
export function effectiveAttendanceStart(opts: {
  endDate: Date;
  resetDate: Date | null;
  window: AttendanceWindow | null | undefined;
}): Date | null {
  const windowStart = computeWindowStart(opts.endDate, opts.window);
  if (opts.resetDate && windowStart) {
    return opts.resetDate > windowStart ? opts.resetDate : windowStart;
  }
  return opts.resetDate ?? windowStart;
}
