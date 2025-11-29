import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/attendance/counts - Get attendance counts by member and class type
// Returns: { counts: { [memberId]: { [classType]: count } } }
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const memberIds = searchParams.get("memberIds"); // Optional: comma-separated member IDs

    // Get all CONFIRMED attendance records with their class session's classType
    // Only confirmed attendance counts toward requirements
    const whereClause: { memberId?: { in: string[] }; confirmed: boolean } = {
      confirmed: true,
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
          },
        },
      },
    });

    // Aggregate counts by member and class type
    const counts: Record<string, Record<string, number>> = {};

    for (const attendance of attendances) {
      const memberId = attendance.memberId;
      const classType = attendance.classSession?.classType;

      if (!classType) continue;

      if (!counts[memberId]) {
        counts[memberId] = {};
      }

      if (!counts[memberId][classType]) {
        counts[memberId][classType] = 0;
      }

      counts[memberId][classType]++;
    }

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Error fetching attendance counts:", error);
    return new NextResponse("Failed to load attendance counts", { status: 500 });
  }
}
