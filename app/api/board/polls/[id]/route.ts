import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/board/polls/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const poll = await prisma.boardPoll.findUnique({
      where: { id },
      include: {
        options: {
          orderBy: { order: "asc" },
          include: {
            votes: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!poll) {
      return new NextResponse("Poll not found", { status: 404 });
    }

    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Error fetching poll:", error);
    return new NextResponse("Failed to load poll", { status: 500 });
  }
}

// PATCH /api/board/polls/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { question, endsAt, allowMultiple, isClosed } = body;

    const poll = await prisma.boardPoll.update({
      where: { id },
      data: {
        ...(question !== undefined && { question: question.trim() }),
        ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
        ...(allowMultiple !== undefined && { allowMultiple }),
        ...(isClosed !== undefined && { isClosed }),
      },
      include: {
        options: {
          orderBy: { order: "asc" },
          include: {
            votes: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Error updating poll:", error);
    return new NextResponse("Failed to update poll", { status: 500 });
  }
}

// DELETE /api/board/polls/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete the poll (options and votes will cascade delete)
    await prisma.boardPoll.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting poll:", error);
    return new NextResponse("Failed to delete poll", { status: 500 });
  }
}
