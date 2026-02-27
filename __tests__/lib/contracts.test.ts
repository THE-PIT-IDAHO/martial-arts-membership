import { describe, it, expect } from "vitest";
import {
  calculateContractEndDate,
  isUnderContract,
  calculateEarlyTerminationFee,
  calculateCancellationEffectiveDate,
} from "@/lib/contracts";

describe("calculateContractEndDate", () => {
  it("adds months to start date", () => {
    const result = calculateContractEndDate(new Date(2024, 0, 15, 12), 12);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });

  it("handles 6-month contract", () => {
    const result = calculateContractEndDate(new Date(2024, 2, 1, 12), 6);
    expect(result.getMonth()).toBe(8); // September
  });

  it("handles Date object input", () => {
    const result = calculateContractEndDate(new Date("2024-06-01T12:00:00"), 3);
    expect(result.getMonth()).toBe(8); // September
  });

  it("handles month overflow (Jan 31 + 1 month)", () => {
    const result = calculateContractEndDate("2024-01-31", 1);
    // JS Date: Jan 31 + 1 month = Mar 2 in 2024 (leap year, Feb has 29 days)
    expect(result.getMonth()).toBe(2); // March
  });
});

describe("isUnderContract", () => {
  it("returns false when contractEndDate is null", () => {
    expect(isUnderContract({ startDate: new Date(), contractEndDate: null })).toBe(false);
  });

  it("returns false when contractEndDate is undefined", () => {
    expect(isUnderContract({ startDate: new Date() })).toBe(false);
  });

  it("returns true when contractEndDate is in the future", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isUnderContract({ startDate: new Date(), contractEndDate: future })).toBe(true);
  });

  it("returns false when contractEndDate is in the past", () => {
    const past = new Date("2020-01-01");
    expect(isUnderContract({ startDate: new Date("2019-01-01"), contractEndDate: past })).toBe(false);
  });

  it("handles string contractEndDate", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isUnderContract({ startDate: new Date(), contractEndDate: future.toISOString() })).toBe(true);
  });
});

describe("calculateEarlyTerminationFee", () => {
  it("returns 0 when not under contract", () => {
    const membership = { startDate: new Date("2020-01-01"), contractEndDate: new Date("2020-06-01") };
    const plan = { cancellationFeeCents: 15000 };
    expect(calculateEarlyTerminationFee(membership, plan)).toBe(0);
  });

  it("returns fee when under contract", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const membership = { startDate: new Date(), contractEndDate: future };
    const plan = { cancellationFeeCents: 15000 };
    expect(calculateEarlyTerminationFee(membership, plan)).toBe(15000);
  });

  it("returns 0 when under contract but no fee configured", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const membership = { startDate: new Date(), contractEndDate: future };
    const plan = { cancellationFeeCents: null };
    expect(calculateEarlyTerminationFee(membership, plan)).toBe(0);
  });

  it("returns 0 when fee is undefined", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const membership = { startDate: new Date(), contractEndDate: future };
    const plan = {};
    expect(calculateEarlyTerminationFee(membership, plan)).toBe(0);
  });
});

describe("calculateCancellationEffectiveDate", () => {
  it("returns today when notice days is 0", () => {
    const now = new Date();
    const result = calculateCancellationEffectiveDate({ cancellationNoticeDays: 0 });
    expect(result.getDate()).toBe(now.getDate());
  });

  it("returns today when notice days is null", () => {
    const now = new Date();
    const result = calculateCancellationEffectiveDate({ cancellationNoticeDays: null });
    expect(result.getDate()).toBe(now.getDate());
  });

  it("adds 30 notice days", () => {
    const now = new Date();
    const result = calculateCancellationEffectiveDate({ cancellationNoticeDays: 30 });
    const diffDays = Math.round((result.getTime() - now.getTime()) / 86400000);
    expect(diffDays).toBe(30);
  });

  it("handles undefined notice days", () => {
    const now = new Date();
    const result = calculateCancellationEffectiveDate({});
    expect(result.getDate()).toBe(now.getDate());
  });
});
