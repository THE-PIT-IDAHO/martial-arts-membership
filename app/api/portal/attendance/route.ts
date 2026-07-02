import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  const attendance = await prisma.attendance.findMany({
    where: { memberId: auth.memberId },
    select: {
      id: true,
      attendanceDate: true,
      checkedInAt: true,
      source: true,
      confirmed: true,
      classSession: {
        select: { name: true, styleName: true },
      },
    },
    orderBy: { attendanceDate: "desc" },
    take: limit,
  });

  // Counts only include confirmed attendance — the "This Month" and
  // "All Time" stat tiles should reflect classes the coach signed
  // off on, not pending kiosk check-ins or auto-created rows.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCount = await prisma.attendance.count({
    where: {
      memberId: auth.memberId,
      confirmed: true,
      attendanceDate: { gte: monthStart },
    },
  });

  const totalCount = await prisma.attendance.count({
    where: { memberId: auth.memberId, confirmed: true },
  });

  return NextResponse.json({ records: attendance, monthCount, totalCount });
}
