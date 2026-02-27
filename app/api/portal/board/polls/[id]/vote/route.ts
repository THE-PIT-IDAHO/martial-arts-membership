import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// POST /api/portal/board/polls/[id]/vote — vote on a poll as the logged-in member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id: pollId } = await params;
    const body = await req.json();
    const { optionId, optionIds } = body;

    const selectedOptionIds: string[] = optionIds || (optionId ? [optionId] : []);

    if (selectedOptionIds.length === 0) {
      return NextResponse.json({ error: "At least one option must be selected" }, { status: 400 });
    }

    const poll = await prisma.boardPoll.findUnique({
      where: { id: pollId },
      include: {
        options: { include: { votes: true } },
      },
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    if (poll.expiresAt && new Date(poll.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Poll has ended" }, { status: 400 });
    }

    // Use memberId as the voter identifier
    const voterId = auth.memberId;

    // Check for existing votes
    const existingVotes = await prisma.boardPollVote.findMany({
      where: {
        option: { pollId },
        voterId,
      },
    });

    // Remove old votes if not allowing multiple
    if (!poll.allowMultiple && existingVotes.length > 0) {
      await prisma.boardPollVote.deleteMany({
        where: { id: { in: existingVotes.map((v) => v.id) } },
      });
    }

    // Validate option IDs
    const validOptionIds = poll.options.map((o) => o.id);
    const invalidOptions = selectedOptionIds.filter((id) => !validOptionIds.includes(id));
    if (invalidOptions.length > 0) {
      return NextResponse.json({ error: "Invalid option(s) selected" }, { status: 400 });
    }

    // Create votes
    await Promise.all(
      selectedOptionIds.map((optId) =>
        prisma.boardPollVote.create({
          data: { optionId: optId, voterId },
        })
      )
    );

    // Return updated poll
    const updatedPoll = await prisma.boardPoll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          orderBy: { order: "asc" },
          include: { votes: true },
        },
        channel: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ poll: updatedPoll });
  } catch (error) {
    console.error("Error voting on poll:", error);
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
  }
}
