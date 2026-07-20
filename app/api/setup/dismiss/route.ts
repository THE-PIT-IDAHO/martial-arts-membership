// POST /api/setup/dismiss
// Body: { scope: "all" | "task", taskId?: string, undo?: boolean }
//
// Backs the two "manual" affordances of the setup checklist:
//
//   - scope="all": user hides the entire card ("I'll come back to
//     this later"). Sets Settings.setup_hidden = "1". Pass undo=true
//     to un-hide.
//
//   - scope="task": user marks a single task done (skip) OR flips a
//     manual-ack task (payment / kiosk) done. Toggles either the
//     dismissed list (Settings.setup_dismissed = JSON array of task
//     ids) or the ack Settings key that the status endpoint reads.
//
// Only OWNER/ADMIN can dismiss anything -- coach/front-desk sessions
// don't see the card at all, but be defensive here anyway.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { getClientId } from "@/lib/tenant";

// Ack-style tasks bypass the dismissed list because their "done"
// signal is meaningful data the status endpoint already reads. Keys
// intentionally match what /api/setup/status pulls out of Settings.
const ACK_KEY_BY_TASK: Record<string, string> = {
  payment: "setup_payment_ack",
  kiosk: "setup_kiosk_ack",
};

async function upsertSetting(clientId: string, key: string, value: string) {
  await prisma.settings.upsert({
    where: { key_clientId: { key, clientId } },
    update: { value },
    create: { clientId, key, value },
  });
}

export async function POST(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const clientId = await getClientId(req);
  const body = (await req.json().catch(() => null)) as
    | { scope?: "all" | "task"; taskId?: string; undo?: boolean }
    | null;
  if (!body || !body.scope) {
    return NextResponse.json({ error: "Missing scope" }, { status: 400 });
  }

  if (body.scope === "all") {
    await upsertSetting(clientId, "setup_hidden", body.undo ? "0" : "1");
    return NextResponse.json({ ok: true });
  }

  const taskId = body.taskId;
  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  const ackKey = ACK_KEY_BY_TASK[taskId];
  if (ackKey) {
    await upsertSetting(clientId, ackKey, body.undo ? "0" : "1");
    return NextResponse.json({ ok: true });
  }

  // Regular auto-detect task: toggle membership in the dismissed list.
  const row = await prisma.settings.findUnique({
    where: { key_clientId: { key: "setup_dismissed", clientId } },
    select: { value: true },
  });
  let list: string[] = [];
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* rewrite as valid JSON below */
    }
  }
  const next = body.undo
    ? list.filter((x) => x !== taskId)
    : list.includes(taskId)
      ? list
      : [...list, taskId];
  await upsertSetting(clientId, "setup_dismissed", JSON.stringify(next));
  return NextResponse.json({ ok: true });
}
