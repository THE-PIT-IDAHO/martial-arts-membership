import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/testing/[id] - Get a single testing event with participants
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const event = await prisma.testingEvent.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: { memberName: "asc" },
        },
      },
    });

    if (!event) {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, date, time, location, notes, status } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (date !== undefined) updateData.date = new Date(date);
    if (time !== undefined) updateData.time = time || null;
    if (location !== undefined) updateData.location = location?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (status !== undefined) updateData.status = status.toUpperCase();

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.testingEvent.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting testing event:", error);
    return new NextResponse("Failed to delete testing event", { status: 500 });
  }
}
