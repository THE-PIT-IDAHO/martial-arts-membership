import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendWaiverReceivedEmail } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);

    const waiver = await prisma.signedWaiver.findUnique({
      where: { id },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!waiver || waiver.clientId !== clientId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (waiver.confirmed) {
      return NextResponse.json({ error: "Already confirmed" }, { status: 400 });
    }

    const now = new Date();

    // 1. Mark waiver as confirmed
    await prisma.signedWaiver.update({
      where: { id },
      data: { confirmed: true, confirmedAt: now },
    });

    // 2. Update member's waiver status
    await prisma.member.update({
      where: { id: waiver.memberId },
      data: { waiverSigned: true, waiverSignedAt: now },
    });

    // 3. Cascade-confirm any paired waiver on a related member (parent/guardian
    // and dependent share one submission — confirming one should confirm both).
    // Match by pdfData (identical PDF) within a 5-minute window of signedAt.
    const relationships = await prisma.memberRelationship.findMany({
      where: {
        OR: [
          { fromMemberId: waiver.memberId },
          { toMemberId: waiver.memberId },
        ],
      },
      select: { fromMemberId: true, toMemberId: true },
    });
    const relatedIds = new Set<string>();
    for (const rel of relationships) {
      if (rel.fromMemberId !== waiver.memberId) relatedIds.add(rel.fromMemberId);
      if (rel.toMemberId !== waiver.memberId) relatedIds.add(rel.toMemberId);
    }

    if (relatedIds.size > 0 && waiver.pdfData) {
      const windowStart = new Date(waiver.signedAt.getTime() - 5 * 60 * 1000);
      const windowEnd = new Date(waiver.signedAt.getTime() + 5 * 60 * 1000);
      const paired = await prisma.signedWaiver.findMany({
        where: {
          id: { not: id },
          memberId: { in: Array.from(relatedIds) },
          pdfData: waiver.pdfData,
          confirmed: false,
          signedAt: { gte: windowStart, lte: windowEnd },
        },
        include: { member: { select: { id: true, firstName: true, lastName: true } } },
      });
      for (const p of paired) {
        await prisma.signedWaiver.update({
          where: { id: p.id },
          data: { confirmed: true, confirmedAt: now },
        });
        await prisma.member.update({
          where: { id: p.memberId },
          data: { waiverSigned: true, waiverSignedAt: now },
        });
      }
    }

    // 4. Send waiver confirmation email
    if (waiver.member.email) {
      sendWaiverReceivedEmail({
        email: waiver.member.email,
        firstName: waiver.member.firstName,
        clientId,
        memberId: waiver.member.id,
      }).catch(() => {});
    }

    // 5. Audit log
    logAudit({
      entityType: "SignedWaiver",
      entityId: id,
      action: "UPDATE",
      summary: `Waiver confirmed for ${waiver.member.firstName} ${waiver.member.lastName}`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error confirming waiver:", error);
    return NextResponse.json({ error: "Failed to confirm" }, { status: 500 });
  }
}
