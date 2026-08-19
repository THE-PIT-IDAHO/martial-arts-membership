import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/reports/attendance - Get attendance data for reports
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const allTime = searchParams.get("allTime") === "true";

    // Tenant scope — without this, the route returns attendance for every
    // gym in the system. Filter to attendances whose member belongs to the
    // current tenant.
    //
    // confirmed:true matches every other surface that counts attendance
    // toward rank progress (member profile, /api/promotions/eligible,
    // dashboard eligibility widget, calendar sign-in window). Without
    // it, unconfirmed kiosk sign-ins inflated the reports per-class-type
    // counts and made them disagree with the profile bars for the same
    // member. Reports are for display, but they need to agree with the
    // rest of the app first.
    const whereClause: any = { member: { clientId }, confirmed: true };

    if (!allTime) {
      // Default to last 30 days if no dates provided
      const endDate = endDateStr ? new Date(endDateStr) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const startDate = startDateStr ? new Date(startDateStr) : new Date();
      if (!startDateStr) {
        startDate.setDate(startDate.getDate() - 30);
      }
      startDate.setHours(0, 0, 0, 0);

      whereClause.attendanceDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    const attendances = await prisma.attendance.findMany({
      where: whereClause,
      select: {
        id: true,
        memberId: true,
        attendanceDate: true,
        source: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        classSession: {
          select: {
            id: true,
            name: true,
            styleName: true,
            styleNames: true,
            classType: true,
            // Multi-tag classes carry their extra types here (JSON-
            // encoded string[]). The shared rank-progress lib reads
            // BOTH classType and classTypes when matching an attendance
            // to a per-type requirement; leaving classTypes out was
            // silently under-counting multi-tag classes for anything
            // beyond their primary classType label.
            classTypes: true,
          },
        },
      },
      orderBy: {
        attendanceDate: "desc",
      },
    });

    return NextResponse.json({ attendances });
  } catch (error) {
    console.error("Error fetching attendance report:", error);
    return new NextResponse("Failed to load attendance report", { status: 500 });
  }
}
