import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/attendance/confirm - Confirm attendance for members
// Body: { memberIds: string[], classSessionId: string, date: string }
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberIds, classSessionId, date } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }

    if (!classSessionId || !date) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Verify class belongs to this gym
    const cls = await prisma.classSession.findUnique({ where: { id: classSessionId }, select: { clientId: true } });
    if (!cls || cls.clientId !== clientId) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Parse date components to avoid timezone shifting
    const [year, month, day] = date.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Update all matching attendance records to confirmed (only for members in this gym)
    const result = await prisma.attendance.updateMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        member: { clientId },
      },
      data: {
        confirmed: true,
      },
    });

    return NextResponse.json({
      success: true,
      confirmedCount: result.count
    });
  } catch (error) {
    console.error("Error confirming attendance:", error);
    return new NextResponse("Failed to confirm attendance", { status: 500 });
  }
}

// DELETE /api/attendance/confirm - Unconfirm (mark as absent) attendance for members
// Body: { memberIds: string[], classSessionId: string, date: string }
export async function DELETE(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberIds, classSessionId, date } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }

    if (!classSessionId || !date) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Verify class belongs to this gym
    const cls = await prisma.classSession.findUnique({ where: { id: classSessionId }, select: { clientId: true } });
    if (!cls || cls.clientId !== clientId) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Parse date components to avoid timezone shifting
    const [year, month, day] = date.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Update all matching attendance records to unconfirmed (only for members in this gym)
    const result = await prisma.attendance.updateMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        member: { clientId },
      },
      data: {
        confirmed: false,
      },
    });

    return NextResponse.json({
      success: true,
      unconfirmedCount: result.count
    });
  } catch (error) {
    console.error("Error marking attendance as absent:", error);
    return new NextResponse("Failed to mark attendance as absent", { status: 500 });
  }
}
