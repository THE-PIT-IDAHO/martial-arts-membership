import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getClientId } from "@/lib/tenant";

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const clientId = await getClientId(req);

  // Verify the waiver belongs to this tenant via its owning member.
  // SignedWaiver carries a clientId column directly too — we check both
  // (member.clientId is the canonical source; signedWaiver.clientId can
  // get stale on legacy rows).
  const waiver = await prisma.signedWaiver.findUnique({
    where: { id },
    select: {
      id: true,
      memberId: true,
      templateName: true,
      member: { select: { clientId: true } },
    },
  });
  if (!waiver || waiver.member?.clientId !== clientId) {
    return NextResponse.json({ error: "Waiver not found" }, { status: 404 });
  }

  await prisma.signedWaiver.delete({ where: { id: waiver.id } });

  // Deleting a waiver resets the member's waiver status to "not on file"
  // — matches the staff mental model of one active waiver per member.
  await prisma.member.update({
    where: { id: waiver.memberId },
    data: { waiverSigned: false, waiverSignedAt: null },
  });

  logAudit({
    entityType: "SignedWaiver",
    entityId: waiver.id,
    action: "DELETE",
    summary: `Deleted waiver "${waiver.templateName}" for member ${waiver.memberId} (status reset)`,
  }).catch(() => {});

  return NextResponse.json({ success: true, waiverSignedReset: true });
}
