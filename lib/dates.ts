/**
 * Date utilities for timezone-aware date handling
 *
 * When parsing date-only strings (e.g., "2024-12-02"), JavaScript interprets
 * them as UTC midnight. This can cause the date to appear as the previous day
 * when converted to local time in timezones west of UTC.
 *
 * These utilities ensure dates are correctly interpreted in the client's timezone.
 */

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
