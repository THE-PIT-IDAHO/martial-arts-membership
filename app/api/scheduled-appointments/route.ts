import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLIENT_ID = "default-client";

// GET /api/scheduled-appointments
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = { clientId: DEFAULT_CLIENT_ID };

    if (startDate && endDate) {
      where.scheduledDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const scheduledAppointments = await prisma.scheduledAppointment.findMany({
      where,
      include: {
        appointment: true,
      },
      orderBy: [
        { scheduledDate: "asc" },
        { startTime: "asc" },
      ],
    });

    return NextResponse.json({ scheduledAppointments });
  } catch (error) {
    console.error("Error fetching scheduled appointments:", error);
    return new NextResponse("Failed to load scheduled appointments", { status: 500 });
  }
}

// POST /api/scheduled-appointments
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      appointmentId,
      scheduledDate,
      startTime,
      endTime,
      memberId,
      memberName,
      coachId,
      coachName,
      notes,
      status,
      memberServiceCreditId,
      spaceId,
    } = body;

    if (!appointmentId) {
      return new NextResponse("Appointment ID is required", { status: 400 });
    }

    if (!scheduledDate || !startTime || !endTime) {
      return new NextResponse("Scheduled date and times are required", { status: 400 });
    }

    // If using an appointment credit, validate and deduct in a transaction
    if (memberServiceCreditId) {
      const credit = await prisma.memberServiceCredit.findUnique({
        where: { id: memberServiceCreditId },
        include: { servicePackage: true },
      });

      if (!credit || credit.status !== "ACTIVE") {
        return new NextResponse("Appointment credit is not active", { status: 400 });
      }
      if (credit.memberId !== memberId) {
        return new NextResponse("Appointment credit does not belong to this member", { status: 400 });
      }
      if (credit.creditsRemaining <= 0) {
        return new NextResponse("No remaining credits", { status: 400 });
      }
      // If the package is linked to a specific appointment type, validate match
      if (credit.servicePackage.appointmentId && credit.servicePackage.appointmentId !== appointmentId) {
        return new NextResponse("This credit cannot be used for this appointment type", { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const appt = await tx.scheduledAppointment.create({
          data: {
            appointmentId,
            scheduledDate: new Date(scheduledDate),
            startTime,
            endTime,
            memberId: memberId || null,
            memberName: memberName?.trim() || null,
            coachId: coachId || null,
            coachName: coachName?.trim() || null,
            notes: notes?.trim() || null,
            status: status || "SCHEDULED",
            memberServiceCreditId,
            spaceId: spaceId || null,
            clientId: DEFAULT_CLIENT_ID,
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

    const scheduledAppointment = await prisma.scheduledAppointment.create({
      data: {
        appointmentId,
        scheduledDate: new Date(scheduledDate),
        startTime,
        endTime,
        memberId: memberId || null,
        memberName: memberName?.trim() || null,
        coachId: coachId || null,
        coachName: coachName?.trim() || null,
        notes: notes?.trim() || null,
        status: status || "SCHEDULED",
        spaceId: spaceId || null,
        clientId: DEFAULT_CLIENT_ID,
      },
      include: {
        appointment: true,
      },
    });

    return NextResponse.json({ scheduledAppointment }, { status: 201 });
  } catch (error) {
    console.error("Error creating scheduled appointment:", error);
    return new NextResponse("Failed to create scheduled appointment", { status: 500 });
  }
}
