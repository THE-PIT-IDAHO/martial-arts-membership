import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import {
  countAttendanceByType,
  parseEnrolledStyles,
  type AttendanceRow,
} from "@/lib/rank-progress";

// GET /api/attendance/counts — per-member per-classType attendance counts,
// scoped to the caller's tenant. Runs the shared attendance filter from
// lib/rank-progress so the calendar sign-in window matches the admin
// profile progress bars.
//
// Query: ?memberIds=id1,id2,... (optional — omit for all active members)
// Returns: { counts: { [memberId]: { [classType]: number } } }
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const memberIdsParam = searchParams.get("memberIds");
    const memberIdList = memberIdsParam ? memberIdsParam.split(",").filter(Boolean) : null;

    const members = await prisma.member.findMany({
      where: {
        clientId,
        ...(memberIdList ? { id: { in: memberIdList } } : {}),
      },
      select: {
        id: true,
        stylesNotes: true,
        attendances: {
          where: { confirmed: true },
          select: {
            source: true,
            attendanceDate: true,
            checkedInAt: true,
            classSession: {
              select: {
                classType: true,
                classTypes: true,
                styleName: true,
                styleNames: true,
              },
            },
          },
        },
      },
    });

    const counts: Record<string, Record<string, number>> = {};
    for (const m of members) {
      const enrolled = parseEnrolledStyles(m.stylesNotes).filter((s) => s.active !== false);
      if (enrolled.length === 0) continue;
      const perType = countAttendanceByType(m.attendances as AttendanceRow[], enrolled);
      if (Object.keys(perType).length > 0) counts[m.id] = perType;
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Error fetching attendance counts:", error);
    return new NextResponse("Failed to load attendance counts", { status: 500 });
  }
}
