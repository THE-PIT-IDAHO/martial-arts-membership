import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/appointments — list bookable appointment types + member's credits
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Auto-expire any credits past their expiresAt
  await prisma.memberServiceCredit.updateMany({
    where: {
      memberId: auth.memberId,
      status: "ACTIVE",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  const [appointments, credits, spaces] = await Promise.all([
    prisma.appointment.findMany({
      where: { isActive: true },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        duration: true,
        description: true,
        priceCents: true,
      },
    }),
    prisma.memberServiceCredit.findMany({
      where: {
        memberId: auth.memberId,
        status: "ACTIVE",
        creditsRemaining: { gt: 0 },
      },
      include: {
        servicePackage: {
          select: {
            id: true,
            name: true,
            appointmentId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.space.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return NextResponse.json({ appointments, credits, spaces });
}
