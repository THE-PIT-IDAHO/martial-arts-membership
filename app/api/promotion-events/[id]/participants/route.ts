import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/promotion-events/[id]/participants - Get all participants for an event
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const participants = await prisma.promotionParticipant.findMany({
      where: { promotionEventId: id },
      orderBy: { memberName: "asc" },
    });

    return NextResponse.json({ participants });
  } catch (error) {
    console.error("Error fetching participants:", error);
    return new NextResponse("Failed to load participants", { status: 500 });
  }
}

// POST /api/promotion-events/[id]/participants - Add a participant to the event
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { memberId, memberName, currentRank, promotingToRank, notes } = body;

    if (!memberId || !memberName) {
      return new NextResponse("memberId and memberName are required", { status: 400 });
    }

    // Check if member is already registered
    const existing = await prisma.promotionParticipant.findFirst({
      where: {
        promotionEventId: id,
        memberId,
      },
    });

    if (existing) {
      return new NextResponse("Member is already registered for this promotion event", { status: 400 });
    }

    const participant = await prisma.promotionParticipant.create({
      data: {
        promotionEventId: id,
        memberId,
        memberName,
        currentRank: currentRank || null,
        promotingToRank: promotingToRank || null,
        notes: notes?.trim() || null,
        status: "REGISTERED",
      },
    });

    return NextResponse.json({ participant }, { status: 201 });
  } catch (error) {
    console.error("Error adding participant:", error);
    return new NextResponse("Failed to add participant", { status: 500 });
  }
}

// DELETE /api/promotion-events/[id]/participants - Remove a participant from the event
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get("participantId");

    if (!participantId) {
      return new NextResponse("participantId is required", { status: 400 });
    }

    await prisma.promotionParticipant.delete({
      where: { id: participantId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing participant:", error);
    return new NextResponse("Failed to remove participant", { status: 500 });
  }
}

// PATCH /api/promotion-events/[id]/participants - Update a participant's status/notes
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const { participantId, status, notes, promotingToRank, promotedAt } = body;

    if (!participantId) {
      return new NextResponse("participantId is required", { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (promotingToRank !== undefined) updateData.promotingToRank = promotingToRank;
    if (promotedAt !== undefined) updateData.promotedAt = promotedAt ? new Date(promotedAt) : null;

    const participant = await prisma.promotionParticipant.update({
      where: { id: participantId },
      data: updateData,
    });

    return NextResponse.json({ participant });
  } catch (error) {
    console.error("Error updating participant:", error);
    return new NextResponse("Failed to update participant", { status: 500 });
  }
}
