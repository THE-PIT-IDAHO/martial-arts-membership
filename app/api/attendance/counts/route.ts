import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/attendance/counts - Get attendance counts by member and class type
// Returns: { counts: { [memberId]: { [classType]: count } } }
//
// Counts mirror the admin member profile so the class sign-in window and
// the profile progress bars stay in sync:
//   - Confirmed attendance only
//   - Apply each member's most recent attendanceResetDate (from their
//     stylesNotes) so pre-promotion classes don't count toward the
//     current rank's requirements
//   - IMPORTED bulk-import rows count (they're historical credit)
//   - Multi-tag classes credit every classType on the session
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const memberIdsParam = searchParams.get("memberIds"); // Optional: comma-separated member IDs

    const memberIdList = memberIdsParam ? memberIdsParam.split(",").filter(Boolean) : null;

    // Pull each member's stylesNotes so we can derive their reset date.
    // Uses the LATEST (most recent) resetDate across their enrolled
    // styles — most restrictive floor, matches how the profile bars
    // exclude pre-promotion attendance from the current rank's progress.
    const membersForReset = await prisma.member.findMany({
      where: {
        clientId,
        ...(memberIdList ? { id: { in: memberIdList } } : {}),
      },
      select: { id: true, stylesNotes: true },
    });
    const memberResetDate = new Map<string, Date | null>();
    for (const m of membersForReset) {
      let latest: Date | null = null;
      if (m.stylesNotes) {
        try {
          const arr = JSON.parse(m.stylesNotes);
          if (Array.isArray(arr)) {
            for (const s of arr) {
              const raw = s?.attendanceResetDate;
              if (typeof raw === "string" && raw) {
                const d = new Date(raw + (raw.includes("T") ? "" : "T00:00:00"));
                if (!Number.isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
              }
            }
          }
        } catch { /* ignore malformed stylesNotes */ }
      }
      memberResetDate.set(m.id, latest);
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        confirmed: true,
        member: { clientId },
        ...(memberIdList ? { memberId: { in: memberIdList } } : {}),
      },
      select: {
        memberId: true,
        source: true,
        attendanceDate: true,
        checkedInAt: true,
        classSession: {
          select: {
            classType: true,
            classTypes: true,
          },
        },
      },
    });

    const counts: Record<string, Record<string, number>> = {};

    for (const attendance of attendances) {
      const memberId = attendance.memberId;

      // Reset-date gate: skip attendance dated strictly before the member's
      // latest reset. Matches the profile's per-style filter for the
      // common single-style member case.
      const resetDate = memberResetDate.get(memberId);
      if (resetDate) {
        const attDate = attendance.attendanceDate || attendance.checkedInAt;
        if (attDate && new Date(attDate) < resetDate) continue;
      }

      let types: string[] = [];
      if (attendance.classSession?.classTypes) {
        try {
          types = JSON.parse(attendance.classSession.classTypes);
        } catch {
          types = [];
        }
      }
      if (types.length === 0 && attendance.classSession?.classType) {
        types = [attendance.classSession.classType];
      }
      if (types.length === 0) continue;

      if (!counts[memberId]) counts[memberId] = {};
      for (const classType of types) {
        counts[memberId][classType] = (counts[memberId][classType] || 0) + 1;
      }
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Error fetching attendance counts:", error);
    return new NextResponse("Failed to load attendance counts", { status: 500 });
  }
}
