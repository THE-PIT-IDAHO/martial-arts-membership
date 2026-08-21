import { NextResponse } from "next/server";
import { getClientId } from "@/lib/tenant";
import { cleanupGhostBookings } from "@/lib/ghost-bookings";

/**
 * POST /api/classes/cleanup-ghost-bookings — sweep every ghost
 * ClassBooking row for this tenant in one shot. Wired to a button
 * in the admin classes/settings area for one-time cleanup after the
 * schedule was changed on classes that had bookings on the old slot.
 *
 * Going forward, /api/classes/[id] PATCH runs this per-class after
 * schedule edits so ghosts don't accumulate. This bulk endpoint
 * only exists to clear the historical backlog.
 */
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const result = await cleanupGhostBookings({ clientId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[classes/cleanup-ghost-bookings] failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
