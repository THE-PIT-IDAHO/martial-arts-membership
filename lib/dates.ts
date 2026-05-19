/**
 * Date utilities for timezone-aware date handling
 *
 * --- Design ---
 * Each gym has a single source-of-truth timezone in `Settings.timezone`
 * (IANA name, e.g. "America/Denver"). Server routes that compare or
 * project times should always resolve it via `getGymTimezone(clientId)`
 * and then use the helpers here — never raw `.getHours()`, `.getDay()`,
 * `.toISOString().split('T')` or `setHours(...)` on the server, since
 * those return UTC values on Vercel and silently break for any client
 * not on UTC.
 *
 * --- Common patterns ---
 *
 *   const tz = await getGymTimezone(clientId);
 *
 *   // "What's today in the gym's local calendar?"
 *   const today = getTodayInTimezone(tz);          // "YYYY-MM-DD"
 *
 *   // "What's the local YYYY-MM-DD for this UTC timestamp?"
 *   formatDateInTimezone(someDate, tz);            // "YYYY-MM-DD"
 *
 *   // "What's the local day-of-week (0-6) of this UTC timestamp?"
 *   getDayOfWeekInTimezone(someDate, tz);
 *
 *   // "What UTC ms is the start-of-day of this local YYYY-MM-DD?"
 *   localMidnightUtc("2026-05-19", tz);
 *
 *   // "Given a recurring class's startsAt, what's the UTC ts of its
 *   //  occurrence on a particular local booking date?"
 *   occurrenceForDate(classStartsAt, "2026-05-19", tz);
 */

import { prisma } from "@/lib/prisma";

/**
 * Parse a date string (YYYY-MM-DD) to a Date object in local timezone
 * This ensures the date doesn't shift due to timezone conversion
 */
export function parseLocalDate(dateString: string): Date {
  // If the string already has time component, parse normally
  if (dateString.includes("T")) {
    return new Date(dateString);
  }

  // For date-only strings, parse as local date by adding noon time
  // Using noon ensures the date is correct regardless of timezone
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Parse a date string to a Date object, using the provided timezone offset
 * @param dateString - Date string in YYYY-MM-DD format
 * @param timezoneOffset - Timezone offset in minutes (from client's Date.getTimezoneOffset())
 */
export function parseDateWithTimezone(dateString: string, timezoneOffset?: number): Date {
  // If the string already has time component, parse normally
  if (dateString.includes("T")) {
    return new Date(dateString);
  }

  // Parse the date parts
  const [year, month, day] = dateString.split("-").map(Number);

  if (timezoneOffset !== undefined) {
    // Create date in UTC at midnight, then adjust for timezone
    const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    // Add the timezone offset to get the correct local time
    // getTimezoneOffset returns positive for west of UTC, negative for east
    utcDate.setMinutes(utcDate.getMinutes() + timezoneOffset);
    return utcDate;
  }

  // Fallback: use noon local time to avoid date shifting
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Format a Date to YYYY-MM-DD string in local timezone
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 */
export function getTodayString(): string {
  return formatLocalDate(new Date());
}

/**
 * Format a Date for display using the gym's configured timezone.
 * Uses Intl.DateTimeFormat so it works on any server regardless of server TZ.
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(date);
}

/**
 * Format a Date to YYYY-MM-DD string in a specific IANA timezone.
 * Useful for server-side date checks when the server may not be in the gym's timezone.
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date); // en-CA → YYYY-MM-DD
}

/**
 * Get today's YYYY-MM-DD string in a specific IANA timezone.
 */
export function getTodayInTimezone(timezone: string): string {
  return formatDateInTimezone(new Date(), timezone);
}

/**
 * Default fallback timezone when a gym hasn't set one. Picked once so behavior
 * is consistent across the codebase.
 */
export const DEFAULT_TIMEZONE = "America/Denver";

/**
 * Resolve the gym's IANA timezone from the Settings table. Falls back to
 * DEFAULT_TIMEZONE if not configured.
 *
 * Pass clientId for proper multi-tenant scoping (recommended). Without it,
 * the lookup returns the first matching row regardless of tenant.
 */
export async function getGymTimezone(clientId?: string): Promise<string> {
  try {
    const row = clientId
      ? await prisma.settings.findUnique({ where: { key_clientId: { key: "timezone", clientId } } })
      : await prisma.settings.findFirst({ where: { key: "timezone" } });
    return row?.value || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Day-of-week (0=Sunday, 6=Saturday) of a UTC timestamp expressed in a
 * specific IANA timezone. Use this when matching recurring schedules
 * against the gym's local day instead of the server's UTC day.
 */
export function getDayOfWeekInTimezone(date: Date, timezone: string): number {
  // "long" weekday name → map to index (more reliable than parsing locale parts)
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(date);
  const map: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
  };
  return map[name] ?? new Date(date).getDay();
}

/**
 * Extract the local Y/M/D/h/m of a UTC timestamp in a specific timezone.
 */
export function getLocalParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => {
    const v = parts.find((p) => p.type === type)?.value || "0";
    return parseInt(v, 10);
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * UTC timestamp (ms) of "local midnight" for a given local YYYY-MM-DD in a
 * specific timezone. Uses a binary refinement so it's correct across DST.
 */
export function localMidnightUtc(localYmd: string, timezone: string): number {
  const [y, m, d] = localYmd.split("-").map((n) => parseInt(n, 10));
  // Initial guess: treat as UTC.
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Format that guess back in the gym's TZ and adjust if there's a drift.
  for (let i = 0; i < 2; i++) {
    const p = getLocalParts(new Date(guess), timezone);
    const gotMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const targetMs = Date.UTC(y, m - 1, d, 0, 0);
    const drift = targetMs - gotMs;
    if (drift === 0) break;
    guess += drift;
  }
  return guess;
}

/**
 * Given a recurring class's stored UTC startsAt and a target local booking
 * date (YYYY-MM-DD), return the UTC timestamp of that occurrence on the
 * booking date in the gym's timezone.
 *
 * Day-difference is anchored at UTC noon so DST shifts don't throw off the
 * math. (DST itself can move the absolute UTC time of the occurrence by an
 * hour vs. the original — that's the actual behavior we want: an 18:00
 * local class stays 18:00 local across DST.)
 */
export function occurrenceForDate(
  classStartsAtUtc: Date,
  bookingLocalYmd: string,
  timezone: string,
): Date {
  const classLocalYmd = formatDateInTimezone(classStartsAtUtc, timezone);
  // Compute "ms into the local day" from the original — same wall-clock time
  // applied to the target date. Using getLocalParts handles the case where
  // the stored UTC is on a different UTC date than its local date.
  const localParts = getLocalParts(classStartsAtUtc, timezone);
  const msIntoLocalDay = (localParts.hour * 60 + localParts.minute) * 60 * 1000;
  // Anchor day-diff at UTC noon to dodge DST artifacts at midnight.
  const classAnchor = new Date(classLocalYmd + "T12:00:00Z").getTime();
  const bookingAnchor = new Date(bookingLocalYmd + "T12:00:00Z").getTime();
  const daysDiff = Math.round((bookingAnchor - classAnchor) / (24 * 60 * 60 * 1000));
  const occurrenceLocalMidnight = localMidnightUtc(bookingLocalYmd, timezone);
  // Sanity: if daysDiff math agrees with localMidnightUtc, both give same instant.
  // Either way, build occurrence from local midnight + the local time-of-day.
  void daysDiff;
  return new Date(occurrenceLocalMidnight + msIntoLocalDay);
}
