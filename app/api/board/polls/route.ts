import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/board/polls
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    const where = channelId
      ? { channelId, channel: { clientId } }
      : { channel: { clientId } };

    const polls = await prisma.boardPoll.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        options: {
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

    return NextResponse.json({ polls });
  } catch (error) {
    console.error("Error fetching polls:", error);
    return new NextResponse("Failed to load polls", { status: 500 });
  }
}

// POST /api/board/polls
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const {
      question,
      authorId,
      authorName,
      authorInitials,
      channelId,
      options,
      expiresAt,
      allowMultiple,
    } = body;

    if (!question || typeof question !== "string") {
      return new NextResponse("Question is required", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID is required", { status: 400 });
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
      return new NextResponse("At least 2 options are required", { status: 400 });
    }

    // Verify the channel belongs to this tenant. BoardPoll reaches
    // clientId via channel, so blocking a foreign channelId here is
    // what prevents cross-tenant poll injection.
    const channel = await prisma.boardChannel.findFirst({
      where: { id: channelId, clientId },
      select: { id: true },
    });
    if (!channel) {
      return new NextResponse("Channel not found in this tenant", { status: 404 });
    }

    // Create the poll with options
    const poll = await prisma.boardPoll.create({
      data: {
        question: question.trim(),
        authorId: authorId || null,
        authorName: authorName || "Anonymous",
        authorInitials: authorInitials || "?",
        channelId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        allowMultiple: allowMultiple || false,
        options: {
          create: options.map((opt: string, index: number) => ({
            text: opt.trim(),
            order: index,
          })),
        },
      },
      include: {
        options: {
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

    // Mark channel as having updates
    await prisma.boardChannel.update({
      where: { id: channelId },
      data: { hasUpdates: true },
    });

    return NextResponse.json({ poll }, { status: 201 });
  } catch (error) {
    console.error("Error creating poll:", error);
    return new NextResponse("Failed to create poll", { status: 500 });
  }
}
