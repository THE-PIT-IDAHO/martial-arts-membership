// GET/POST /api/cron/coach-auto-attendance
//
// Runs hourly. For every ClassSession with coachAttendsAsStudent=true and a
// coachId set, this confirms (or creates) the coach's Attendance row for any
// recent occurrence whose start time has passed.
//
// Covers the case where the roster was never opened in the admin UI —
// without this cron, the coach would lose credit unless someone manually
// visited the class roster after it ended. We still also do lazy create on
// roster fetch (see /api/attendance GET); this is the safety net.
//
// Recurring classes: we walk back through the last LOOKBACK_HOURS of
// occurrences (using the template's day-of-week and startsAt time). One-off
// classes: just check the single date.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGymTimezone, localMidnightUtc } from "@/lib/dates";

const LOOKBACK_HOURS = 6; // Hourly cron + small buffer for clock skew.

export async function GET() { return handle(); }
export async function POST() { return handle(); }

async function handle() {
  const now = Date.now();
  const lookbackStart = now - LOOKBACK_HOURS * 60 * 60 * 1000;

  // Pull all classes that opt in, scoped per-tenant via the clientId column.
  const sessions = await prisma.classSession.findMany({
    where: {
      coachAttendsAsStudent: true,
      coachId: { not: null },
      // Active classes only: ongoing OR within the schedule window.
      OR: [
        { isOngoing: true },
        { scheduleEndDate: null },
        { scheduleEndDate: { gte: new Date(lookbackStart) } },
      ],
    },
    select: {
      id: true,
      coachId: true,
      clientId: true,
      startsAt: true,
      isRecurring: true,
      scheduleStartDate: true,
      scheduleEndDate: true,
      excludedDates: true,
    },
  });

  // Cache the resolved timezone per tenant to avoid repeated DB hits.
  const tzCache = new Map<string, string>();
  async function tzFor(clientId: string): Promise<string> {
    const cached = tzCache.get(clientId);
    if (cached) return cached;
    const tz = await getGymTimezone(clientId);
    tzCache.set(clientId, tz);
    return tz;
  }

  // Coach member check cache (memberId → exists).
  const memberCache = new Map<string, boolean>();
  async function coachIsMember(coachId: string): Promise<boolean> {
    const cached = memberCache.get(coachId);
    if (cached !== undefined) return cached;
    const m = await prisma.member.findUnique({
      where: { id: coachId }, select: { id: true },
    });
    const exists = !!m;
    memberCache.set(coachId, exists);
    return exists;
  }

  let created = 0;
  let confirmed = 0;
  let skipped = 0;

  for (const s of sessions) {
    if (!s.coachId) continue;
    if (!(await coachIsMember(s.coachId))) { skipped++; continue; }

    const tz = await tzFor(s.clientId);
    const occurrenceDates = computeOccurrenceDates({
      session: s, lookbackStart: new Date(lookbackStart), now: new Date(now),
    });

    let excluded: Set<string> = new Set();
    if (s.excludedDates) {
      try {
        const arr = JSON.parse(s.excludedDates);
        if (Array.isArray(arr)) excluded = new Set(arr.map(String));
      } catch { /* ignore */ }
    }

    for (const occ of occurrenceDates) {
      const dateStr = formatLocalDate(occ);
      if (excluded.has(dateStr)) continue;

      // Anchor at gym-local midnight, same way the UI/POST does.
      const dayStart = new Date(localMidnightUtc(dateStr, tz));
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

      const existing = await prisma.attendance.findFirst({
        where: {
          memberId: s.coachId,
          classSessionId: s.id,
          attendanceDate: { gte: dayStart, lte: dayEnd },
        },
        select: { id: true, confirmed: true },
      });

      if (!existing) {
        await prisma.attendance.create({
          data: {
            memberId: s.coachId,
            classSessionId: s.id,
            attendanceDate: dayStart,
            source: "MANUAL",
            confirmed: true,
            requirementOverride: true,
          },
        }).catch(() => { /* ignore unique-race */ });
        created++;
      } else if (!existing.confirmed) {
        await prisma.attendance.update({
          where: { id: existing.id }, data: { confirmed: true },
        }).catch(() => { /* ignore */ });
        confirmed++;
      }
    }
  }

  return NextResponse.json({ ok: true, sessionsChecked: sessions.length, created, confirmed, skipped });
}

/** Returns occurrence start-times for a session within [lookbackStart, now]. */
function computeOccurrenceDates(opts: {
  session: {
    startsAt: Date;
    isRecurring: boolean;
    scheduleStartDate: Date | null;
    scheduleEndDate: Date | null;
  };
  lookbackStart: Date;
  now: Date;
}): Date[] {
  const { session, lookbackStart, now } = opts;
  // One-off: include if the single occurrence falls in window.
  if (!session.isRecurring) {
    if (session.startsAt >= lookbackStart && session.startsAt <= now) {
      return [session.startsAt];
    }
    return [];
  }

  // Recurring weekly (we only support weekly): same day-of-week as startsAt,
  // same time-of-day. Walk every day in the lookback window and emit a
  // datetime when day-of-week matches.
  const dow = session.startsAt.getUTCDay();
  const hour = session.startsAt.getUTCHours();
  const min = session.startsAt.getUTCMinutes();

  const out: Date[] = [];
  // Start at the day of `lookbackStart`, walk forward.
  const cursor = new Date(lookbackStart.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= now.getTime()) {
    if (cursor.getUTCDay() === dow) {
      const candidate = new Date(cursor.getTime());
      candidate.setUTCHours(hour, min, 0, 0);
      if (candidate >= lookbackStart && candidate <= now) {
        const inWindow =
          (!session.scheduleStartDate || candidate >= session.scheduleStartDate) &&
          (!session.scheduleEndDate || candidate <= session.scheduleEndDate);
        if (inWindow) out.push(candidate);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function formatLocalDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
