import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/scheduled-appointments/[id]
export async function GET(req: Request, context: RouteContext) {
  try {
    const clientId = await getClientId(req);
    const { id } = await context.params;
    const appt = await prisma.scheduledAppointment.findUnique({
      where: { id },
      include: {
        appointment: true,
        memberServiceCredit: { include: { servicePackage: true } },
      },
    });

    if (!appt || appt.clientId !== clientId) {
      return new NextResponse("Not found", { status: 404 });
    }

    return NextResponse.json({ scheduledAppointment: appt });
  } catch (error) {
    console.error("Error fetching scheduled appointment:", error);
    return new NextResponse("Failed to load scheduled appointment", { status: 500 });
  }
}

// PATCH /api/scheduled-appointments/[id]
export async function PATCH(req: Request, context: RouteContext) {
  try {
    const clientId = await getClientId(req);
    const { id } = await context.params;
    const body = await req.json();
    const { scheduledDate, startTime, endTime, coachId, coachName, notes, status, memberId, memberName, spaceId } = body;

    const existing = await prisma.scheduledAppointment.findUnique({
      where: { id },
    });

    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Not found", { status: 404 });
    }

    // If cancelling and linked to an appointment credit, refund the credit
    if (status === "CANCELLED" && existing.status !== "CANCELLED" && existing.memberServiceCreditId) {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.scheduledAppointment.update({
          where: { id },
          data: {
            ...(scheduledDate ? { scheduledDate: new Date(scheduledDate) } : {}),
            ...(startTime ? { startTime } : {}),
            ...(endTime ? { endTime } : {}),
            ...(coachId !== undefined ? { coachId: coachId || null } : {}),
            ...(coachName !== undefined ? { coachName: coachName?.trim() || null } : {}),
            ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
            ...(memberId !== undefined ? { memberId: memberId || null } : {}),
            ...(memberName !== undefined ? { memberName: memberName?.trim() || null } : {}),
            ...(spaceId !== undefined ? { spaceId: spaceId || null } : {}),
            status: "CANCELLED",
          },
          include: { appointment: true },
        });

        // Refund the credit
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

        return updated;
      });

      return NextResponse.json({ scheduledAppointment: result });
    }

    const updated = await prisma.scheduledAppointment.update({
      where: { id },
      data: {
        ...(scheduledDate ? { scheduledDate: new Date(scheduledDate) } : {}),
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(coachId !== undefined ? { coachId: coachId || null } : {}),
        ...(coachName !== undefined ? { coachName: coachName?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(memberId !== undefined ? { memberId: memberId || null } : {}),
        ...(memberName !== undefined ? { memberName: memberName?.trim() || null } : {}),
        ...(spaceId !== undefined ? { spaceId: spaceId || null } : {}),
        ...(status ? { status } : {}),
      },
      include: { appointment: true },
    });

    return NextResponse.json({ scheduledAppointment: updated });
  } catch (error) {
    console.error("Error updating scheduled appointment:", error);
    return new NextResponse("Failed to update scheduled appointment", { status: 500 });
  }
}

// DELETE /api/scheduled-appointments/[id]
export async function DELETE(req: Request, context: RouteContext) {
  try {
    const clientId = await getClientId(req);
    const { id } = await context.params;

    const existing = await prisma.scheduledAppointment.findUnique({
      where: { id },
    });

    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Refund credit if linked
    if (existing.memberServiceCreditId && existing.status !== "CANCELLED") {
      await prisma.$transaction(async (tx) => {
        await tx.scheduledAppointment.delete({ where: { id } });

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
      await prisma.scheduledAppointment.delete({ where: { id } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting scheduled appointment:", error);
    return new NextResponse("Failed to delete scheduled appointment", { status: 500 });
  }
}
