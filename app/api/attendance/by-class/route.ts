import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/attendance/by-class?classSessionId=xxx&date=yyyy-mm-dd
// Deletes all attendance records for a class on a specific date
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classSessionId = searchParams.get("classSessionId");
    const dateStr = searchParams.get("date");

    if (!classSessionId || !dateStr) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Parse date components to avoid timezone shifting
    const [year, month, day] = dateStr.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    const result = await prisma.attendance.deleteMany({
      where: {
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Cancel all portal bookings for this class on this date
    await prisma.classBooking.updateMany({
      where: {
        classSessionId,
        bookingDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ["CONFIRMED", "WAITLISTED"] },
      },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error("Error deleting attendance by class:", error);
    return new NextResponse("Failed to delete attendance", { status: 500 });
  }
}
