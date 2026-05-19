import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendClassReminderEmail } from "@/lib/notifications";

// GET/POST /api/cron/class-reminders
// Runs daily (via Vercel cron). For each ClassBooking with status=CONFIRMED
// whose class starts within the next 24 hours and that hasn't already been
// reminded, send the class_reminder email and stamp reminderSentAt.
export async function GET() {
  return handle();
}
export async function POST() {
  return handle();
}

async function handle() {
  const now = new Date();
  const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Pull confirmed, un-reminded bookings whose class starts in the next 24h.
  const bookings = await prisma.classBooking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      classSession: {
        startsAt: { gte: now, lte: twentyFourHoursLater },
      },
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      classSession: { select: { name: true, startsAt: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const b of bookings) {
    try {
      const classDate = b.classSession.startsAt.toLocaleDateString();
      const classTime = b.classSession.startsAt.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });

      await sendClassReminderEmail({
        memberId: b.member.id,
        memberName: `${b.member.firstName} ${b.member.lastName}`.trim(),
        className: b.classSession.name,
        classDate,
        classTime,
      });

      await prisma.classBooking.update({
        where: { id: b.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error("[class-reminders] failed for booking", b.id, err);
      failed++;
    }
  }

  return NextResponse.json({
    checked: bookings.length,
    sent,
    failed,
  });
}
