import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  // Scope by memberId only — member is already tenant-scoped via admin auth.
  // Filtering by clientId here hid legacy rows with a stale clientId from the admin
  // even though the portal (which doesn't filter) still showed them.
  // Don't ship the full base64 pdfData in the list — could be multi-MB per
  // row. Frontend hits /api/waivers/[id]/pdf to fetch the PDF on demand
  // and only needs to know whether one exists here.
  const rows = await prisma.signedWaiver.findMany({
    where: { memberId: params.memberId },
    orderBy: { signedAt: "desc" },
    select: {
      id: true,
      templateName: true,
      signedAt: true,
      signatureData: true,
      pdfData: true,
      confirmed: true,
      confirmedAt: true,
    },
  });
  const waivers = rows.map((w) => ({
    id: w.id,
    templateName: w.templateName,
    signedAt: w.signedAt,
    signatureData: w.signatureData,
    hasPdf: !!w.pdfData,
    confirmed: w.confirmed,
    confirmedAt: w.confirmedAt,
  }));
  return NextResponse.json({ waivers });
}
