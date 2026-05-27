import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// All ops here are now tenant-scoped — previously PATCH/DELETE acted on
// any event by id with no tenant check, letting an admin in one gym
// modify or destroy another gym's calendar events.

// PATCH /api/calendar-events/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.calendarEvent.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Event not found", { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const fields = [
      "title", "description",
      "startsAt", "endsAt", "isAllDay",
      "isRecurring", "frequencyNumber", "frequencyUnit",
      "scheduleStartDate", "scheduleEndDate", "isOngoing",
      "excludedDates", "color", "locationId", "spaceId", "notes",
    ];

    for (const field of fields) {
      if (field in body) {
        if (["startsAt", "endsAt", "scheduleStartDate", "scheduleEndDate"].includes(field)) {
          data[field] = body[field] ? new Date(body[field]) : null;
        } else {
          data[field] = body[field];
        }
      }
    }

    const event = await prisma.calendarEvent.update({
      where: { id },
      data,
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error("Error updating calendar event:", error);
    return new NextResponse("Failed to update calendar event", { status: 500 });
  }
}

// DELETE /api/calendar-events/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const existing = await prisma.calendarEvent.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Event not found", { status: 404 });
    }

    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return new NextResponse("Failed to delete calendar event", { status: 500 });
  }
}
