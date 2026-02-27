import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/attendance/counts - Get attendance counts by member and class type
// Returns: { counts: { [memberId]: { [classType]: count } } }
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const memberIds = searchParams.get("memberIds"); // Optional: comma-separated member IDs

    // Get all CONFIRMED attendance records with their class session's classType
    // Only confirmed attendance counts toward requirements
    const whereClause: { memberId?: { in: string[] }; confirmed: boolean; source: { not: string }; member: { clientId: string } } = {
      confirmed: true,
      source: { not: "IMPORTED" },
      member: { clientId },
    };
    if (memberIds) {
      whereClause.memberId = { in: memberIds.split(",") };
    }

    const attendances = await prisma.attendance.findMany({
      where: whereClause,
      select: {
        memberId: true,
        classSession: {
          select: {
            classType: true,
            classTypes: true,
          },
        },
      },
    });

    // Aggregate counts by member and class type
    // A class with multiple classTypes contributes to ALL of them
    const counts: Record<string, Record<string, number>> = {};

    for (const attendance of attendances) {
      const memberId = attendance.memberId;

      // Get all class types this session counts for
      let types: string[] = [];
      if (attendance.classSession?.classTypes) {
        try {
          types = JSON.parse(attendance.classSession.classTypes);
        } catch {
          types = [];
        }
      }
      // Fallback to legacy single classType
      if (types.length === 0 && attendance.classSession?.classType) {
        types = [attendance.classSession.classType];
      }

      if (types.length === 0) continue;

      if (!counts[memberId]) {
        counts[memberId] = {};
      }

      for (const classType of types) {
        if (!counts[memberId][classType]) {
          counts[memberId][classType] = 0;
        }
        counts[memberId][classType]++;
      }
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Error fetching attendance counts:", error);
    return new NextResponse("Failed to load attendance counts", { status: 500 });
  }
}
