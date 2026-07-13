import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// POST /api/members/[id]/comp-credit
// Grants complimentary account credit to a member without creating a
// POS transaction. Amount can be positive (add credit) or negative
// (deduct credit / apply a manual charge). Every use is audit-logged
// so the movement is traceable later.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const body = await req.json();
    const rawAmount = body?.amountCents;
    const note: string = typeof body?.note === "string" ? body.note.trim() : "";

    if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount) || rawAmount === 0) {
      return NextResponse.json(
        { error: "amountCents must be a non-zero number" },
        { status: 400 },
      );
    }
    const amountCents = Math.round(rawAmount);

    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, clientId: true, firstName: true, lastName: true, accountCreditCents: true },
    });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const updated = await prisma.member.update({
      where: { id: member.id },
      data: { accountCreditCents: { increment: amountCents } },
      select: { accountCreditCents: true },
    });

    const direction = amountCents > 0 ? "Added" : "Removed";
    const abs = Math.abs(amountCents);
    await logAudit({
      entityType: "Member",
      entityId: member.id,
      action: "COMP_CREDIT",
      summary:
        `${direction} $${(abs / 100).toFixed(2)} comp credit to ${member.firstName} ${member.lastName}` +
        (note ? ` — ${note}` : ""),
      clientId,
    }).catch(() => { /* audit failure shouldn't block the credit */ });

    return NextResponse.json({
      success: true,
      accountCreditCents: updated.accountCreditCents,
    });
  } catch (error) {
    console.error("Comp credit error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply comp credit" },
      { status: 500 },
    );
  }
}
