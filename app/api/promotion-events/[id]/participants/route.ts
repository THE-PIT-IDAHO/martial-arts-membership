// /api/promotion-events/[id]/participants
//   GET   → list roster for an event
//   POST  → add one member OR a bulk array of memberIds
//   PATCH → update one participant (status/notes/etc.)
//   DELETE?participantId=  → remove one participant
//
// All ops are tenant-scoped via the event's clientId; previously these
// were unscoped (any authenticated user could write to any gym's event).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

async function verifyEvent(eventId: string, clientId: string) {
  const e = await prisma.promotionEvent.findUnique({
    where: { id: eventId },
    select: { id: true, clientId: true },
  });
  if (!e || e.clientId !== clientId) return null;
  return e;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyEvent(id, clientId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const participants = await prisma.promotionParticipant.findMany({
      where: { promotionEventId: id },
      orderBy: { memberName: "asc" },
    });
    return NextResponse.json({ participants });
  } catch (err) {
    console.error("GET participants error:", err);
    return NextResponse.json({ error: "Failed to load participants" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyEvent(id, clientId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await req.json();
    // Accept either a single { memberId } OR a bulk { memberIds: string[] }.
    const memberIds: string[] = Array.isArray(body.memberIds)
      ? body.memberIds.filter((s: unknown): s is string => typeof s === "string")
      : typeof body.memberId === "string"
        ? [body.memberId]
        : [];

    if (memberIds.length === 0) {
      return NextResponse.json({ error: "No memberIds provided" }, { status: 400 });
    }

    // Look up valid members (in this tenant) and the existing roster so we
    // can skip duplicates instead of erroring on the whole batch.
    const [members, existing] = await Promise.all([
      prisma.member.findMany({
        where: { id: { in: memberIds }, clientId },
        select: { id: true, firstName: true, lastName: true, rank: true },
      }),
      prisma.promotionParticipant.findMany({
        where: { promotionEventId: id, memberId: { in: memberIds } },
        select: { memberId: true },
      }),
    ]);
    const existingSet = new Set(existing.map((p) => p.memberId));

    const toCreate = members.filter((m) => !existingSet.has(m.id));
    if (toCreate.length === 0) {
      return NextResponse.json({ added: 0, skipped: members.length }, { status: 200 });
    }

    await prisma.promotionParticipant.createMany({
      data: toCreate.map((m) => ({
        promotionEventId: id,
        memberId: m.id,
        memberName: `${m.firstName} ${m.lastName}`.trim(),
        currentRank: m.rank || null,
        status: "REGISTERED",
      })),
    });

    return NextResponse.json({
      added: toCreate.length,
      skipped: members.length - toCreate.length,
    }, { status: 201 });
  } catch (err) {
    console.error("POST participants error:", err);
    return NextResponse.json({ error: "Failed to add participants" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyEvent(id, clientId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const participantId = searchParams.get("participantId");
    if (!participantId) {
      return NextResponse.json({ error: "participantId required" }, { status: 400 });
    }

    const participant = await prisma.promotionParticipant.findUnique({
      where: { id: participantId },
      select: { promotionEventId: true },
    });
    if (!participant || participant.promotionEventId !== id) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    await prisma.promotionParticipant.delete({ where: { id: participantId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE participants error:", err);
    return NextResponse.json({ error: "Failed to remove participant" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyEvent(id, clientId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await req.json();
    const { participantId, status, notes, promotingToRank, promotedAt, feeOverrideCents } = body;
    if (!participantId) {
      return NextResponse.json({ error: "participantId required" }, { status: 400 });
    }

    const participant = await prisma.promotionParticipant.findUnique({
      where: { id: participantId },
      select: { promotionEventId: true },
    });
    if (!participant || participant.promotionEventId !== id) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (promotingToRank !== undefined) updateData.promotingToRank = promotingToRank;
    if (promotedAt !== undefined) updateData.promotedAt = promotedAt ? new Date(promotedAt) : null;
    if (feeOverrideCents !== undefined) {
      // Empty string / null / negative → clear the override and fall
      // back to the event's default cost.
      const n = feeOverrideCents === null || feeOverrideCents === "" ? null : Number(feeOverrideCents);
      updateData.feeOverrideCents = n != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }

    const updated = await prisma.promotionParticipant.update({
      where: { id: participantId },
      data: updateData,
    });
    return NextResponse.json({ participant: updated });
  } catch (err) {
    console.error("PATCH participants error:", err);
    return NextResponse.json({ error: "Failed to update participant" }, { status: 500 });
  }
}
