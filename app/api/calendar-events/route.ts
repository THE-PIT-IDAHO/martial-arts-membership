import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/calendar-events
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);

    const events = await prisma.calendarEvent.findMany({
      where: { clientId },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return new NextResponse("Failed to load calendar events", { status: 500 });
  }
}

// POST /api/calendar-events
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const {
      title, description,
      startsAt, endsAt, isAllDay,
      isRecurring, frequencyNumber, frequencyUnit,
      scheduleStartDate, scheduleEndDate, isOngoing,
      color, locationId, spaceId, notes,
    } = body;

    if (!title) {
      return new NextResponse("Title is required", { status: 400 });
    }

    // Verify locationId + spaceId belong to this tenant before create
    // so the row doesn't carry dangling FKs into another gym's data.
    if (locationId) {
      const l = await prisma.location.findUnique({ where: { id: locationId }, select: { clientId: true } });
      if (!l || l.clientId !== clientId) return new NextResponse("Location not found in this tenant", { status: 400 });
    }
    if (spaceId) {
      const s = await prisma.space.findUnique({ where: { id: spaceId }, select: { clientId: true } });
      if (!s || s.clientId !== clientId) return new NextResponse("Space not found in this tenant", { status: 400 });
    }

    const event = await prisma.calendarEvent.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        isAllDay: isAllDay || false,
        isRecurring: isRecurring || false,
        frequencyNumber: isRecurring ? (frequencyNumber || 1) : null,
        frequencyUnit: isRecurring ? (frequencyUnit || "Week") : null,
        scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate) : null,
        scheduleEndDate: scheduleEndDate ? new Date(scheduleEndDate) : null,
        isOngoing: isRecurring ? (isOngoing !== false) : true,
        color: color || "#3b82f6",
        locationId: locationId || null,
        spaceId: spaceId || null,
        notes: notes?.trim() || null,
        clientId,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return new NextResponse("Failed to create calendar event", { status: 500 });
  }
}
