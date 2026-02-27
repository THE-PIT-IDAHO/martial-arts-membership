import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/portal/appointments/book — book an appointment, optionally using a credit
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { appointmentId, scheduledDate, startTime, endTime, notes, memberServiceCreditId, spaceId, coachId, coachName } = await req.json();

  if (!appointmentId || !scheduledDate || !startTime || !endTime) {
    return NextResponse.json({ error: "appointmentId, scheduledDate, startTime, endTime are required" }, { status: 400 });
  }

  // Get member name
  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { firstName: true, lastName: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const memberName = `${member.firstName} ${member.lastName}`;
  const clientId = await getClientId(req);

  // If using a credit, validate and deduct in a transaction
  if (memberServiceCreditId) {
    const credit = await prisma.memberServiceCredit.findUnique({
      where: { id: memberServiceCreditId },
      include: { servicePackage: true },
    });

    if (!credit || credit.status !== "ACTIVE") {
      return NextResponse.json({ error: "Appointment credit is not active" }, { status: 400 });
    }
    if (credit.memberId !== auth.memberId) {
      return NextResponse.json({ error: "Credit does not belong to you" }, { status: 403 });
    }
    if (credit.creditsRemaining <= 0) {
      return NextResponse.json({ error: "No remaining credits" }, { status: 400 });
    }
    if (credit.servicePackage.appointmentId && credit.servicePackage.appointmentId !== appointmentId) {
      return NextResponse.json({ error: "This credit cannot be used for this appointment type" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const appt = await tx.scheduledAppointment.create({
        data: {
          appointmentId,
          scheduledDate: new Date(scheduledDate),
          startTime,
          endTime,
          memberId: auth.memberId,
          memberName,
          coachId: coachId || null,
          coachName: coachName?.trim() || null,
          notes: notes?.trim() || null,
          status: "SCHEDULED",
          memberServiceCreditId,
          spaceId: spaceId || null,
          clientId,
        },
        include: { appointment: true },
      });

      const newRemaining = credit.creditsRemaining - 1;
      await tx.memberServiceCredit.update({
        where: { id: memberServiceCreditId },
        data: {
          creditsRemaining: newRemaining,
          status: newRemaining <= 0 ? "EXHAUSTED" : "ACTIVE",
        },
      });

      return appt;
    });

    return NextResponse.json({ scheduledAppointment: result }, { status: 201 });
  }

  // No credit — just book directly
  const scheduledAppointment = await prisma.scheduledAppointment.create({
    data: {
      appointmentId,
      scheduledDate: new Date(scheduledDate),
      startTime,
      endTime,
      memberId: auth.memberId,
      memberName,
      coachId: coachId || null,
      coachName: coachName?.trim() || null,
      notes: notes?.trim() || null,
      status: "SCHEDULED",
      spaceId: spaceId || null,
      clientId,
    },
    include: { appointment: true },
  });

  return NextResponse.json({ scheduledAppointment }, { status: 201 });
}
