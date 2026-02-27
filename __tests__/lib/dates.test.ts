import { describe, it, expect } from "vitest";
import {
  parseLocalDate,
  parseDateWithTimezone,
  formatLocalDate,
  getTodayString,
  formatInTimezone,
  formatDateInTimezone,
  getTodayInTimezone,
} from "@/lib/dates";

describe("parseLocalDate", () => {
  it("parses date-only string to noon local time", () => {
    const result = parseLocalDate("2024-03-15");
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(12);
  });

  it("parses ISO string with T component as-is", () => {
    const result = parseLocalDate("2024-03-15T08:30:00Z");
    expect(result.getFullYear()).toBe(2024);
  });

  it("handles leap year date", () => {
    const result = parseLocalDate("2024-02-29");
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });
});

describe("parseDateWithTimezone", () => {
  it("parses with timezone offset", () => {
    const result = parseDateWithTimezone("2024-06-15", 300); // UTC-5 (EST)
    expect(result.getFullYear()).toBe(2024);
  });

  it("falls back to noon local when no offset provided", () => {
    const result = parseDateWithTimezone("2024-06-15");
    expect(result.getHours()).toBe(12);
    expect(result.getDate()).toBe(15);
  });

  it("passes through ISO strings with T unchanged", () => {
    const result = parseDateWithTimezone("2024-06-15T10:00:00Z", 300);
    expect(result.getFullYear()).toBe(2024);
  });
});

describe("formatLocalDate", () => {
  it("formats Date to YYYY-MM-DD", () => {
    const date = new Date(2024, 2, 15, 12, 0, 0); // March 15
    expect(formatLocalDate(date)).toBe("2024-03-15");
  });

  it("pads single-digit month and day", () => {
    const date = new Date(2024, 0, 5, 12, 0, 0); // Jan 5
    expect(formatLocalDate(date)).toBe("2024-01-05");
  });

  it("handles December 31", () => {
    const date = new Date(2024, 11, 31, 12, 0, 0);
    expect(formatLocalDate(date)).toBe("2024-12-31");
  });
});

describe("getTodayString", () => {
  it("returns a valid YYYY-MM-DD string", () => {
    expect(getTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches today's date", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(getTodayString()).toBe(expected);
  });
});

describe("formatInTimezone", () => {
  it("formats date in US Eastern timezone", () => {
    const date = new Date("2024-07-04T12:00:00Z");
    const result = formatInTimezone(date, "America/New_York", { year: "numeric", month: "2-digit", day: "2-digit" });
    expect(result).toContain("2024");
  });

  it("formats date in Pacific timezone", () => {
    const date = new Date("2024-01-01T04:00:00Z"); // Still Dec 31 in Pacific
    const result = formatInTimezone(date, "America/Los_Angeles", { month: "numeric", day: "numeric" });
    expect(result).toContain("12"); // December
  });
});

describe("formatDateInTimezone", () => {
  it("returns YYYY-MM-DD format", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const result = formatDateInTimezone(date, "America/New_York");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles timezone date boundary (UTC midnight → previous day in US)", () => {
    const date = new Date("2024-06-15T02:00:00Z"); // 2 AM UTC = still June 14 in Pacific
    const result = formatDateInTimezone(date, "America/Los_Angeles");
    expect(result).toBe("2024-06-14");
  });
});

describe("getTodayInTimezone", () => {
  it("returns a valid YYYY-MM-DD string", () => {
    expect(getTodayInTimezone("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a valid date for different timezones", () => {
    const ny = getTodayInTimezone("America/New_York");
    const tokyo = getTodayInTimezone("Asia/Tokyo");
    // Both should be valid dates
    expect(ny).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tokyo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
