import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/attendance/bulk-delete
// Deletes all imported attendance records for a member and class type
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const classType = searchParams.get("classType");

    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    if (!classType) {
      return NextResponse.json(
        { error: "Class type is required" },
        { status: 400 }
      );
    }

    // Find all class sessions with this class type that are imported
    const importedClassSessions = await prisma.classSession.findMany({
      where: {
        classType: classType,
      },
      select: { id: true },
    });

    const classSessionIds = importedClassSessions.map((cs) => cs.id);

    if (classSessionIds.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message: "No classes found for this class type",
      });
    }

    // Delete all imported attendance records for this member and class type
    const result = await prisma.attendance.deleteMany({
      where: {
        memberId: memberId,
        classSessionId: { in: classSessionIds },
        source: "IMPORTED",
      },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      classType: classType,
    });
  } catch (error) {
    console.error("Error deleting imported attendance:", error);
    return NextResponse.json(
      { error: "Failed to delete imported attendance" },
      { status: 500 }
    );
  }
}
