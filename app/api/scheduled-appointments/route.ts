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
    } = body;

    if (!appointmentId) {
      return new NextResponse("Appointment ID is required", { status: 400 });
    }

    if (!scheduledDate || !startTime || !endTime) {
      return new NextResponse("Scheduled date and times are required", { status: 400 });
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
