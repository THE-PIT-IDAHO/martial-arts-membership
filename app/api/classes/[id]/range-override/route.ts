import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { formatDateInTimezone, getGymTimezone, localMidnightUtc } from "@/lib/dates";
import { classRunsOnDate } from "@/lib/class-occurrence";

type Params = {
  params: Promise<{ id: string }>;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{1,2}:\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const toInt = (v: unknown) => (v != null && v !== "" ? parseInt(String(v)) || null : null);

/**
 * POST /api/classes/:id/range-override
 *
 * Temporary change to a recurring class for a date range. The original
 * class is left exactly as it is and skips those dates; a copy carrying
 * the changes runs only inside the range. After the end date the
 * original simply carries on, so the class "goes back" on its own.
 *
 * Bookings and attendance already on the original for those dates move
 * to the copy so nobody loses a spot.
 *
 * Body: { startDate, endDate (YYYY-MM-DD), startTime, endTime (HH:MM),
 *         ...the same class fields the edit form sends }
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { startDate, endDate, startTime, endTime } = body || {};

    if (!YMD.test(startDate || "") || !YMD.test(endDate || "") || startDate > endDate) {
      return NextResponse.json({ error: "Pick a valid start and end date" }, { status: 400 });
    }
    if (!HM.test(startTime || "") || !HM.test(endTime || "")) {
      return NextResponse.json({ error: "Set a start and end time" }, { status: 400 });
    }

    const original = await prisma.classSession.findUnique({ where: { id } });
    if (!original || original.clientId !== clientId) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }
    if (!original.isRecurring) {
      return NextResponse.json({ error: "Only repeating classes can be changed for a date range" }, { status: 400 });
    }

    const tz = await getGymTimezone(clientId);

    // Every date in the range the original actually runs on.
    const dates: string[] = [];
    const endMs = localMidnightUtc(endDate, tz);
    for (let ms = localMidnightUtc(startDate, tz); ms <= endMs + 1000; ms += DAY_MS) {
      const ymd = formatDateInTimezone(new Date(ms + 12 * 60 * 60 * 1000), tz);
      if (ymd > endDate) break;
      if (!dates.includes(ymd) && classRunsOnDate(original, ymd, tz)) dates.push(ymd);
    }
    if (dates.length === 0) {
      return NextResponse.json({ error: "This class doesn't run on any day in that range" }, { status: 400 });
    }

    const first = dates[0];
    const at = (ymd: string, hm: string) => {
      const [h, m] = hm.split(":").map(Number);
      return new Date(localMidnightUtc(ymd, tz) + h * 3600000 + m * 60000);
    };
    // Schedule window dates stored at local noon so they read as the
    // right calendar day in any timezone.
    const noon = (ymd: string) => new Date(localMidnightUtc(ymd, tz) + 12 * 3600000);

    const has = (k: string) => body[k] !== undefined;
    const pick = <T,>(k: string, fallback: T, map?: (v: unknown) => T): T =>
      has(k) ? (map ? map(body[k]) : (body[k] as T)) : fallback;

    const {
      id: _id, excludedDates: _ex, startsAt: _s, endsAt: _e,
      scheduleStartDate: _ss, scheduleEndDate: _se, isOngoing: _o, ...base
    } = original;

    const result = await prisma.$transaction(async (tx) => {
      const copy = await tx.classSession.create({
        data: {
          ...base,
          name: pick("name", original.name),
          classType: pick("classType", original.classType),
          classTypes: pick("classTypes", original.classTypes),
          styleIds: pick("styleIds", original.styleIds),
          styleNames: pick("styleNames", original.styleNames),
          styleId: pick("styleId", original.styleId),
          styleName: pick("styleName", original.styleName),
          minRankId: pick("minRankId", original.minRankId),
          minRankIds: pick("minRankIds", original.minRankIds),
          coachId: pick("coachId", original.coachId),
          coachName: pick("coachName", original.coachName),
          bookingEnabled: pick("bookingEnabled", original.bookingEnabled, (v) => !!v),
          kioskEnabled: pick("kioskEnabled", original.kioskEnabled, (v) => !!v),
          maxCapacity: pick("maxCapacity", original.maxCapacity, toInt),
          bookingCutoffMins: pick("bookingCutoffMins", original.bookingCutoffMins, toInt),
          bookingAdvanceDays: pick("bookingAdvanceDays", original.bookingAdvanceDays, toInt),
          locationId: pick("locationId", original.locationId, (v) => (v as string) || null),
          spaceId: pick("spaceId", original.spaceId, (v) => (v as string) || null),
          startsAt: at(first, startTime),
          endsAt: at(first, endTime),
          isRecurring: true,
          scheduleStartDate: noon(first),
          scheduleEndDate: noon(endDate),
          isOngoing: false,
          excludedDates: null,
        },
      });

      // Move bookings + attendance on those dates over to the copy.
      const dateSet = new Set(dates);
      const lo = new Date(localMidnightUtc(first, tz) - DAY_MS);
      const hi = new Date(endMs + 2 * DAY_MS);
      const bookings = await tx.classBooking.findMany({
        where: { classSessionId: id, bookingDate: { gte: lo, lt: hi } },
        select: { id: true, bookingDate: true },
      });
      const bookingIds = bookings.filter((b) => dateSet.has(formatDateInTimezone(b.bookingDate, tz))).map((b) => b.id);
      if (bookingIds.length > 0) {
        await tx.classBooking.updateMany({ where: { id: { in: bookingIds } }, data: { classSessionId: copy.id } });
      }
      const attendance = await tx.attendance.findMany({
        where: { classSessionId: id, attendanceDate: { gte: lo, lt: hi } },
        select: { id: true, attendanceDate: true },
      });
      const attendanceIds = attendance.filter((a) => dateSet.has(formatDateInTimezone(a.attendanceDate, tz))).map((a) => a.id);
      if (attendanceIds.length > 0) {
        await tx.attendance.updateMany({ where: { id: { in: attendanceIds } }, data: { classSessionId: copy.id } });
      }

      // The original skips those dates; everything else about it is untouched.
      let excluded: string[] = [];
      try { excluded = original.excludedDates ? JSON.parse(original.excludedDates) : []; } catch { excluded = []; }
      for (const d of dates) if (!excluded.includes(d)) excluded.push(d);
      await tx.classSession.update({ where: { id }, data: { excludedDates: JSON.stringify(excluded) } });

      return { copyId: copy.id, movedBookings: bookingIds.length, movedAttendance: attendanceIds.length };
    });

    return NextResponse.json({ ...result, dates });
  } catch (err) {
    console.error(`POST /api/classes/${id}/range-override error:`, err);
    return NextResponse.json({ error: "Failed to change the class for that range" }, { status: 500 });
  }
}
