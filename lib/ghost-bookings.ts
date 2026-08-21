import { prisma } from "@/lib/prisma";
import { formatDateInTimezone, getGymTimezone } from "@/lib/dates";
import { classRunsOnDate } from "@/lib/class-occurrence";

/**
 * Delete ClassBooking rows whose ClassSession no longer runs on the
 * bookingDate. Usually caused by a schedule edit AFTER the booking
 * was made (e.g. class moved from Fri 7pm to Thu 7pm; old Friday
 * bookings become orphans).
 *
 * Uses the shared classRunsOnDate() check so this stays in lock-step
 * with the portal-side display filter -- anything the portal hides,
 * this deletes. Timezone-aware: day-of-week comparisons happen in the
 * gym's local time, which matters because Vercel runs UTC and an
 * evening-Idaho class stored as next-day UTC otherwise looks like a
 * different weekday.
 *
 * Only deletes FUTURE bookings (>= today). Past rows stay as history.
 * Scoping options:
 *   - classSessionId: narrow to bookings on one class (used by the
 *     PATCH-time hook after that class's schedule changes)
 *   - clientId: narrow to one tenant (used by the admin cleanup
 *     endpoint so an operator only cleans their own gym)
 */
export async function cleanupGhostBookings(
  opts: { clientId?: string; classSessionId?: string } = {},
): Promise<{ deleted: number; inspected: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookings = await prisma.classBooking.findMany({
    where: {
      bookingDate: { gte: today },
      status: { in: ["CONFIRMED", "WAITLISTED"] },
      ...(opts.classSessionId ? { classSessionId: opts.classSessionId } : {}),
      ...(opts.clientId ? { member: { clientId: opts.clientId } } : {}),
    },
    include: {
      classSession: {
        select: {
          startsAt: true,
          isRecurring: true,
          excludedDates: true,
          scheduleStartDate: true,
          scheduleEndDate: true,
          isOngoing: true,
          frequencyNumber: true,
          frequencyUnit: true,
          classType: true,
          clientId: true,
        },
      },
    },
  });

  const tzByClient = new Map<string, string>();
  const getTz = async (clientId: string) => {
    let tz = tzByClient.get(clientId);
    if (!tz) {
      tz = await getGymTimezone(clientId);
      tzByClient.set(clientId, tz);
    }
    return tz;
  };

  const toDelete: string[] = [];
  for (const b of bookings) {
    const cls = b.classSession;
    if (!cls) {
      // Orphan: class was deleted outright. Kill the booking too.
      toDelete.push(b.id);
      continue;
    }
    const tz = await getTz(cls.clientId);
    const localYmd = formatDateInTimezone(b.bookingDate, tz);
    if (!classRunsOnDate(cls, localYmd, tz)) toDelete.push(b.id);
  }

  if (toDelete.length === 0) return { deleted: 0, inspected: bookings.length };
  const result = await prisma.classBooking.deleteMany({ where: { id: { in: toDelete } } });
  return { deleted: result.count, inspected: bookings.length };
}
