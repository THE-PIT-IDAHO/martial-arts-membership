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

    // Verify any repointed FK still points at THIS tenant. Without
    // this, PATCH could switch the row's coach/appointment/location/
    // space to another gym's record.
    if (body.coachId) {
      const c = await prisma.member.findUnique({ where: { id: body.coachId }, select: { clientId: true } });
      if (!c || c.clientId !== clientId) return new NextResponse("Coach not found in this tenant", { status: 400 });
    }
    if (body.appointmentId) {
      const a = await prisma.appointment.findUnique({ where: { id: body.appointmentId }, select: { clientId: true } });
      if (!a || a.clientId !== clientId) return new NextResponse("Appointment not found in this tenant", { status: 400 });
    }
    if (body.locationId) {
      const l = await prisma.location.findUnique({ where: { id: body.locationId }, select: { clientId: true } });
      if (!l || l.clientId !== clientId) return new NextResponse("Location not found in this tenant", { status: 400 });
    }
    if (body.spaceId) {
      const s = await prisma.space.findUnique({ where: { id: body.spaceId }, select: { clientId: true } });
      if (!s || s.clientId !== clientId) return new NextResponse("Space not found in this tenant", { status: 400 });
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
