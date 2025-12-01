import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLIENT_ID = "default-client";

// GET /api/appointments
export async function GET() {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { clientId: DEFAULT_CLIENT_ID },
      orderBy: { title: "asc" },
    });

    return NextResponse.json({ appointments });
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return new NextResponse("Failed to load appointments", { status: 500 });
  }
}

// POST /api/appointments
export async function POST(req: Request) {
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

    if (!title || typeof title !== "string") {
      return new NextResponse("Title is required", { status: 400 });
    }

    const appointment = await prisma.appointment.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        type: type?.trim() || null,
        duration: duration || 60,
        priceCents: priceCents || null,
        color: color || "#6b7280",
        coachId: coachId || null,
        coachName: coachName?.trim() || null,
        styleId: styleId || null,
        styleName: styleName?.trim() || null,
        notes: notes?.trim() || null,
        isActive: isActive !== false,
        clientId: DEFAULT_CLIENT_ID,
      },
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return new NextResponse("Failed to create appointment", { status: 500 });
  }
}
