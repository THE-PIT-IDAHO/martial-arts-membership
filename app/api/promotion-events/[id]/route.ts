import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLocalDate } from "@/lib/dates";

// GET /api/promotion-events/[id] - Get a single promotion event
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const event = await prisma.promotionEvent.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: { memberName: "asc" },
        },
      },
    });

    if (!event) {
      return new NextResponse("Promotion event not found", { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    console.error("Error fetching promotion event:", error);
    return new NextResponse("Failed to load promotion event", { status: 500 });
  }
}

// PATCH /api/promotion-events/[id] - Update a promotion event
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, date, time, location, notes, status, costCents } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (date !== undefined) updateData.date = parseLocalDate(date);
    if (time !== undefined) updateData.time = time || null;
    if (location !== undefined) updateData.location = location || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (status !== undefined) updateData.status = status;
    if (costCents !== undefined) updateData.costCents = costCents ? parseInt(costCents, 10) : null;

    const event = await prisma.promotionEvent.update({
      where: { id },
      data: updateData,
      include: {
        participants: {
          orderBy: { memberName: "asc" },
        },
      },
    });

    return NextResponse.json({ event });
  } catch (error) {
    console.error("Error updating promotion event:", error);
    return new NextResponse("Failed to update promotion event", { status: 500 });
  }
}

// DELETE /api/promotion-events/[id] - Delete a promotion event
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.promotionEvent.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting promotion event:", error);
    return new NextResponse("Failed to delete promotion event", { status: 500 });
  }
}
