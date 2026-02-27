import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/coach-availability
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const availabilities = await prisma.coachAvailability.findMany({
      where: { clientId },
      orderBy: { startsAt: "asc" },
    });
    return NextResponse.json({ availabilities });
  } catch (error) {
    console.error("Error fetching coach availability:", error);
    return new NextResponse("Failed to load coach availability", { status: 500 });
  }
}

// POST /api/coach-availability
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const {
      coachId, coachName, appointmentId,
      startsAt, endsAt,
      isRecurring, frequencyNumber, frequencyUnit,
      scheduleStartDate, scheduleEndDate, isOngoing,
      excludedDates, color, locationId, spaceId, notes,
    } = body;

    if (!coachId || !startsAt || !endsAt) {
      return new NextResponse("Coach, start time, and end time are required", { status: 400 });
    }

    const availability = await prisma.coachAvailability.create({
      data: {
        coachId,
        coachName: coachName?.trim() || null,
        appointmentId: appointmentId || null,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        isRecurring: isRecurring || false,
        frequencyNumber: frequencyNumber || null,
        frequencyUnit: frequencyUnit || null,
        scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate) : null,
        scheduleEndDate: scheduleEndDate ? new Date(scheduleEndDate) : null,
        isOngoing: isOngoing !== false,
        excludedDates: excludedDates || null,
        color: color || "#6b7280",
        locationId: locationId || null,
        spaceId: spaceId || null,
        notes: notes?.trim() || null,
        clientId,
      },
    });

    return NextResponse.json({ availability }, { status: 201 });
  } catch (error) {
    console.error("Error creating coach availability:", error);
    return new NextResponse("Failed to create coach availability", { status: 500 });
  }
}
