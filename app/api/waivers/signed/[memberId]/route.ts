import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  // Scope by memberId only — member is already tenant-scoped via admin auth.
  // Filtering by clientId here hid legacy rows with a stale clientId from the admin
  // even though the portal (which doesn't filter) still showed them.
  const waivers = await prisma.signedWaiver.findMany({
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
  return NextResponse.json({ waivers });
}
