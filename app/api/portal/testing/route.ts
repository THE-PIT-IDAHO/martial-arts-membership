import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/testing — upcoming testing events for member's styles + past results
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { firstName: true, lastName: true, primaryStyle: true, stylesNotes: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Get member's enrolled styles
  let enrolledStyleNames: string[] = [];
  if (member.stylesNotes) {
    try {
      const styles: Array<{ name: string; active?: boolean }> = JSON.parse(member.stylesNotes);
      enrolledStyleNames = styles.filter((s) => s.active !== false).map((s) => s.name);
    } catch {}
  }
  if (enrolledStyleNames.length === 0 && member.primaryStyle) {
    enrolledStyleNames = [member.primaryStyle];
  }

  // Find style IDs for the member's styles
  const styles = await prisma.style.findMany({
    where: { name: { in: enrolledStyleNames } },
    select: { id: true, name: true },
  });
  const styleIds = styles.map((s) => s.id);

  // Upcoming testing events for member's styles
  const upcomingEvents = await prisma.testingEvent.findMany({
    where: {
      styleId: { in: styleIds },
      date: { gte: new Date() },
      status: "SCHEDULED",
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      name: true,
      date: true,
      time: true,
      location: true,
      styleId: true,
      participants: {
        where: { memberId: auth.memberId },
        select: { id: true, status: true },
      },
    },
  });

  // Map style names to events
  const styleMap = Object.fromEntries(styles.map((s) => [s.id, s.name]));
  const events = upcomingEvents.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    time: e.time,
    location: e.location,
    styleName: styleMap[e.styleId] || "Unknown",
    isRegistered: e.participants.length > 0,
    registrationId: e.participants[0]?.id || null,
    registrationStatus: e.participants[0]?.status || null,
  }));

  // Past test results
  const pastResults = await prisma.testingParticipant.findMany({
    where: { memberId: auth.memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      testingForRank: true,
      currentRank: true,
      status: true,
      score: true,
      notes: true,
      createdAt: true,
      testingEvent: {
        select: { name: true, date: true, styleId: true },
      },
    },
  });

  const results = pastResults.map((r) => ({
    id: r.id,
    eventName: r.testingEvent.name,
    eventDate: r.testingEvent.date,
    styleName: styleMap[r.testingEvent.styleId] || "Unknown",
    testingForRank: r.testingForRank,
    currentRank: r.currentRank,
    status: r.status,
    score: r.score,
    notes: r.notes,
    date: r.createdAt,
  }));

  return NextResponse.json({ events, results });
}

// POST /api/portal/testing — register for a testing event
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { testingEventId } = await request.json();
  if (!testingEventId) {
    return NextResponse.json({ error: "testingEventId required" }, { status: 400 });
  }

  // Get event
  const event = await prisma.testingEvent.findUnique({
    where: { id: testingEventId },
    select: { id: true, date: true, status: true, styleId: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.status !== "SCHEDULED") {
    return NextResponse.json({ error: "Event is not open for registration" }, { status: 400 });
  }
  if (event.date < new Date()) {
    return NextResponse.json({ error: "Event has already passed" }, { status: 400 });
  }

  // Check if already registered
  const existing = await prisma.testingParticipant.findFirst({
    where: { testingEventId, memberId: auth.memberId },
  });
  if (existing) {
    return NextResponse.json({ error: "Already registered" }, { status: 400 });
  }

  // Get member info + current rank for this style
  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { firstName: true, lastName: true, rank: true, primaryStyle: true, stylesNotes: true },
  });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const style = await prisma.style.findUnique({
    where: { id: event.styleId },
    select: { name: true, beltConfig: true },
  });

  let currentRank = member.rank || "";
  let testingForRank = "";

  // Try to find style-specific rank and next rank
  if (member.stylesNotes && style) {
    try {
      const styles: Array<{ name: string; rank?: string }> = JSON.parse(member.stylesNotes);
      const enrolled = styles.find((s) => s.name.toLowerCase() === style.name.toLowerCase());
      if (enrolled?.rank) currentRank = enrolled.rank;
    } catch {}
  }

  if (style?.beltConfig && currentRank) {
    try {
      const config = JSON.parse(style.beltConfig);
      const ranks = (config.ranks || []).sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      const ci = ranks.findIndex((r: { name: string }) => r.name.toLowerCase() === currentRank.toLowerCase());
      if (ci >= 0 && ci < ranks.length - 1) {
        testingForRank = ranks[ci + 1].name;
      }
    } catch {}
  }

  const participant = await prisma.testingParticipant.create({
    data: {
      testingEventId,
      memberId: auth.memberId,
      memberName: `${member.firstName} ${member.lastName}`,
      currentRank,
      testingForRank,
      status: "REGISTERED",
    },
  });

  return NextResponse.json({ success: true, participant });
}
