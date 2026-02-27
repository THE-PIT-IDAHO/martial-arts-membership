import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendClassReminderEmail } from "@/lib/notifications";
import { formatInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

// POST /api/notifications/class-reminder
// Sends reminder emails for classes happening within the next N hours.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const hoursAhead = body.hoursAhead || 24;

    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Find upcoming non-recurring classes in the window
    const upcomingClasses = await prisma.classSession.findMany({
      where: {
        startsAt: { gte: now, lte: cutoff },
      },
      select: {
        id: true,
        name: true,
        startsAt: true,
        isRecurring: true,
      },
    });

    if (upcomingClasses.length === 0) {
      return NextResponse.json({ sent: 0, message: "No upcoming classes in window" });
    }

    // Get all active members with email
    const activeMembers = await prisma.member.findMany({
      where: {
        status: "ACTIVE",
        emailOptIn: true,
        email: { not: null },
      },
      select: { id: true, firstName: true, lastName: true },
    });

    const tz = (await getSetting("timezone")) || "America/Denver";

    let sent = 0;
    for (const cls of upcomingClasses) {
      const classDate = formatInTimezone(cls.startsAt, tz, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const classTime = formatInTimezone(cls.startsAt, tz, {
        hour: "numeric",
        minute: "2-digit",
      });

      for (const member of activeMembers) {
        sendClassReminderEmail({
          memberId: member.id,
          memberName: `${member.firstName} ${member.lastName}`,
          className: cls.name,
          classDate,
          classTime,
        }).catch(() => {});
        sent++;
      }
    }

    return NextResponse.json({ sent, classes: upcomingClasses.length, members: activeMembers.length });
  } catch (error) {
    console.error("Error sending class reminders:", error);
    return new NextResponse("Failed to send class reminders", { status: 500 });
  }
}
