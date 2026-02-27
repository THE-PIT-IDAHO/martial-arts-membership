import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.membership.findMany({
    where: { memberId: auth.memberId },
    include: {
      membershipPlan: {
        select: {
          name: true,
          priceCents: true,
          billingCycle: true,
          autoRenew: true,
          description: true,
          contractLengthMonths: true,
          cancellationNoticeDays: true,
        },
      },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(memberships);
}
