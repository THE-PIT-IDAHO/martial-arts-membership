import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/calendar/export — returns an iCal (.ics) file of class schedule
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const styleFilter = searchParams.get("styleId");

    const classes = await prisma.classSession.findMany({
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        isRecurring: true,
        frequencyNumber: true,
        frequencyUnit: true,
        scheduleStartDate: true,
        scheduleEndDate: true,
        isOngoing: true,
        excludedDates: true,
        classType: true,
        styleName: true,
        styleNames: true,
        styleIds: true,
        coachName: true,
        locationId: true,
      },
      orderBy: { startsAt: "asc" },
    });

    // Filter by style if specified
    let filtered = classes.filter((c) => c.classType !== "Imported");
    if (styleFilter) {
      filtered = filtered.filter((c) => {
        if (c.styleIds) {
          try {
            const ids: string[] = JSON.parse(c.styleIds);
            return ids.includes(styleFilter);
          } catch {}
        }
        return false;
      });
    }

    // Get location names
    const locationIds = [...new Set(filtered.map((c) => c.locationId).filter(Boolean) as string[])];
    const locations =
      locationIds.length > 0
        ? await prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, name: true },
          })
        : [];
    const locMap = new Map(locations.map((l) => [l.id, l.name]));

    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 90);

    const events: string[] = [];

    for (const cls of filtered) {
      const classStart = new Date(cls.startsAt);
      const classEnd = new Date(cls.endsAt);
      const durationMs = classEnd.getTime() - classStart.getTime();

      // Parse excluded dates
      let excluded: string[] = [];
      if (cls.excludedDates) {
        try {
          excluded = JSON.parse(cls.excludedDates);
        } catch {}
      }

      const styleLabel =
        cls.styleName ||
        (() => {
          if (cls.styleNames) {
            try {
              return JSON.parse(cls.styleNames).join(", ");
            } catch {}
          }
          return "";
        })();
      const locationName = cls.locationId ? locMap.get(cls.locationId) || "" : "";

      if (!cls.isRecurring) {
        // Non-recurring: single event
        if (classStart >= now && classStart <= rangeEnd) {
          events.push(
            buildVEvent(cls.id, cls.name, classStart, durationMs, cls.coachName, styleLabel, locationName, cls.classType)
          );
        }
      } else {
        // Expand recurring instances for the next 90 days
        const scheduleStart = cls.scheduleStartDate ? new Date(cls.scheduleStartDate) : classStart;
        const scheduleEnd =
          cls.isOngoing || !cls.scheduleEndDate
            ? rangeEnd
            : new Date(cls.scheduleEndDate) < rangeEnd
              ? new Date(cls.scheduleEndDate)
              : rangeEnd;

        const classDow = classStart.getDay();
        const freq = cls.frequencyNumber || 1;

        // Iterate day by day from max(now, scheduleStart) to min(rangeEnd, scheduleEnd)
        const iterStart = new Date(Math.max(now.getTime(), scheduleStart.getTime()));
        iterStart.setHours(0, 0, 0, 0);

        for (let d = new Date(iterStart); d <= scheduleEnd; d.setDate(d.getDate() + 1)) {
          if (d.getDay() !== classDow) continue;

          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (excluded.includes(dateStr)) continue;

          // Check frequency interval
          if (cls.frequencyUnit === "Week") {
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;
            const weeksDiff = Math.floor((d.getTime() - scheduleStart.getTime()) / msPerWeek);
            if (weeksDiff % freq !== 0) continue;
          } else if (cls.frequencyUnit === "Day") {
            const msPerDay = 24 * 60 * 60 * 1000;
            const daysDiff = Math.floor((d.getTime() - scheduleStart.getTime()) / msPerDay);
            if (daysDiff % freq !== 0) continue;
          }

          // Create event instance
          const instanceStart = new Date(d);
          instanceStart.setHours(classStart.getHours(), classStart.getMinutes(), 0, 0);

          events.push(
            buildVEvent(
              `${cls.id}-${dateStr}`,
              cls.name,
              instanceStart,
              durationMs,
              cls.coachName,
              styleLabel,
              locationName,
              cls.classType
            )
          );
        }
      }
    }

    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MartialArtsMS//ClassSchedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Class Schedule",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");

    return new NextResponse(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="class-schedule.ics"',
      },
    });
  } catch (err) {
    console.error("GET /api/calendar/export error:", err);
    return NextResponse.json({ error: "Failed to export calendar" }, { status: 500 });
  }
}

function formatICalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildVEvent(
  uid: string,
  name: string,
  start: Date,
  durationMs: number,
  coach: string | null,
  style: string,
  location: string,
  classType: string | null
): string {
  const end = new Date(start.getTime() + durationMs);
  const descParts: string[] = [];
  if (style) descParts.push(`Style: ${style}`);
  if (classType) descParts.push(`Type: ${classType}`);
  if (coach) descParts.push(`Coach: ${coach}`);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}@martialarts-ms`,
    `DTSTART:${formatICalDate(start)}`,
    `DTEND:${formatICalDate(end)}`,
    `SUMMARY:${escapeICalText(name)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeICalText(location)}`);
  if (descParts.length > 0) lines.push(`DESCRIPTION:${escapeICalText(descParts.join(" | "))}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}
