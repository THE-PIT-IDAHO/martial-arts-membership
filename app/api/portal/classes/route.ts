import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// Match admin calendar's toLocalDateStr helper
function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  // Client's UTC offset in minutes west of UTC (Date.prototype.getTimezoneOffset).
  // Needed because the server runs in UTC and JS Date.getDay() on a stored
  // timestamp returns the UTC day, not the gym's local day.
  const tzOffsetMin = parseInt(searchParams.get("tzOffset") || "0", 10) || 0;

  // Helper: get the day-of-week (0-6) of a UTC timestamp in the client's local TZ
  function getLocalDay(utc: Date): number {
    return new Date(utc.getTime() - tzOffsetMin * 60 * 1000).getUTCDay();
  }

  // Default to today — use "T00:00:00" to force local time parsing (not UTC)
  const targetDate = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  // The day bounds for SQL filtering need to be in the CLIENT's local day, not
  // the server's. On Vercel the server runs in UTC, so a class at 7pm Mountain
  // (stored as next-day 01:00 UTC) would be excluded from a UTC-day SQL range.
  // We compute client-local-midnight as a UTC timestamp by offsetting from
  // server-local-midnight by tzOffsetMin.
  const targetDateLocalMidnightMs = targetDate.getTime() + tzOffsetMin * 60 * 1000;
  const dayStart = new Date(targetDateLocalMidnightMs);
  const dayEnd = new Date(targetDateLocalMidnightMs + 24 * 60 * 60 * 1000 - 1);

  // Get all classes (show schedule regardless of bookingEnabled)
  const classes = await prisma.classSession.findMany({
    where: {
      OR: [
        // One-time classes on this date
        {
          isRecurring: false,
          startsAt: { gte: dayStart, lte: dayEnd },
        },
        // Recurring classes that overlap this date
        {
          isRecurring: true,
          scheduleStartDate: { lte: dayEnd },
          OR: [
            { scheduleEndDate: null },
            { scheduleEndDate: { gte: dayStart } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      classType: true,
      styleNames: true,
      styleName: true,
      coachName: true,
      maxCapacity: true,
      bookingEnabled: true,
      bookingCutoffMins: true,
      bookingAdvanceDays: true,
      isRecurring: true,
      isOngoing: true,
      frequencyNumber: true,
      frequencyUnit: true,
      scheduleStartDate: true,
      scheduleEndDate: true,
      excludedDates: true,
      minRankName: true,
    },
  });

  // Filter classes using the same logic as admin calendar's getClassesForDate
  const targetDateStr = toLocalDateStr(targetDate);

  const filteredClasses = classes.filter((cls) => {
    // Skip "Imported" class types — match admin calendar behavior
    if (cls.classType === "Imported") return false;

    // Check excluded dates
    if (cls.excludedDates) {
      try {
        const excluded = JSON.parse(cls.excludedDates) as string[];
        if (excluded.includes(targetDateStr)) return false;
      } catch { /* ignore */ }
    }

    // Non-recurring classes already filtered by SQL date range
    if (!cls.isRecurring) return true;

    // --- Recurring logic matches admin calendar exactly ---

    // Day of week must match. Use the client's local day for the class timestamp
    // so a class scheduled "Mon 6pm MT" (stored as Tue 01:00 UTC) is treated as
    // Monday rather than Tuesday.
    const classStartsAt = new Date(cls.startsAt);
    const classDayOfWeek = getLocalDay(classStartsAt);
    const dateDayOfWeek = targetDate.getDay();
    if (classDayOfWeek !== dateDayOfWeek) return false;

    // Must have scheduleStartDate (admin returns false without it)
    if (!cls.scheduleStartDate) return false;

    const scheduleStart = new Date(cls.scheduleStartDate);
    scheduleStart.setHours(0, 0, 0, 0);

    const scheduleEnd = cls.isOngoing || !cls.scheduleEndDate
      ? new Date(2099, 11, 31)
      : new Date(cls.scheduleEndDate);
    scheduleEnd.setHours(23, 59, 59, 999);

    // Use midpoint of target day for bounds check (matches admin)
    const checkDate = new Date(targetDate);
    checkDate.setHours(12, 0, 0, 0);

    if (checkDate < scheduleStart || checkDate > scheduleEnd) return false;

    // Check frequency interval
    const unit = cls.frequencyUnit || "Week";
    if (unit === "Week" || unit === "week") {
      const weeksDiff = Math.floor(
        (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24 * 7)
      );
      return weeksDiff % (cls.frequencyNumber || 1) === 0;
    } else if (unit === "Day" || unit === "day") {
      const daysDiff = Math.floor(
        (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysDiff % (cls.frequencyNumber || 1) === 0;
    }

    return false;
  });

  // Hide classes whose start time has already passed (today only).
  // "Today" is determined in the client's local timezone, not the server's.
  const now = new Date();
  // Client's local YYYY-MM-DD for "now":
  const nowLocalMs = now.getTime() - tzOffsetMin * 60 * 1000;
  const nowLocal = new Date(nowLocalMs);
  const nowLocalDateStr = `${nowLocal.getUTCFullYear()}-${String(nowLocal.getUTCMonth() + 1).padStart(2, "0")}-${String(nowLocal.getUTCDate()).padStart(2, "0")}`;
  const isToday = nowLocalDateStr === targetDateStr;

  const visibleClasses = isToday
    ? filteredClasses.filter((cls) => {
        // Class's time-of-day in the CLIENT's local timezone (extract from
        // the stored UTC startsAt by applying tzOffset).
        const classLocalMs = new Date(cls.startsAt).getTime() - tzOffsetMin * 60 * 1000;
        const classLocal = new Date(classLocalMs);
        const localHour = classLocal.getUTCHours();
        const localMinute = classLocal.getUTCMinutes();
        // Build "today at that local hour:minute" as a UTC timestamp:
        //   client-local midnight (in UTC) + the local time-of-day
        const occurrenceUtcMs = targetDateLocalMidnightMs + (localHour * 60 + localMinute) * 60 * 1000;
        return now.getTime() < occurrenceUtcMs;
      })
    : filteredClasses;

  // Get booking counts for the target date
  const bookingDateStart = new Date(dayStart);
  const bookingDateEnd = new Date(dayEnd);

  const bookingCounts = await prisma.classBooking.groupBy({
    by: ["classSessionId"],
    where: {
      classSessionId: { in: visibleClasses.map((c) => c.id) },
      bookingDate: { gte: bookingDateStart, lte: bookingDateEnd },
      status: "CONFIRMED",
    },
    _count: true,
  });

  const countMap = new Map(bookingCounts.map((b) => [b.classSessionId, b._count]));

  // Check member's existing bookings for this date
  const memberBookings = await prisma.classBooking.findMany({
    where: {
      memberId: auth.memberId,
      bookingDate: { gte: bookingDateStart, lte: bookingDateEnd },
      status: { in: ["CONFIRMED", "WAITLISTED"] },
    },
    select: { classSessionId: true, status: true, id: true },
  });

  const memberBookingMap = new Map(
    memberBookings.map((b) => [b.classSessionId, { status: b.status, id: b.id }])
  );

  const result = visibleClasses.map((cls) => {
    const confirmedCount = countMap.get(cls.id) || 0;
    const memberBooking = memberBookingMap.get(cls.id);

    return {
      id: cls.id,
      name: cls.name,
      startsAt: cls.startsAt,
      endsAt: cls.endsAt,
      style: cls.styleNames || cls.styleName || null,
      coach: cls.coachName || null,
      maxCapacity: cls.maxCapacity,
      bookingEnabled: cls.bookingEnabled,
      confirmedCount,
      spotsLeft: cls.maxCapacity ? cls.maxCapacity - confirmedCount : null,
      isFull: cls.maxCapacity ? confirmedCount >= cls.maxCapacity : false,
      bookingCutoffMins: cls.bookingCutoffMins,
      bookingAdvanceDays: cls.bookingAdvanceDays,
      minRankName: cls.minRankName,
      memberBooking: memberBooking || null,
    };
  });

  // Sort by start time
  result.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return NextResponse.json(result);
}
