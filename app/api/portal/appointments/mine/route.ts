import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/appointments/mine — member's upcoming appointments + credit balances
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [appointments, credits] = await Promise.all([
    prisma.scheduledAppointment.findMany({
      where: {
        memberId: auth.memberId,
        scheduledDate: { gte: today },
        status: { not: "CANCELLED" },
      },
      include: {
        appointment: { select: { id: true, title: true, duration: true } },
      },
      orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    }),
    prisma.memberServiceCredit.findMany({
      where: {
        memberId: auth.memberId,
        status: "ACTIVE",
        creditsRemaining: { gt: 0 },
      },
      include: {
        servicePackage: {
          select: { id: true, name: true, appointmentId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ appointments, credits });
}
