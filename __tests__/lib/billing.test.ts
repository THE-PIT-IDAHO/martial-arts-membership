import { describe, it, expect } from "vitest";
import {
  calculateNextPaymentDate,
  calculateBillingPeriodEnd,
  getEffectivePriceCents,
  applyFamilyDiscount,
  generateInvoiceNumber,
} from "@/lib/billing";

describe("calculateNextPaymentDate", () => {
  const start = new Date("2024-01-15T12:00:00");

  it("DAILY adds 1 day", () => {
    const result = calculateNextPaymentDate(start, "DAILY");
    expect(result.getDate()).toBe(16);
    expect(result.getMonth()).toBe(0);
  });

  it("WEEKLY adds 7 days", () => {
    const result = calculateNextPaymentDate(start, "WEEKLY");
    expect(result.getDate()).toBe(22);
  });

  it("MONTHLY adds 1 month", () => {
    const result = calculateNextPaymentDate(start, "MONTHLY");
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(15);
  });

  it("QUARTERLY adds 3 months", () => {
    const result = calculateNextPaymentDate(start, "QUARTERLY");
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(15);
  });

  it("SEMI_ANNUALLY adds 6 months", () => {
    const result = calculateNextPaymentDate(start, "SEMI_ANNUALLY");
    expect(result.getMonth()).toBe(6); // July
  });

  it("SEMI-ANNUALLY variant also works", () => {
    const result = calculateNextPaymentDate(start, "SEMI-ANNUALLY");
    expect(result.getMonth()).toBe(6);
  });

  it("YEARLY adds 1 year", () => {
    const result = calculateNextPaymentDate(start, "YEARLY");
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
  });

  it("ANNUALLY variant also works", () => {
    const result = calculateNextPaymentDate(start, "ANNUALLY");
    expect(result.getFullYear()).toBe(2025);
  });

  it("defaults to MONTHLY for unknown cycle", () => {
    const result = calculateNextPaymentDate(start, "BIWEEKLY");
    expect(result.getMonth()).toBe(1);
  });

  it("handles lowercase input", () => {
    const result = calculateNextPaymentDate(start, "monthly");
    expect(result.getMonth()).toBe(1);
  });

  it("does not mutate the original date", () => {
    const original = new Date("2024-01-15T12:00:00");
    const originalTime = original.getTime();
    calculateNextPaymentDate(original, "MONTHLY");
    expect(original.getTime()).toBe(originalTime);
  });

  it("handles month rollover (Jan 31 + 1 month)", () => {
    const jan31 = new Date("2024-01-31T12:00:00");
    const result = calculateNextPaymentDate(jan31, "MONTHLY");
    // JS Date: Jan 31 + 1 month = Mar 2 (Feb has 29 days in 2024)
    expect(result.getMonth()).toBe(2); // March
  });
});

describe("calculateBillingPeriodEnd", () => {
  it("returns next payment date minus 1 day", () => {
    const start = new Date("2024-01-15T12:00:00");
    const end = calculateBillingPeriodEnd(start, "MONTHLY");
    expect(end.getMonth()).toBe(1); // Feb
    expect(end.getDate()).toBe(14);
  });

  it("works for YEARLY", () => {
    const start = new Date("2024-01-01T12:00:00");
    const end = calculateBillingPeriodEnd(start, "YEARLY");
    expect(end.getFullYear()).toBe(2024);
    expect(end.getMonth()).toBe(11); // Dec
    expect(end.getDate()).toBe(31);
  });
});

describe("getEffectivePriceCents", () => {
  const plan = { priceCents: 10000 };

  it("returns plan price when customPriceCents is null", () => {
    const membership = { customPriceCents: null, firstMonthDiscountOnly: false, startDate: new Date() };
    expect(getEffectivePriceCents(membership, plan, new Date())).toBe(10000);
  });

  it("returns custom price when set and not first-month-only", () => {
    const membership = { customPriceCents: 5000, firstMonthDiscountOnly: false, startDate: new Date() };
    expect(getEffectivePriceCents(membership, plan, new Date())).toBe(5000);
  });

  it("returns custom price in first period when firstMonthDiscountOnly", () => {
    const startDate = new Date("2024-01-01T12:00:00");
    const membership = { customPriceCents: 5000, firstMonthDiscountOnly: true, startDate };
    const billingStart = new Date("2024-01-01T12:00:00");
    expect(getEffectivePriceCents(membership, plan, billingStart)).toBe(5000);
  });

  it("returns plan price after first period when firstMonthDiscountOnly", () => {
    const startDate = new Date("2024-01-01T12:00:00");
    const membership = { customPriceCents: 5000, firstMonthDiscountOnly: true, startDate };
    const billingStart = new Date("2024-02-01T12:00:00");
    expect(getEffectivePriceCents(membership, plan, billingStart)).toBe(10000);
  });

  it("handles string startDate", () => {
    const membership = { customPriceCents: 5000, firstMonthDiscountOnly: true, startDate: "2024-01-01" };
    const billingStart = new Date("2024-02-01T12:00:00");
    expect(getEffectivePriceCents(membership, plan, billingStart)).toBe(10000);
  });

  it("handles null plan price", () => {
    const membership = { customPriceCents: null, firstMonthDiscountOnly: false, startDate: new Date() };
    expect(getEffectivePriceCents(membership, { priceCents: null }, new Date())).toBe(0);
  });
});

describe("applyFamilyDiscount", () => {
  it("returns original amount when fewer than 2 family members", () => {
    expect(applyFamilyDiscount(10000, 10, 1)).toBe(10000);
  });

  it("returns original amount when discount is 0", () => {
    expect(applyFamilyDiscount(10000, 0, 3)).toBe(10000);
  });

  it("applies 10% discount for 2+ family members", () => {
    expect(applyFamilyDiscount(10000, 10, 2)).toBe(9000);
  });

  it("applies 25% discount", () => {
    expect(applyFamilyDiscount(10000, 25, 3)).toBe(7500);
  });

  it("never goes below 0", () => {
    expect(applyFamilyDiscount(100, 200, 2)).toBe(0);
  });

  it("rounds the discount correctly", () => {
    // 33% of 10000 = 3333.33 → rounds to 3333
    expect(applyFamilyDiscount(10000, 33, 2)).toBe(6700);
  });
});

describe("generateInvoiceNumber", () => {
  it("starts with INV-", () => {
    expect(generateInvoiceNumber()).toMatch(/^INV-/);
  });

  it("has format INV-YYYYMMDD-XXXX", () => {
    expect(generateInvoiceNumber()).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
  });

  it("generates unique numbers", () => {
    const a = generateInvoiceNumber();
    const b = generateInvoiceNumber();
    expect(a).not.toBe(b);
  });
});
