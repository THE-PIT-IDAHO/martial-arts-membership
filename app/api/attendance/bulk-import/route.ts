import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/attendance/bulk-import
// Creates multiple "imported" attendance records for a member
// These records count toward promotion requirements but aren't tied to actual calendar classes
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberId, classType, count } = body;

    if (!memberId || typeof memberId !== "string") {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    if (!classType || typeof classType !== "string") {
      return NextResponse.json(
        { error: "Class type is required" },
        { status: 400 }
      );
    }

    if (!count || typeof count !== "number" || count < 1 || count > 500) {
      return NextResponse.json(
        { error: "Count must be a number between 1 and 500" },
        { status: 400 }
      );
    }

    // Verify member exists
    const member = await prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Get or create a special "Imported Classes" class session for this class type
    // This allows us to track imported attendance without cluttering the calendar
    const importedClassName = `Imported ${classType} Classes`;

    let importedClassSession = await prisma.classSession.findFirst({
      where: {
        name: importedClassName,
        classType: classType,
      },
    });

    if (!importedClassSession) {
      // Create a class session for imported records
      // Use a far past date so it doesn't show on calendar
      importedClassSession = await prisma.classSession.create({
        data: {
          name: importedClassName,
          classType: classType,
          startsAt: new Date("2000-01-01T00:00:00Z"),
          endsAt: new Date("2000-01-01T01:00:00Z"),
          clientId: member.clientId,
        },
      });
    }

    // Create the attendance records individually
    // Spread them out over past dates to avoid duplicate constraint issues
    const baseDate = new Date();
    baseDate.setFullYear(baseDate.getFullYear() - 1); // Start from 1 year ago

    let createdCount = 0;

    for (let i = 0; i < count; i++) {
      const checkInDate = new Date(baseDate);
      // Spread records across different days going further back
      checkInDate.setDate(checkInDate.getDate() - i);
      // Add some randomness to avoid exact same timestamps
      checkInDate.setHours(10 + Math.floor(Math.random() * 8)); // Between 10am and 6pm
      checkInDate.setMinutes(Math.floor(Math.random() * 60));
      checkInDate.setSeconds(Math.floor(Math.random() * 60));
      checkInDate.setMilliseconds(Math.floor(Math.random() * 1000));

      try {
        await prisma.attendance.create({
          data: {
            memberId: memberId,
            classSessionId: importedClassSession.id,
            attendanceDate: checkInDate,
            checkedInAt: checkInDate,
            source: "IMPORTED",
            confirmed: true,
          },
        });
        createdCount++;
      } catch {
        // Skip duplicates silently
      }
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
      classType: classType,
      classSessionId: importedClassSession.id,
    });
  } catch (error) {
    console.error("Error bulk importing attendance:", error);
    return NextResponse.json(
      { error: "Failed to import attendance records" },
      { status: 500 }
    );
  }
}
