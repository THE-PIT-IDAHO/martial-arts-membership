import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/attendance/bulk-import
// Creates multiple "imported" attendance records for a member
// These records count toward promotion requirements but aren't tied to actual calendar classes
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
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

    // Verify member exists and belongs to this tenant
    const member = await prisma.member.findFirst({
      where: { id: memberId, clientId },
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
        clientId,
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
    let earliestImportDate: Date | null = null;

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
        if (!earliestImportDate || checkInDate < earliestImportDate) {
          earliestImportDate = checkInDate;
        }
      } catch {
        // Skip duplicates silently
      }
    }

    // Backdate attendanceResetDate on any of the member's enrolled
    // styles whose beltConfig has a classRequirement matching this
    // classType — otherwise the same-day workflow (enroll + immediately
    // bulk-import historical credit) drops every import because signup
    // sets the reset to today. We only touch styles that clearly count
    // this classType; unrelated styles keep their existing resetDate.
    let resetsAdjusted = 0;
    if (createdCount > 0 && earliestImportDate) {
      try {
        const memberWithStyles = await prisma.member.findUnique({
          where: { id: memberId },
          select: { stylesNotes: true, clientId: true },
        });
        const rawStyles = memberWithStyles?.stylesNotes
          ? JSON.parse(memberWithStyles.stylesNotes)
          : null;
        if (Array.isArray(rawStyles) && rawStyles.length > 0) {
          const styleNames = rawStyles
            .map((s) => (s && typeof s.name === "string" ? s.name : ""))
            .filter(Boolean);
          const dbStyles = await prisma.style.findMany({
            where: { clientId: memberWithStyles!.clientId, name: { in: styleNames } },
            select: { name: true, beltConfig: true },
          });
          const configByName = new Map<string, string | null>();
          for (const s of dbStyles) configByName.set(s.name.toLowerCase(), s.beltConfig);

          const classTypeLower = classType.toLowerCase();
          const beltConfigMentionsType = (beltConfig: string | null): boolean => {
            if (!beltConfig) return false;
            try {
              const parsed = JSON.parse(beltConfig);
              const ranks: unknown[] = Array.isArray(parsed?.ranks) ? parsed.ranks : [];
              for (const r of ranks) {
                const reqs = (r as { classRequirements?: Array<{ label?: string }> })?.classRequirements;
                if (!Array.isArray(reqs)) continue;
                for (const req of reqs) {
                  const lbl = (req?.label || "").toLowerCase();
                  if (lbl === classTypeLower || lbl === "*") return true;
                }
              }
            } catch { /* ignore */ }
            return false;
          };

          // Reset date lives as YYYY-MM-DD (local) in stylesNotes.
          const backdate = new Date(earliestImportDate);
          backdate.setDate(backdate.getDate() - 1);
          const backdateStr = `${backdate.getFullYear()}-${String(backdate.getMonth() + 1).padStart(2, "0")}-${String(backdate.getDate()).padStart(2, "0")}`;

          let changed = false;
          const updatedStyles = rawStyles.map((s: Record<string, unknown>) => {
            const name = typeof s?.name === "string" ? s.name : "";
            const beltConfig = configByName.get(name.toLowerCase()) ?? null;
            if (!beltConfigMentionsType(beltConfig)) return s;
            const currentReset = typeof s?.attendanceResetDate === "string" ? s.attendanceResetDate : null;
            if (currentReset && currentReset <= backdateStr) return s; // already earlier
            changed = true;
            resetsAdjusted++;
            return { ...s, attendanceResetDate: backdateStr };
          });

          if (changed) {
            await prisma.member.update({
              where: { id: memberId },
              data: { stylesNotes: JSON.stringify(updatedStyles) },
            });
          }
        }
      } catch (adjustErr) {
        console.error("Bulk-import reset-date adjust error:", adjustErr);
      }
    }

    return NextResponse.json({
      success: true,
      created: createdCount,
      classType: classType,
      classSessionId: importedClassSession.id,
      resetsAdjusted,
    });
  } catch (error) {
    console.error("Error bulk importing attendance:", error);
    return NextResponse.json(
      { error: "Failed to import attendance records" },
      { status: 500 }
    );
  }
}
