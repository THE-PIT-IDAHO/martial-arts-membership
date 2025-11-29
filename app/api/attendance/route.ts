import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/attendance?classSessionId=xxx&date=yyyy-mm-dd
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classSessionId = searchParams.get("classSessionId");
    const dateStr = searchParams.get("date");

    if (!classSessionId || !dateStr) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Parse the date and create start/end of day for comparison
    const date = new Date(dateStr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const attendances = await prisma.attendance.findMany({
      where: {
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryStyle: true,
            stylesNotes: true,
            rank: true,
          },
        },
      },
      orderBy: {
        checkedInAt: "asc",
      },
    });

    return NextResponse.json({ attendances });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return new NextResponse("Failed to load attendance", { status: 500 });
  }
}

// POST /api/attendance
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberId, classSessionId, attendanceDate, requirementOverride } = body;

    if (!memberId || !classSessionId || !attendanceDate) {
      return new NextResponse("memberId, classSessionId, and attendanceDate are required", { status: 400 });
    }

    // Parse the date to start of day for consistent storage
    const date = new Date(attendanceDate);
    date.setHours(0, 0, 0, 0);

    // Check if attendance already exists
    const existing = await prisma.attendance.findFirst({
      where: {
        memberId,
        classSessionId,
        attendanceDate: date,
      },
    });

    if (existing) {
      return new NextResponse("Member is already signed in to this class", { status: 409 });
    }

    const attendance = await prisma.attendance.create({
      data: {
        memberId,
        classSessionId,
        attendanceDate: date,
        source: "MANUAL",
        requirementOverride: requirementOverride || false,
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryStyle: true,
            stylesNotes: true,
            rank: true,
          },
        },
      },
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    console.error("Error creating attendance:", error);
    return new NextResponse("Failed to create attendance", { status: 500 });
  }
}

// DELETE /api/attendance?id=xxx OR ?memberId=xxx&classSessionId=xxx&date=yyyy-mm-dd
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const memberId = searchParams.get("memberId");
    const classSessionId = searchParams.get("classSessionId");
    const dateStr = searchParams.get("date");

    if (id) {
      // Delete by ID
      await prisma.attendance.delete({
        where: { id },
      });
    } else if (memberId && classSessionId && dateStr) {
      // Delete by member, class, and date
      const date = new Date(dateStr);
      date.setHours(0, 0, 0, 0);

      await prisma.attendance.deleteMany({
        where: {
          memberId,
          classSessionId,
          attendanceDate: date,
        },
      });
    } else {
      return new NextResponse("id or (memberId, classSessionId, date) required", { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    return new NextResponse("Failed to delete attendance", { status: 500 });
  }
}
