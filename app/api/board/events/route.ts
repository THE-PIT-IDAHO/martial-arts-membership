import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { formatInTimezone, getGymTimezone, localMidnightUtc, formatDateInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

function formatTime12h(time: string): string {
  if (/[ap]m/i.test(time)) return time;
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}:00 ${period}` : `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// GET /api/board/events — fetch all upcoming system events + which are posted
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    // "Today" in gym TZ so we don't drop events early in the morning UTC
    const tz = await getGymTimezone();
    const today = new Date(localMidnightUtc(formatDateInTimezone(new Date(), tz), tz));

    // Fetch upcoming testing events and promotion events in parallel.
    // ALL three queries now scope by clientId — previously they were
    // unscoped, which let a brand-new gym see other gyms' events.
    const [testingEvents, promotionEvents, postedEvents] = await Promise.all([
      prisma.testingEvent.findMany({
        where: { clientId, date: { gte: today } },
        orderBy: { date: "asc" },
      }),
      prisma.promotionEvent.findMany({
        where: { clientId, date: { gte: today } },
        orderBy: { date: "asc" },
      }),
      prisma.boardEvent.findMany({ where: { clientId } }),
    ]);

    // Verify posted events still have their board posts; clean up orphans
    for (const pe of postedEvents) {
      if (pe.boardPostId) {
        const postExists = await prisma.boardPost.findUnique({
          where: { id: pe.boardPostId },
          select: { id: true },
        });
        if (!postExists) {
          await prisma.boardEvent.delete({ where: { id: pe.id } });
        }
      }
    }

    // Re-fetch after cleanup
    const validPostedEvents = await prisma.boardEvent.findMany({ where: { clientId } });
    const postedSet = new Set(
      validPostedEvents.map((e) => `${e.sourceType}:${e.sourceId}`)
    );

    // Merge into a unified list
    const events = [
      ...testingEvents.map((e) => ({
        sourceType: "testing" as const,
        sourceId: e.id,
        title: e.name,
        date: e.date,
        time: e.time || null,
        styleName: e.styleName,
        status: e.status,
        posted: postedSet.has(`testing:${e.id}`),
      })),
      ...promotionEvents.map((e) => ({
        sourceType: "promotion" as const,
        sourceId: e.id,
        title: e.name,
        date: e.date,
        time: e.time || null,
        styleName: e.styleName,
        status: e.status,
        posted: postedSet.has(`promotion:${e.id}`),
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error fetching board events:", error);
    return new NextResponse("Failed to load board events", { status: 500 });
  }
}

// POST /api/board/events — post an existing event to the board
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { sourceType, sourceId, channelId } = body;

    if (!sourceType || !sourceId) {
      return new NextResponse("sourceType and sourceId are required", { status: 400 });
    }

    // Look up the source event to get details. Verify it belongs to the
    // caller's tenant — without that check, an admin could post another
    // gym's testing/promotion event to their own board.
    let title = "";
    let date: Date = new Date();
    let time: string | null = null;
    let styleName = "";

    if (sourceType === "testing") {
      const event = await prisma.testingEvent.findUnique({ where: { id: sourceId } });
      if (!event || event.clientId !== clientId) {
        return new NextResponse("Testing event not found", { status: 404 });
      }
      title = event.name;
      date = event.date;
      time = event.time;
      styleName = event.styleName;
    } else if (sourceType === "promotion") {
      const event = await prisma.promotionEvent.findUnique({ where: { id: sourceId } });
      if (!event || event.clientId !== clientId) {
        return new NextResponse("Promotion event not found", { status: 404 });
      }
      title = event.name;
      date = event.date;
      time = event.time;
      styleName = event.styleName || "";
    }

    const label = sourceType === "testing" ? "Belt Testing" : "Rank Promotion";
    const tz = (await getSetting("timezone")) || "America/Denver";
    const dateStr = formatInTimezone(date, tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const timeStr = time ? ` at ${formatTime12h(time)}` : "";

    // Find the target channel within THIS tenant — use provided channelId
    // if it belongs to us, else fall back to the first "all" channel for
    // this tenant. (Previous version would fall back to another gym's
    // "all" channel and post to it.)
    let targetChannelId: string | null = null;
    if (channelId) {
      const provided = await prisma.boardChannel.findFirst({
        where: { id: channelId, clientId },
        select: { id: true },
      });
      if (provided) targetChannelId = provided.id;
    }
    if (!targetChannelId) {
      const allChannel = await prisma.boardChannel.findFirst({
        where: { type: "all", clientId },
        select: { id: true },
      });
      if (allChannel) targetChannelId = allChannel.id;
    }

    if (!targetChannelId) {
      return new NextResponse("No channel available to post to", { status: 400 });
    }

    // Create the BoardPost first, then the BoardEvent with the post ID
    const post = await prisma.boardPost.create({
      data: {
        type: "schedule",
        title: `${label}: ${title}`,
        content: `${styleName} — ${dateStr}${timeStr}`,
        authorName: "Admin",
        authorInitials: "A",
        isPriority: true,
        // Pin until end-of-event-day in gym TZ
        pinnedUntil: new Date(localMidnightUtc(formatDateInTimezone(new Date(date), tz), tz) + 24 * 60 * 60 * 1000 - 1),
        channelId: targetChannelId,
      },
    });

    const posted = await prisma.boardEvent.create({
      data: { sourceType, sourceId, boardPostId: post.id, clientId },
    });

    return NextResponse.json({ posted }, { status: 201 });
  } catch (error) {
    console.error("Error posting board event:", error);
    return new NextResponse("Failed to post board event", { status: 500 });
  }
}

// DELETE /api/board/events — unpost an event from the board
export async function DELETE(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const sourceType = searchParams.get("sourceType");
    const sourceId = searchParams.get("sourceId");

    if (!sourceType || !sourceId) {
      return new NextResponse("sourceType and sourceId are required", { status: 400 });
    }

    const boardEvent = await prisma.boardEvent.findUnique({
      where: {
        sourceType_sourceId: { sourceType, sourceId },
      },
    });

    if (!boardEvent || boardEvent.clientId !== clientId) {
      return new NextResponse("Board event not found", { status: 404 });
    }

    // Delete the board post if it exists
    if (boardEvent.boardPostId) {
      await prisma.boardPost.delete({
        where: { id: boardEvent.boardPostId },
      }).catch(() => {
        // Post may already be deleted
      });
    }

    await prisma.boardEvent.delete({
      where: { id: boardEvent.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unposting board event:", error);
    return new NextResponse("Failed to unpost board event", { status: 500 });
  }
}
