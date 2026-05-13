import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  // Scope by id only — legacy rows may have a different clientId than the current
  // tenant, but admin auth has already established access to the member.
  const waiver = await prisma.signedWaiver.findUnique({
    where: { id },
    select: { id: true, memberId: true, templateName: true },
  });
  if (!waiver) return NextResponse.json({ error: "Waiver not found" }, { status: 404 });

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
