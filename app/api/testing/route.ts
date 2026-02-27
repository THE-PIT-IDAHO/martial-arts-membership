import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/testing - List all testing events
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const styleId = searchParams.get("styleId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status.toUpperCase();
    if (styleId) where.styleId = styleId;

    const events = await prisma.testingEvent.findMany({
      where,
      include: {
        participants: true,
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching testing events:", error);
    return new NextResponse("Failed to load testing events", { status: 500 });
  }
}

// POST /api/testing - Create a new testing event
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, date, time, styleId, styleName, location, notes, clientId } = body;

    if (!name || !date || !styleId || !styleName) {
      return new NextResponse("Name, date, styleId, and styleName are required", { status: 400 });
    }

    const event = await prisma.testingEvent.create({
      data: {
        name: name.trim(),
        date: new Date(date),
        time: time || null,
        styleId,
        styleName,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        clientId: clientId || "default-client",
        status: "SCHEDULED",
      },
      include: {
        participants: true,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Error creating testing event:", error);
    return new NextResponse("Failed to create testing event", { status: 500 });
  }
}
