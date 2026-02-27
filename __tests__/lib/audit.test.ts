import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing the module
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { logAudit, computeChanges } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

describe("computeChanges", () => {
  it("returns undefined when no fields changed", () => {
    const old = { name: "John", email: "john@test.com" };
    const updated = { name: "John", email: "john@test.com" };
    expect(computeChanges(old, updated, ["name", "email"])).toBeUndefined();
  });

  it("detects a single field change", () => {
    const old = { name: "John", email: "old@test.com" };
    const updated = { name: "John", email: "new@test.com" };
    const result = computeChanges(old, updated, ["name", "email"]);
    expect(result).toEqual({ email: { from: "old@test.com", to: "new@test.com" } });
  });

  it("detects multiple field changes", () => {
    const old = { name: "John", email: "old@test.com", phone: "111" };
    const updated = { name: "Jane", email: "new@test.com", phone: "111" };
    const result = computeChanges(old, updated, ["name", "email", "phone"]);
    expect(result).toEqual({
      name: { from: "John", to: "Jane" },
      email: { from: "old@test.com", to: "new@test.com" },
    });
  });

  it("treats null and undefined as equivalent", () => {
    const old = { name: null };
    const updated = { name: undefined };
    expect(computeChanges(old, updated, ["name"])).toBeUndefined();
  });

  it("detects change from null to a value", () => {
    const old = { name: null };
    const updated = { name: "John" };
    const result = computeChanges(old, updated, ["name"]);
    expect(result).toEqual({ name: { from: null, to: "John" } });
  });

  it("only checks specified fields", () => {
    const old = { name: "John", secret: "old" };
    const updated = { name: "John", secret: "new" };
    expect(computeChanges(old, updated, ["name"])).toBeUndefined();
  });

  it("compares numbers using string coercion", () => {
    const old = { price: 100 };
    const updated = { price: 200 };
    const result = computeChanges(old, updated, ["price"]);
    expect(result).toEqual({ price: { from: 100, to: 200 } });
  });
});

describe("logAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls prisma.auditLog.create with correct data", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "log-1" });

    await logAudit({
      entityType: "Member",
      entityId: "mem-123",
      action: "UPDATE",
      summary: "Updated email",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "Member",
        entityId: "mem-123",
        action: "UPDATE",
        summary: "Updated email",
        changes: null,
      },
    });
  });

  it("serializes changes to JSON", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "log-2" });

    const changes = { email: { from: "old@test.com", to: "new@test.com" } };
    await logAudit({
      entityType: "Member",
      entityId: "mem-123",
      action: "UPDATE",
      summary: "Updated email",
      changes,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: JSON.stringify(changes),
      }),
    });
  });

  it("does not throw on prisma error (fire-and-forget)", async () => {
    (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB error"));

    // Should not throw
    await expect(
      logAudit({
        entityType: "Member",
        entityId: "mem-123",
        action: "DELETE",
        summary: "Deleted member",
      })
    ).resolves.toBeUndefined();
  });
});
