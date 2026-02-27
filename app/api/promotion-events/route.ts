import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLocalDate } from "@/lib/dates";

// GET /api/promotion-events - List all promotion events
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const styleId = searchParams.get("styleId");
    const status = searchParams.get("status");

    const whereClause: Record<string, unknown> = {};
    if (styleId) whereClause.styleId = styleId;
    if (status) whereClause.status = status;

    const events = await prisma.promotionEvent.findMany({
      where: whereClause,
      include: {
        participants: {
          orderBy: { memberName: "asc" },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching promotion events:", error);
    return new NextResponse("Failed to load promotion events", { status: 500 });
  }
}

// POST /api/promotion-events - Create a new promotion event
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, date, time, styleId, styleName, location, notes, costCents } = body;

    if (!name || !date || !styleId || !styleName) {
      return new NextResponse("name, date, styleId, and styleName are required", { status: 400 });
    }

    const event = await prisma.promotionEvent.create({
      data: {
        name,
        date: parseLocalDate(date),
        time: time || null,
        styleId,
        styleName,
        location: location || null,
        notes: notes || null,
        costCents: costCents ? parseInt(costCents, 10) : null,
        status: "SCHEDULED",
      },
      include: {
        participants: true,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Error creating promotion event:", error);
    return new NextResponse("Failed to create promotion event", { status: 500 });
  }
}
