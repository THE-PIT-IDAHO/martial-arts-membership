import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// PATCH /api/coach-availability/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    // Verify tenant ownership
    const existing = await prisma.coachAvailability.findFirst({ where: { id, clientId } });
    if (!existing) return new NextResponse("Not found", { status: 404 });

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
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    // Verify tenant ownership
    const existing = await prisma.coachAvailability.findFirst({ where: { id, clientId } });
    if (!existing) return new NextResponse("Not found", { status: 404 });

    await prisma.coachAvailability.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting coach availability:", error);
    return new NextResponse("Failed to delete coach availability", { status: 500 });
  }
}
