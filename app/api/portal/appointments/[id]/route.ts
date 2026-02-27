import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// DELETE /api/portal/appointments/[id] — cancel appointment, refund credit if linked
export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const existing = await prisma.scheduledAppointment.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.memberId !== auth.memberId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (existing.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  // Cancel and refund credit if linked
  if (existing.memberServiceCreditId) {
    await prisma.$transaction(async (tx) => {
      await tx.scheduledAppointment.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      const credit = await tx.memberServiceCredit.findUnique({
        where: { id: existing.memberServiceCreditId! },
      });
      if (credit) {
        await tx.memberServiceCredit.update({
          where: { id: credit.id },
          data: {
            creditsRemaining: { increment: 1 },
            status: "ACTIVE",
          },
        });
      }
    });
  } else {
    await prisma.scheduledAppointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  return NextResponse.json({ success: true });
}
