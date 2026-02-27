import { describe, it, expect } from "vitest";
import {
  getRetryDelayDays,
  calculateNextRetryDate,
  getDunningEmailLevel,
  shouldSuspendMembership,
} from "@/lib/dunning";

describe("getRetryDelayDays", () => {
  it("returns 3 for retry count 0 (first retry)", () => {
    expect(getRetryDelayDays(0)).toBe(3);
  });

  it("returns 7 for retry count 1", () => {
    expect(getRetryDelayDays(1)).toBe(7);
  });

  it("returns 14 for retry count 2", () => {
    expect(getRetryDelayDays(2)).toBe(14);
  });

  it("returns 30 for retry count 3", () => {
    expect(getRetryDelayDays(3)).toBe(30);
  });

  it("returns 30 for retry count 4+ (caps at last value)", () => {
    expect(getRetryDelayDays(4)).toBe(30);
    expect(getRetryDelayDays(10)).toBe(30);
  });
});

describe("calculateNextRetryDate", () => {
  it("returns a future date", () => {
    const now = Date.now();
    const result = calculateNextRetryDate(0);
    expect(result.getTime()).toBeGreaterThan(now);
  });

  it("adds 3 days for first retry", () => {
    const before = new Date();
    const result = calculateNextRetryDate(0);
    const diffDays = Math.round((result.getTime() - before.getTime()) / 86400000);
    expect(diffDays).toBe(3);
  });

  it("adds 30 days for retry count 3", () => {
    const before = new Date();
    const result = calculateNextRetryDate(3);
    const diffDays = Math.round((result.getTime() - before.getTime()) / 86400000);
    expect(diffDays).toBe(30);
  });
});

describe("getDunningEmailLevel", () => {
  it("returns friendly for retry count 0", () => {
    expect(getDunningEmailLevel(0)).toBe("friendly");
  });

  it("returns friendly for retry count 1", () => {
    expect(getDunningEmailLevel(1)).toBe("friendly");
  });

  it("returns urgent for retry count 2", () => {
    expect(getDunningEmailLevel(2)).toBe("urgent");
  });

  it("returns final for retry count 3", () => {
    expect(getDunningEmailLevel(3)).toBe("final");
  });

  it("returns suspension for retry count 4+", () => {
    expect(getDunningEmailLevel(4)).toBe("suspension");
    expect(getDunningEmailLevel(10)).toBe("suspension");
  });
});

describe("shouldSuspendMembership", () => {
  it("returns false when retry count is below max", () => {
    expect(shouldSuspendMembership(2, 4)).toBe(false);
  });

  it("returns true when retry count equals max", () => {
    expect(shouldSuspendMembership(4, 4)).toBe(true);
  });

  it("returns true when retry count exceeds max", () => {
    expect(shouldSuspendMembership(5, 4)).toBe(true);
  });

  it("returns true when max is 0 and retry count is 0", () => {
    expect(shouldSuspendMembership(0, 0)).toBe(true);
  });
});
