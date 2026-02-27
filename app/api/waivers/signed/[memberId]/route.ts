import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  const waivers = await prisma.signedWaiver.findMany({
    where: { memberId: params.memberId },
    orderBy: { signedAt: "desc" },
    select: {
      id: true,
      templateName: true,
      signedAt: true,
      signatureData: true,
      pdfData: true,
    },
  });
  return NextResponse.json({ waivers });
}
