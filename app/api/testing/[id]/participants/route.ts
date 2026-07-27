import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// All four handlers verify the parent TestingEvent's clientId
// matches the caller's tenant. Before this fix, none of them did:
// an admin in gym A could list, grade, add, or remove participants
// on any gym's test event just by knowing the event id.
async function assertEventTenant(id: string, clientId: string) {
  const ev = await prisma.testingEvent.findUnique({
    where: { id },
    select: { clientId: true },
  });
  return !!ev && ev.clientId === clientId;
}

// GET /api/testing/[id]/participants - Get all participants for an event
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    if (!(await assertEventTenant(id, clientId))) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    const participants = await prisma.testingParticipant.findMany({
      where: { testingEventId: id },
      orderBy: { memberName: "asc" },
    });

    return NextResponse.json({ participants });
  } catch (error) {
    console.error("Error fetching participants:", error);
    return new NextResponse("Failed to load participants", { status: 500 });
  }
}

// POST /api/testing/[id]/participants - Add a participant to the event
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();
    const { memberId, memberName, currentRank, testingForRank, notes } = body;

    if (!memberId || !memberName) {
      return new NextResponse("memberId and memberName are required", { status: 400 });
    }

    if (!(await assertEventTenant(id, clientId))) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    // Also verify the member being added belongs to this tenant, so
    // a cross-tenant memberId can't be smuggled onto our event.
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { clientId: true },
    });
    if (!member || member.clientId !== clientId) {
      return new NextResponse("Member not found in this tenant", { status: 400 });
    }

    // Check if member is already registered
    const existing = await prisma.testingParticipant.findFirst({
      where: {
        testingEventId: id,
        memberId,
      },
    });

    if (existing) {
      return new NextResponse("Member is already registered for this test", { status: 400 });
    }

    const participant = await prisma.testingParticipant.create({
      data: {
        testingEventId: id,
        memberId,
        memberName,
        currentRank: currentRank || null,
        testingForRank: testingForRank || null,
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

// DELETE /api/testing/[id]/participants - Remove a participant from the event
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get("participantId");

    if (!participantId) {
      return new NextResponse("participantId is required", { status: 400 });
    }

    if (!(await assertEventTenant(id, clientId))) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    // Also confirm the participant actually belongs to THIS event --
    // otherwise a caller could delete a participant on another gym's
    // event by pairing a same-tenant event id with a foreign
    // participantId.
    const participant = await prisma.testingParticipant.findUnique({
      where: { id: participantId },
      select: { testingEventId: true },
    });
    if (!participant || participant.testingEventId !== id) {
      return new NextResponse("Participant not found", { status: 404 });
    }

    await prisma.testingParticipant.delete({
      where: { id: participantId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing participant:", error);
    return new NextResponse("Failed to remove participant", { status: 500 });
  }
}

// PATCH /api/testing/[id]/participants - Update a participant's status/score/notes
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();
    const { participantId, status, score, notes, adminNotes, resultPdfUrl, testingForRank, itemScores } = body;

    if (!participantId) {
      return new NextResponse("participantId is required", { status: 400 });
    }

    if (!(await assertEventTenant(id, clientId))) {
      return new NextResponse("Testing event not found", { status: 404 });
    }

    // Same defense as DELETE -- ensure participant belongs to this
    // event so a foreign participantId can't be updated by pairing
    // it with a same-tenant event id.
    const owned = await prisma.testingParticipant.findUnique({
      where: { id: participantId },
      select: { testingEventId: true },
    });
    if (!owned || owned.testingEventId !== id) {
      return new NextResponse("Participant not found", { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status.toUpperCase();
    if (score !== undefined) updateData.score = score;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes?.trim() || null;
    if (resultPdfUrl !== undefined) updateData.resultPdfUrl = resultPdfUrl;
    if (testingForRank !== undefined) updateData.testingForRank = testingForRank;
    if (itemScores !== undefined) {
      // itemScores should be an object like { itemId: { score, passed, notes } }
      updateData.itemScores = typeof itemScores === "string" ? itemScores : JSON.stringify(itemScores);
    }

    // publish: true stamps resultsPublishedAt (Mark Complete on a
    // single participant). publish: false clears it (undo). The
    // portal only shows the participant + PDF when this is set.
    if (body.publish === true) updateData.resultsPublishedAt = new Date();
    if (body.publish === false) updateData.resultsPublishedAt = null;

    const participant = await prisma.testingParticipant.update({
      where: { id: participantId },
      data: updateData,
    });

    return NextResponse.json({ participant });
  } catch (error) {
    console.error("Error updating participant:", error);
    return new NextResponse("Failed to update participant", { status: 500 });
  }
}
