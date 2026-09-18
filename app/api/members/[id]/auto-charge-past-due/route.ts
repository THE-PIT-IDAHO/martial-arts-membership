import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/**
 * PUT /api/members/[id]/auto-charge-past-due
 *
 * Body: { enabled: boolean }
 *
 * Per-member kill switch for the dunning loop (auto-retry of
 * PAST_DUE / FAILED invoices). Fresh recurring cycles are NOT
 * gated by this -- they still generate + auto-charge as the "set"
 * auto-pay. This only controls whether the daily cron auto-retries
 * a member's outstanding balance.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { id: memberId } = await params;
  const clientId = await getClientId(req);

  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, firstName: true, lastName: true, autoChargePastDueEnabled: true },
  });
  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.autoChargePastDueEnabled === enabled) {
    return NextResponse.json({ success: true, enabled });
  }

  await prisma.member.update({
    where: { id: memberId },
    data: { autoChargePastDueEnabled: enabled },
  });

  logAudit({
    entityType: "Member",
    entityId: memberId,
    action: "UPDATE",
    summary: `${enabled ? "Enabled" : "Disabled"} auto-charge of past-due balances for ${member.firstName} ${member.lastName}`,
    clientId,
  }).catch(() => {});

  return NextResponse.json({ success: true, enabled });
}
