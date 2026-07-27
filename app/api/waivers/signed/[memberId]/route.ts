import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Opt out of Next.js's route-handler cache so backfilled / newly-created
// waivers show up immediately for all members. Without this, members
// whose cached response was computed when they had zero waivers stayed
// showing "no waivers" even after rows were added to the DB.
export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  // Verify the target member belongs to the caller's tenant BEFORE
  // returning any waivers. The old comment claimed member was
  // tenant-scoped via admin auth, but the route accepted an
  // arbitrary memberId from the URL -- an admin in gym A could
  // list signed waivers (with signatureData + PDF-presence) for
  // any memberId in the DB.
  const clientId = await getClientId(req);
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { clientId: true },
  });
  if (!member || member.clientId !== clientId) {
    return NextResponse.json({ waivers: [] }, { status: 404 });
  }

  // Don't ship the full base64 pdfData in the list — could be multi-MB
  // per row. Frontend hits /api/waivers/[id]/pdf to fetch the PDF on
  // demand and only needs to know whether one exists here.
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
