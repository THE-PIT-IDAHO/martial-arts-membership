import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getGymTimezone, getDayOfWeekInTimezone, getLocalParts, localMidnightUtc, formatDateInTimezone } from "@/lib/dates";

// All methods scope by clientId now. Before this fix:
//   * POST would pin the "first type:all channel" (any tenant), grab
//     the most recent active WeeklyFocus (any tenant), and create a
//     BoardPost with no clientId.
//   * PATCH updated any tenant's posted focus + its board post.
//   * DELETE deleted any tenant's posted focus + board post.

// POST /api/board/focus/post — post the active focus to the board feed
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { pinnedUntilDay, pinnedUntilHour, channelId } = body;

    // pinnedUntilDay: 0=Sunday..6=Saturday
    // pinnedUntilHour: 0-23

    if (pinnedUntilDay === undefined || pinnedUntilHour === undefined) {
      return new NextResponse("pinnedUntilDay and pinnedUntilHour are required", { status: 400 });
    }

    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true, clientId },
      orderBy: { createdAt: "desc" },
    });

    if (!focus) {
      return new NextResponse("No active focus to post", { status: 404 });
    }

    // Calculate the next occurrence of the chosen weekday+hour in gym TZ
    const now = new Date();
    const tz = await getGymTimezone(clientId);
    const localNow = getLocalParts(now, tz);
    const currentDay = getDayOfWeekInTimezone(now, tz);
    let daysUntil = pinnedUntilDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && localNow.hour >= pinnedUntilHour) {
      daysUntil = 7;
    }
    // Target local YYYY-MM-DD: today + daysUntil
    const todayLocal = formatDateInTimezone(now, tz);
    const targetLocalMs = new Date(todayLocal + "T12:00:00Z").getTime() + daysUntil * 24 * 60 * 60 * 1000;
    const targetLocalYmd = formatDateInTimezone(new Date(targetLocalMs), tz);
    const pinnedUntil = new Date(localMidnightUtc(targetLocalYmd, tz) + pinnedUntilHour * 60 * 60 * 1000);

    // Find the target channel -- must belong to this tenant. Prevents
    // posting into another gym's channel by supplying its id.
    let targetChannelId = channelId as string | undefined;
    if (targetChannelId) {
      const ch = await prisma.boardChannel.findFirst({
        where: { id: targetChannelId, clientId },
        select: { id: true },
      });
      if (!ch) {
        return new NextResponse("Channel not found in this tenant", { status: 404 });
      }
    } else {
      const allChannel = await prisma.boardChannel.findFirst({
        where: { type: "all", clientId },
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

    // Create the board post (tenant scoping comes from the channel).
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
    const clientId = await getClientId(req);
    const body = await req.json();
    const { pinnedUntilDay, pinnedUntilHour } = body;

    if (pinnedUntilDay === undefined || pinnedUntilHour === undefined) {
      return new NextResponse("pinnedUntilDay and pinnedUntilHour are required", { status: 400 });
    }

    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true, postedAt: { not: null }, clientId },
      orderBy: { createdAt: "desc" },
    });

    if (!focus || !focus.boardPostId) {
      return new NextResponse("No posted focus to update", { status: 404 });
    }

    // Verify board post belongs to this tenant before updating.
    const post = await prisma.boardPost.findFirst({
      where: { id: focus.boardPostId, channel: { clientId } },
      select: { id: true },
    });
    if (!post) {
      return new NextResponse("Posted focus not found", { status: 404 });
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
    const clientId = await getClientId(req);
    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true, postedAt: { not: null }, clientId },
      orderBy: { createdAt: "desc" },
    });

    if (!focus || !focus.boardPostId) {
      return new NextResponse("No posted focus to remove", { status: 404 });
    }

    // Verify tenant ownership before deleting the board post.
    const post = await prisma.boardPost.findFirst({
      where: { id: focus.boardPostId, channel: { clientId } },
      select: { id: true },
    });
    if (post) {
      await prisma.boardPost.delete({
        where: { id: focus.boardPostId },
      }).catch(() => {
        // Post may already be deleted
      });
    }

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
