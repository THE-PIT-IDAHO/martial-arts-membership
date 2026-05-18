import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/testing - List all testing events
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const styleId = searchParams.get("styleId");

    const where: Record<string, unknown> = { clientId };
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
    // Accept either single styleId/styleName (legacy) or styleIds/styleNames
    // arrays (multi-style). Normalize so both are saved for backward compat.
    const { name, date, time, location, notes } = body;
    let { styleId, styleName, styleIds, styleNames } = body as {
      styleId?: string; styleName?: string; styleIds?: string[]; styleNames?: string[];
    };

    if (Array.isArray(styleIds) && styleIds.length > 0) {
      styleId = styleId || styleIds[0];
    }
    if (Array.isArray(styleNames) && styleNames.length > 0) {
      styleName = styleName || styleNames[0];
    }

    if (!name || !date || !styleId || !styleName) {
      return new NextResponse("Name, date, styleId, and styleName are required", { status: 400 });
    }

    const clientId = await getClientId(req);

    const event = await prisma.testingEvent.create({
      data: {
        name: name.trim(),
        date: new Date(date),
        time: time || null,
        styleId,
        styleName,
        styleIds: Array.isArray(styleIds) && styleIds.length > 0 ? JSON.stringify(styleIds) : null,
        styleNames: Array.isArray(styleNames) && styleNames.length > 0 ? JSON.stringify(styleNames) : null,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        clientId,
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
