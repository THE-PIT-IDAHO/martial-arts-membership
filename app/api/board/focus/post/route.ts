import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/board/focus/post — post the active focus to the board feed
export async function POST(req: Request) {
  try {
    await getClientId(req); // validate tenant
    const body = await req.json();
    const { pinnedUntilDay, pinnedUntilHour, channelId } = body;

    // pinnedUntilDay: 0=Sunday..6=Saturday
    // pinnedUntilHour: 0-23

    if (pinnedUntilDay === undefined || pinnedUntilHour === undefined) {
      return new NextResponse("pinnedUntilDay and pinnedUntilHour are required", { status: 400 });
    }

    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!focus) {
      return new NextResponse("No active focus to post", { status: 404 });
    }

    // Calculate the next occurrence of the chosen weekday+hour
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = pinnedUntilDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0) {
      // Same day — if the hour hasn't passed, use today; otherwise next week
      if (now.getHours() >= pinnedUntilHour) daysUntil = 7;
    }
    const pinnedUntil = new Date(now);
    pinnedUntil.setDate(pinnedUntil.getDate() + daysUntil);
    pinnedUntil.setHours(pinnedUntilHour, 0, 0, 0);

    // Find the target channel
    let targetChannelId = channelId;
    if (!targetChannelId) {
      const allChannel = await prisma.boardChannel.findFirst({
        where: { type: "all" },
      });
      if (allChannel) targetChannelId = allChannel.id;
    }

    if (!targetChannelId) {
      return new NextResponse("No channel available to post to", { status: 400 });
    }

    // Build content
    let content = focus.description || "";
    if (focus.videoUrl) {
      content += content ? "\n\n" : "";
      content += `Video: ${focus.videoUrl}`;
    }

    // Create the board post
    const post = await prisma.boardPost.create({
      data: {
        type: "notice",
        title: `Focus This Week: ${focus.title}`,
        content,
        authorName: "Admin",
        authorInitials: "A",
        isPriority: true,
        pinnedUntil,
        channelId: targetChannelId,
      },
    });

    // Mark the focus as posted
    await prisma.weeklyFocus.update({
      where: { id: focus.id },
      data: {
        postedAt: new Date(),
        pinnedUntil,
        boardPostId: post.id,
      },
    });

    return NextResponse.json({ post, pinnedUntil }, { status: 201 });
  } catch (error) {
    console.error("Error posting focus to board:", error);
    return new NextResponse("Failed to post focus", { status: 500 });
  }
}

// PATCH /api/board/focus/post — update the pin time on an already-posted focus
export async function PATCH(req: Request) {
  try {
    await getClientId(req); // validate tenant
    const body = await req.json();
    const { pinnedUntilDay, pinnedUntilHour } = body;

    if (pinnedUntilDay === undefined || pinnedUntilHour === undefined) {
      return new NextResponse("pinnedUntilDay and pinnedUntilHour are required", { status: 400 });
    }

    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true, postedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    if (!focus || !focus.boardPostId) {
      return new NextResponse("No posted focus to update", { status: 404 });
    }

    // Calculate the next occurrence of the chosen weekday+hour
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = pinnedUntilDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0) {
      if (now.getHours() >= pinnedUntilHour) daysUntil = 7;
    }
    const pinnedUntil = new Date(now);
    pinnedUntil.setDate(pinnedUntil.getDate() + daysUntil);
    pinnedUntil.setHours(pinnedUntilHour, 0, 0, 0);

    // Update the board post's pinnedUntil
    await prisma.boardPost.update({
      where: { id: focus.boardPostId },
      data: { pinnedUntil },
    });

    // Update the focus's pinnedUntil
    await prisma.weeklyFocus.update({
      where: { id: focus.id },
      data: { pinnedUntil },
    });

    return NextResponse.json({ pinnedUntil });
  } catch (error) {
    console.error("Error updating focus pin time:", error);
    return new NextResponse("Failed to update pin time", { status: 500 });
  }
}

// DELETE /api/board/focus/post — unpost the focus from the board
export async function DELETE(req: Request) {
  try {
    await getClientId(req); // validate tenant
    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true, postedAt: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    if (!focus || !focus.boardPostId) {
      return new NextResponse("No posted focus to remove", { status: 404 });
    }

    // Delete the board post
    await prisma.boardPost.delete({
      where: { id: focus.boardPostId },
    }).catch(() => {
      // Post may already be deleted
    });

    // Clear posted state
    await prisma.weeklyFocus.update({
      where: { id: focus.id },
      data: {
        postedAt: null,
        pinnedUntil: null,
        boardPostId: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unposting focus:", error);
    return new NextResponse("Failed to unpost focus", { status: 500 });
  }
}
