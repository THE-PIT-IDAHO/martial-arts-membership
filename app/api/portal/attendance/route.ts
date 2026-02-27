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
    include: {
      classSession: {
        select: { name: true, styleName: true },
      },
    },
    orderBy: { attendanceDate: "desc" },
    take: limit,
  });

  // Get this month's count
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCount = await prisma.attendance.count({
    where: {
      memberId: auth.memberId,
      attendanceDate: { gte: monthStart },
    },
  });

  const totalCount = await prisma.attendance.count({
    where: { memberId: auth.memberId },
  });

  return NextResponse.json({ records: attendance, monthCount, totalCount });
}
