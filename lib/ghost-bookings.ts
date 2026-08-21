import { prisma } from "@/lib/prisma";

/**
 * Delete ClassBooking rows whose ClassSession no longer runs on the
 * bookingDate. Usually caused by a schedule edit AFTER the booking
 * was made (e.g. class moved from Fri 7pm to Thu 7pm; old Friday
 * bookings become orphans).
 *
 * Rules mirror the portal-side display filter in /api/portal/bookings:
 *   - One-off classes: bookingDate must match the class start date
 *   - Recurring: same day-of-week as the template
 *   - Recurring: bookingDate within scheduleStartDate/scheduleEndDate
 *   - Recurring: bookingDate not in the excludedDates JSON
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
        },
      },
    },
  });

  const toDelete: string[] = [];
  for (const b of bookings) {
    const cls = b.classSession;
    if (!cls) {
      // Orphan: class was deleted outright. Kill the booking too.
      toDelete.push(b.id);
      continue;
    }
    const booking = new Date(b.bookingDate);
    const start = new Date(cls.startsAt);

    let valid = true;
    if (!cls.isRecurring) {
      valid =
        booking.getFullYear() === start.getFullYear() &&
        booking.getMonth() === start.getMonth() &&
        booking.getDate() === start.getDate();
    } else {
      if (booking.getDay() !== start.getDay()) valid = false;
      if (valid && cls.scheduleStartDate) {
        const s = new Date(cls.scheduleStartDate);
        s.setHours(0, 0, 0, 0);
        if (booking < s) valid = false;
      }
      if (valid && cls.scheduleEndDate && !cls.isOngoing) {
        const e = new Date(cls.scheduleEndDate);
        e.setHours(23, 59, 59, 999);
        if (booking > e) valid = false;
      }
      if (valid && cls.excludedDates) {
        try {
          const ex: string[] = JSON.parse(cls.excludedDates);
          const ymd = `${booking.getFullYear()}-${String(booking.getMonth() + 1).padStart(2, "0")}-${String(booking.getDate()).padStart(2, "0")}`;
          if (ex.includes(ymd)) valid = false;
        } catch {
          /* malformed excludedDates: assume no exclusions */
        }
      }
    }
    if (!valid) toDelete.push(b.id);
  }

  if (toDelete.length === 0) return { deleted: 0, inspected: bookings.length };
  const result = await prisma.classBooking.deleteMany({ where: { id: { in: toDelete } } });
  return { deleted: result.count, inspected: bookings.length };
}
