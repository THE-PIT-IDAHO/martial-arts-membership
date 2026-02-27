import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trial = await prisma.trialPass.findFirst({
    where: { memberId: auth.memberId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      classesUsed: true,
      maxClasses: true,
      expiresAt: true,
      status: true,
    },
  });

  return NextResponse.json({ trial });
}
