import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const clientId = await getClientId(req);

  const waiver = await prisma.signedWaiver.findFirst({
    where: { id, clientId },
    select: { id: true, memberId: true, templateName: true },
  });
  if (!waiver) return NextResponse.json({ error: "Waiver not found" }, { status: 404 });

  await prisma.signedWaiver.delete({ where: { id: waiver.id } });

  // If this was the member's only signed waiver, clear waiverSigned on the member
  // so the profile reflects "no waiver on file".
  const remaining = await prisma.signedWaiver.count({
    where: { memberId: waiver.memberId, clientId },
  });
  if (remaining === 0) {
    await prisma.member.update({
      where: { id: waiver.memberId },
      data: { waiverSigned: false, waiverSignedAt: null },
    });
  }

  logAudit({
    entityType: "SignedWaiver",
    entityId: waiver.id,
    action: "DELETE",
    summary: `Deleted waiver "${waiver.templateName}" for member ${waiver.memberId}${remaining === 0 ? " (status reset)" : ""}`,
  }).catch(() => {});

  return NextResponse.json({ success: true, waiverSignedReset: remaining === 0 });
}
