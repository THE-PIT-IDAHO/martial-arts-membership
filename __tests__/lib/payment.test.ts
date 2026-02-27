import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    settings: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    pOSTransaction: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/paypal", () => ({
  getPayPalConfig: vi.fn(),
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
  getPayPalOrderStatus: vi.fn(),
  refundPayPalCapture: vi.fn(),
  chargePayPalVaultedToken: vi.fn(),
}));

vi.mock("@/lib/square", () => ({
  getSquareConfig: vi.fn(),
  createSquarePaymentLink: vi.fn(),
  getSquarePaymentLinkOrder: vi.fn(),
  refundSquarePayment: vi.fn(),
  chargeSquareStoredCard: vi.fn(),
  getOrCreateSquareCustomer: vi.fn(),
}));

vi.mock("@/lib/billing", () => ({
  calculateNextPaymentDate: vi.fn(() => new Date()),
}));

import {
  getActiveProcessor,
  getCurrency,
  createRefund,
} from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { getPayPalConfig, refundPayPalCapture } from "@/lib/paypal";
import { getSquareConfig, refundSquarePayment } from "@/lib/square";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getActiveProcessor
// ---------------------------------------------------------------------------

describe("getActiveProcessor", () => {
  it("returns the active processor from settings", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      key: "payment_active_processor",
      value: "stripe",
    });

    const result = await getActiveProcessor();
    expect(result).toBe("stripe");
  });

  it("returns paypal when set as active", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      key: "payment_active_processor",
      value: "paypal",
    });

    const result = await getActiveProcessor();
    expect(result).toBe("paypal");
  });

  it("returns square when set as active", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      key: "payment_active_processor",
      value: "square",
    });

    const result = await getActiveProcessor();
    expect(result).toBe("square");
  });

  it("returns null when set to 'none'", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      key: "payment_active_processor",
      value: "none",
    });
    (prisma.settings.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await getActiveProcessor();
    expect(result).toBeNull();
  });

  it("falls back to checking enabled flags when no active_processor set", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (prisma.settings.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { key: "payment_stripe_enabled", value: "false" },
      { key: "payment_paypal_enabled", value: "true" },
      { key: "payment_square_enabled", value: "false" },
    ]);

    const result = await getActiveProcessor();
    expect(result).toBe("paypal");
  });

  it("returns null when no processor is enabled", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (prisma.settings.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await getActiveProcessor();
    expect(result).toBeNull();
  });

  it("prefers stripe in fallback order", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (prisma.settings.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { key: "payment_stripe_enabled", value: "true" },
      { key: "payment_paypal_enabled", value: "true" },
    ]);

    const result = await getActiveProcessor();
    expect(result).toBe("stripe");
  });
});

// ---------------------------------------------------------------------------
// getCurrency
// ---------------------------------------------------------------------------

describe("getCurrency", () => {
  it("returns currency from settings (lowercased)", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      key: "currency",
      value: "EUR",
    });

    const result = await getCurrency();
    expect(result).toBe("eur");
  });

  it("defaults to usd when no setting exists", async () => {
    (prisma.settings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await getCurrency();
    expect(result).toBe("usd");
  });
});

// ---------------------------------------------------------------------------
// createRefund
// ---------------------------------------------------------------------------

describe("createRefund", () => {
  it("calls stripe refund for stripe processor", async () => {
    const mockRefundsCreate = vi.fn().mockResolvedValueOnce({ id: "re_123" });
    (getStripeClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      refunds: { create: mockRefundsCreate },
    });

    const result = await createRefund("pi_123", "stripe");
    expect(result.success).toBe(true);
    expect(mockRefundsCreate).toHaveBeenCalledWith({ payment_intent: "pi_123" });
  });

  it("returns error when stripe not configured", async () => {
    (getStripeClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await createRefund("pi_123", "stripe");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Stripe not configured");
  });

  it("calls paypal refund for paypal processor", async () => {
    (getPayPalConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      clientId: "id",
      clientSecret: "secret",
      sandbox: true,
    });
    (refundPayPalCapture as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const result = await createRefund("cap_123", "paypal", 5000, "usd");
    expect(result.success).toBe(true);
    expect(refundPayPalCapture).toHaveBeenCalled();
  });

  it("returns error when paypal not configured", async () => {
    (getPayPalConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await createRefund("cap_123", "paypal");
    expect(result.success).toBe(false);
    expect(result.error).toBe("PayPal not configured");
  });

  it("calls square refund for square processor", async () => {
    (getSquareConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accessToken: "token",
      locationId: "loc",
      applicationId: "app",
      sandbox: true,
    });
    (refundSquarePayment as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const result = await createRefund("pmt_123", "square", 5000, "usd");
    expect(result.success).toBe(true);
    expect(refundSquarePayment).toHaveBeenCalled();
  });

  it("returns error when square not configured", async () => {
    (getSquareConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const result = await createRefund("pmt_123", "square", 5000, "usd");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Square not configured");
  });

  it("returns error for square when amount/currency missing", async () => {
    (getSquareConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accessToken: "token",
      locationId: "loc",
      applicationId: "app",
      sandbox: true,
    });

    const result = await createRefund("pmt_123", "square");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Amount and currency required");
  });

  it("catches and returns errors from processor APIs", async () => {
    (getStripeClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      refunds: { create: vi.fn().mockRejectedValueOnce(new Error("Insufficient funds")) },
    });

    const result = await createRefund("pi_123", "stripe");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient funds");
  });
});
