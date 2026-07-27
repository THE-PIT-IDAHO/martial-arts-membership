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

    // Verify every body FK belongs to this tenant. Otherwise the row
    // ends up with foreign coach/appointment/location/space FKs and
    // your calendar renders another gym's coach.
    const coach = await prisma.member.findUnique({ where: { id: coachId }, select: { clientId: true } });
    if (!coach || coach.clientId !== clientId) {
      return new NextResponse("Coach not found in this tenant", { status: 400 });
    }
    if (appointmentId) {
      const a = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { clientId: true } });
      if (!a || a.clientId !== clientId) {
        return new NextResponse("Appointment not found in this tenant", { status: 400 });
      }
    }
    if (locationId) {
      const l = await prisma.location.findUnique({ where: { id: locationId }, select: { clientId: true } });
      if (!l || l.clientId !== clientId) {
        return new NextResponse("Location not found in this tenant", { status: 400 });
      }
    }
    if (spaceId) {
      const s = await prisma.space.findUnique({ where: { id: spaceId }, select: { clientId: true } });
      if (!s || s.clientId !== clientId) {
        return new NextResponse("Space not found in this tenant", { status: 400 });
      }
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
