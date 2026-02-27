import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(_req: Request, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  const clientId = await getClientId(_req);
  const waivers = await prisma.signedWaiver.findMany({
    where: { memberId: params.memberId, clientId },
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
