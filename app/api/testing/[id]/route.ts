import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// All ops here are now tenant-scoped — previously GET/PATCH/DELETE
// would return or mutate any TestingEvent by id without checking the
// caller's clientId, leaking events between gyms.

// GET /api/testing/[id] - Get a single testing event with participants
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const event = await prisma.testingEvent.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: { memberName: "asc" },
        },
      },
    });

    if (!event || event.clientId !== clientId) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    console.error("Error fetching testing event:", error);
    return new NextResponse("Failed to load testing event", { status: 500 });
  }
}

// PATCH /api/testing/[id] - Update a testing event
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const existing = await prisma.testingEvent.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    const body = await req.json();
    const { name, date, time, location, notes, status, styleId, styleName, styleIds, styleNames } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (date !== undefined) updateData.date = new Date(date);
    if (time !== undefined) updateData.time = time || null;
    if (location !== undefined) updateData.location = location?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (status !== undefined) updateData.status = status.toUpperCase();

    // Multi-style updates: when arrays are provided, also mirror first entry
    // into the legacy singular columns so older queries keep working.
    if (Array.isArray(styleIds)) {
      updateData.styleIds = styleIds.length > 0 ? JSON.stringify(styleIds) : null;
      if (styleIds.length > 0) updateData.styleId = styleIds[0];
    } else if (styleId !== undefined) {
      updateData.styleId = styleId;
    }
    if (Array.isArray(styleNames)) {
      updateData.styleNames = styleNames.length > 0 ? JSON.stringify(styleNames) : null;
      if (styleNames.length > 0) updateData.styleName = styleNames[0];
    } else if (styleName !== undefined) {
      updateData.styleName = styleName;
    }

    const event = await prisma.testingEvent.update({
      where: { id },
      data: updateData,
      include: {
        participants: true,
      },
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error("Error updating testing event:", error);
    return new NextResponse("Failed to update testing event", { status: 500 });
  }
}

// DELETE /api/testing/[id] - Delete a testing event
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const existing = await prisma.testingEvent.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    await prisma.testingEvent.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting testing event:", error);
    return new NextResponse("Failed to delete testing event", { status: 500 });
  }
}
