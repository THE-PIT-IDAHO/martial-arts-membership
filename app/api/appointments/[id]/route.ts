import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/appointments/:id
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      return new NextResponse("Appointment not found", { status: 404 });
    }

    return NextResponse.json({ appointment });
  } catch (error) {
    console.error("Error fetching appointment:", error);
    return new NextResponse("Failed to load appointment", { status: 500 });
  }
}

// PATCH /api/appointments/:id
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json();
    const {
      title,
      description,
      type,
      duration,
      priceCents,
      color,
      coachId,
      coachName,
      styleId,
      styleName,
      notes,
      isActive,
    } = body;

    const data: Record<string, unknown> = {};

    if (typeof title === "string") data.title = title.trim();
    if (typeof description === "string" || description === null) {
      data.description = description?.trim() || null;
    }
    if (typeof type === "string" || type === null) {
      data.type = type?.trim() || null;
    }
    if (typeof duration === "number") data.duration = duration;
    if (typeof priceCents === "number" || priceCents === null) {
      data.priceCents = priceCents;
    }
    if (typeof color === "string") data.color = color;
    if (typeof coachId === "string" || coachId === null) {
      data.coachId = coachId || null;
    }
    if (typeof coachName === "string" || coachName === null) {
      data.coachName = coachName?.trim() || null;
    }
    if (typeof styleId === "string" || styleId === null) {
      data.styleId = styleId || null;
    }
    if (typeof styleName === "string" || styleName === null) {
      data.styleName = styleName?.trim() || null;
    }
    if (typeof notes === "string" || notes === null) {
      data.notes = notes?.trim() || null;
    }
    if (typeof isActive === "boolean") {
      data.isActive = isActive;
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data,
    });

    return NextResponse.json({ appointment });
  } catch (error) {
    console.error("Error updating appointment:", error);
    return new NextResponse("Failed to update appointment", { status: 500 });
  }
}

// DELETE /api/appointments/:id
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    await prisma.appointment.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    return new NextResponse("Failed to delete appointment", { status: 500 });
  }
}
