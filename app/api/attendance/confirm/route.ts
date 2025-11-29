import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/attendance/confirm - Confirm attendance for members
// Body: { memberIds: string[], classSessionId: string, date: string }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberIds, classSessionId, date } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }

    if (!classSessionId || !date) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Parse the date to start of day for consistent matching
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Update all matching attendance records to confirmed
    const result = await prisma.attendance.updateMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate,
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
    const body = await req.json();
    const { memberIds, classSessionId, date } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }

    if (!classSessionId || !date) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Parse the date to start of day for consistent matching
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Update all matching attendance records to unconfirmed (absent)
    const result = await prisma.attendance.updateMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate,
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
