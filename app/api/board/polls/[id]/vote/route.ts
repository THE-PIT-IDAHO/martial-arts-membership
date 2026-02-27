import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/board/polls/[id]/vote
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pollId } = await params;
    await getClientId(req); // validate tenant
    const body = await req.json();
    const { optionId, optionIds, odentifier, voterId, voterName } = body;

    // Support both single option and multiple options
    const selectedOptionIds = optionIds || (optionId ? [optionId] : []);

    if (selectedOptionIds.length === 0) {
      return new NextResponse("At least one option must be selected", { status: 400 });
    }

    // Get the poll to check settings
    const poll = await prisma.boardPoll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          include: {
            votes: true,
          },
        },
      },
    });

    if (!poll) {
      return new NextResponse("Poll not found", { status: 404 });
    }

    // Check if poll has expired
    if (poll.expiresAt && new Date(poll.expiresAt) < new Date()) {
      return new NextResponse("Poll has ended", { status: 400 });
    }

    // Use identifier from request or generate one
    const identifier = odentifier || voterId || `anon-${Date.now()}`;

    // Check if user has already voted
    const existingVotes = await prisma.boardPollVote.findMany({
      where: {
        option: {
          pollId,
        },
        voterId: identifier,
      },
    });

    // If not allowing multiple and already voted, remove old votes
    if (!poll.allowMultiple && existingVotes.length > 0) {
      await prisma.boardPollVote.deleteMany({
        where: {
          id: { in: existingVotes.map((v) => v.id) },
        },
      });
    }

    // Validate all option IDs belong to this poll
    const validOptionIds = poll.options.map((o) => o.id);
    const invalidOptions = selectedOptionIds.filter(
      (id: string) => !validOptionIds.includes(id)
    );

    if (invalidOptions.length > 0) {
      return new NextResponse("Invalid option(s) selected", { status: 400 });
    }

    // Create votes
    await Promise.all(
      selectedOptionIds.map((optId: string) =>
        prisma.boardPollVote.create({
          data: {
            optionId: optId,
            voterId: identifier,
          },
        })
      )
    );

    // Fetch updated poll
    const updatedPoll = await prisma.boardPoll.findUnique({
      where: { id: pollId },
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

    return NextResponse.json({ poll: updatedPoll }, { status: 201 });
  } catch (error) {
    console.error("Error voting on poll:", error);
    return new NextResponse("Failed to vote", { status: 500 });
  }
}

// DELETE /api/board/polls/[id]/vote - Remove a vote
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pollId } = await params;
    await getClientId(req); // validate tenant
    const { searchParams } = new URL(req.url);
    const identifier = searchParams.get("voterId") || searchParams.get("odentifier");

    if (!identifier) {
      return new NextResponse("Voter ID is required", { status: 400 });
    }

    // Delete all votes from this identifier for this poll
    await prisma.boardPollVote.deleteMany({
      where: {
        option: {
          pollId,
        },
        voterId: identifier,
      },
    });

    // Fetch updated poll
    const updatedPoll = await prisma.boardPoll.findUnique({
      where: { id: pollId },
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

    return NextResponse.json({ poll: updatedPoll });
  } catch (error) {
    console.error("Error removing vote:", error);
    return new NextResponse("Failed to remove vote", { status: 500 });
  }
}
