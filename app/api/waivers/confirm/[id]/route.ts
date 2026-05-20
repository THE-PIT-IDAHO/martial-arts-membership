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

    // Already confirmed → idempotent success. This happens routinely when
    // the admin confirms one half of a parent/child pair — the cascade
    // auto-confirms the other — and then clicks Confirm on the second one
    // before the page has refreshed. No reason to error out the admin.
    if (waiver.confirmed) {
      return NextResponse.json({ success: true, alreadyConfirmed: true });
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
    // Match by signedAt within a 30-second window of this waiver. We avoid
    // putting pdfData (which is a multi-MB base64 blob) in a WHERE clause —
    // Postgres can choke on the parameter binding when the value is huge.
    // Wrapped in try/catch so an unexpected failure here can never break
    // the primary confirmation the admin actually clicked.
    try {
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

      if (relatedIds.size > 0) {
        const windowStart = new Date(waiver.signedAt.getTime() - 30 * 1000);
        const windowEnd = new Date(waiver.signedAt.getTime() + 30 * 1000);
        const paired = await prisma.signedWaiver.findMany({
          where: {
            id: { not: id },
            memberId: { in: Array.from(relatedIds) },
            confirmed: false,
            signedAt: { gte: windowStart, lte: windowEnd },
          },
          select: { id: true, memberId: true },
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
    } catch (cascadeErr) {
      console.error("Cascade-confirm of paired waiver failed:", cascadeErr);
      // Swallow — primary confirm above already succeeded.
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
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to confirm: ${msg}` }, { status: 500 });
  }
}
