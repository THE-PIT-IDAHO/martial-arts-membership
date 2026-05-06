import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteClientAndData } from "@/lib/delete-client";

// Grace periods in days based on price tier
// Trial: 7 days, Starter ($50): 30 days, Basic ($100): 60 days,
// Pro ($150): 90 days, Enterprise ($200): 180 days
function getGracePeriodDays(priceCents: number): number {
  if (priceCents >= 20000) return 180;  // Enterprise
  if (priceCents >= 15000) return 90;   // Pro
  if (priceCents >= 10000) return 60;   // Basic
  if (priceCents >= 5000) return 30;    // Starter
  return 7;                              // Trial / Free
}

// POST /api/admin/cleanup — auto-delete expired/canceled gyms past grace period
// Called daily by Vercel cron
export async function POST() {
  try {
    const now = new Date();

    // Find all non-platform gyms that are either expired trials or canceled
    const candidates = await prisma.client.findMany({
      where: {
        isPlatformAdmin: false,
        OR: [
          { trialExpiresAt: { lt: now } },
          { canceledAt: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        priceCents: true,
        trialExpiresAt: true,
        canceledAt: true,
      },
    });

    const deleted: string[] = [];
    const errors: string[] = [];

    for (const client of candidates) {
      const graceDays = getGracePeriodDays(client.priceCents);
      const graceMs = graceDays * 24 * 60 * 60 * 1000;

      // Determine the "end date" — either trial expiration or cancellation date
      const endDate = client.canceledAt
        ? new Date(client.canceledAt)
        : client.trialExpiresAt
        ? new Date(client.trialExpiresAt)
        : null;

      if (!endDate) continue;

      // Check if grace period has passed
      const deleteAfter = new Date(endDate.getTime() + graceMs);
      if (now < deleteAfter) continue;

      try {
        await deleteClientAndData(client.id);
        deleted.push(`${client.name} (${client.slug}) — ${graceDays}d grace`);
        console.log(`[Cleanup] Deleted: ${client.name} (${client.slug}), ended ${endDate.toISOString()}, grace ${graceDays}d`);
      } catch (err) {
        console.error(`[Cleanup] Failed to delete ${client.name}:`, err);
        errors.push(client.name);
      }
    }

    return NextResponse.json({
      checked: candidates.length,
      deleted: deleted.length,
      deletedGyms: deleted.length > 0 ? deleted : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
