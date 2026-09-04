import { NextResponse } from "next/server";
import { getClientId } from "@/lib/tenant";
import { reconcileClientMemberStatuses } from "@/lib/member-status-sync";

/**
 * POST /api/members/reconcile-statuses
 *
 * Recomputes every member's ACTIVE/INACTIVE token in this tenant
 * based on ground-truth membership status. Same logic that runs
 * inside the daily lifecycle cron, exposed as an on-demand endpoint
 * so an admin can clear historical drift immediately without waiting
 * for the next cron tick.
 */
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const updated = await reconcileClientMemberStatuses(clientId);
    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error("Member.status reconcile endpoint error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reconcile member statuses" },
      { status: 500 },
    );
  }
}
