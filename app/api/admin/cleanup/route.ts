import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteClientAndData } from "@/lib/delete-client";

// POST /api/admin/cleanup — auto-delete expired trials (7+ days past expiration)
// Called daily by Vercel cron
export async function POST() {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find trial gyms that expired more than 7 days ago
    const expiredClients = await prisma.client.findMany({
      where: {
        trialExpiresAt: { lt: weekAgo },
        isPlatformAdmin: false,
      },
      select: { id: true, name: true, slug: true, trialExpiresAt: true },
    });

    if (expiredClients.length === 0) {
      return NextResponse.json({ deleted: 0, message: "No expired trials to clean up" });
    }

    const deleted: string[] = [];
    const errors: string[] = [];

    for (const client of expiredClients) {
      try {
        await deleteClientAndData(client.id);
        deleted.push(`${client.name} (${client.slug})`);
        console.log(`[Cleanup] Deleted expired trial: ${client.name} (${client.slug}), expired ${client.trialExpiresAt}`);
      } catch (err) {
        console.error(`[Cleanup] Failed to delete ${client.name}:`, err);
        errors.push(client.name);
      }
    }

    return NextResponse.json({
      deleted: deleted.length,
      deletedGyms: deleted,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
