import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/coach-availability/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    const fields = [
      "coachId", "coachName", "appointmentId",
      "startsAt", "endsAt",
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

    const availability = await prisma.coachAvailability.update({
      where: { id },
      data,
    });

    return NextResponse.json({ availability });
  } catch (error) {
    console.error("Error updating coach availability:", error);
    return new NextResponse("Failed to update coach availability", { status: 500 });
  }
}

// DELETE /api/coach-availability/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.coachAvailability.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting coach availability:", error);
    return new NextResponse("Failed to delete coach availability", { status: 500 });
  }
}
