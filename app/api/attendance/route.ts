import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/attendance?classSessionId=xxx&date=yyyy-mm-dd
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
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

    const attendances = await prisma.attendance.findMany({
      where: {
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        source: { not: "IMPORTED" },
        member: { clientId },
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
    const { memberId, classSessionId, attendanceDate, requirementOverride, source } = body;

    if (!memberId || !classSessionId || !attendanceDate) {
      return new NextResponse("memberId, classSessionId, and attendanceDate are required", { status: 400 });
    }

    // Parse the date string to extract year/month/day components
    // Use string splitting to avoid timezone shifting issues
    const dateStr = typeof attendanceDate === "string" && attendanceDate.includes("T")
      ? attendanceDate.split("T")[0]
      : String(attendanceDate);
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0); // Local midnight

    // Check if attendance already exists using a date range to handle timezone variations
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    const existing = await prisma.attendance.findFirst({
      where: {
        memberId,
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
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
        source: source || "MANUAL",
        confirmed: source === "KIOSK" ? true : false,
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

    // Also create a ClassBooking so it appears in the member portal
    const existingBooking = await prisma.classBooking.findFirst({
      where: {
        memberId,
        classSessionId,
        bookingDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ["CONFIRMED", "WAITLISTED"] },
      },
    });
    if (!existingBooking) {
      await prisma.classBooking.create({
        data: {
          memberId,
          classSessionId,
          bookingDate: date,
          status: "CONFIRMED",
        },
      });
    }

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
      // Look up the attendance record first so we can cancel the matching booking
      const att = await prisma.attendance.findUnique({
        where: { id },
        select: { memberId: true, classSessionId: true, attendanceDate: true },
      });

      await prisma.attendance.delete({
        where: { id },
      });

      // Cancel matching portal booking
      if (att) {
        const attDate = new Date(att.attendanceDate);
        const s = new Date(attDate.getFullYear(), attDate.getMonth(), attDate.getDate(), 0, 0, 0, 0);
        const e = new Date(attDate.getFullYear(), attDate.getMonth(), attDate.getDate(), 23, 59, 59, 999);
        if (att.classSessionId) {
          await prisma.classBooking.updateMany({
            where: {
              memberId: att.memberId,
              classSessionId: att.classSessionId,
              bookingDate: { gte: s, lte: e },
              status: { in: ["CONFIRMED", "WAITLISTED"] },
            },
            data: { status: "CANCELLED" },
          });
        }
      }
    } else if (memberId && classSessionId && dateStr) {
      // Delete by member, class, and date using range to handle timezone variations
      const [year, month, day] = dateStr.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      await prisma.attendance.deleteMany({
        where: {
          memberId,
          classSessionId,
          attendanceDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      // Cancel matching portal booking
      await prisma.classBooking.updateMany({
        where: {
          memberId,
          classSessionId,
          bookingDate: { gte: startOfDay, lte: endOfDay },
          status: { in: ["CONFIRMED", "WAITLISTED"] },
        },
        data: { status: "CANCELLED" },
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
