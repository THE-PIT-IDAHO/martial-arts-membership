import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBirthdayEmail } from "@/lib/notifications";

// GET/POST /api/cron/birthdays
// Runs daily. For each Member whose DOB month/day matches today, send the
// birthday email — unless we've already sent one this calendar year (checked
// via EmailLog).
export async function GET() {
  return handle();
}
export async function POST() {
  return handle();
}

async function handle() {
  const today = new Date();
  const todayMonth = today.getMonth() + 1; // 1-12
  const todayDay = today.getDate();
  const yearStart = new Date(today.getFullYear(), 0, 1);

  // Postgres-friendly: pull all members with a DOB and filter in JS.
  // For thousands of members this could become a problem; for typical gym
  // size (~500), this is one cheap scan per day.
  const members = await prisma.member.findMany({
    where: {
      dateOfBirth: { not: null },
      status: { contains: "ACTIVE" },
      NOT: { status: { contains: "INACTIVE" } },
      emailOptIn: true,
      email: { not: null },
    },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
  });

  const todays = members.filter((m) => {
    if (!m.dateOfBirth) return false;
    const dob = new Date(m.dateOfBirth);
    return dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay;
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of todays) {
    try {
      // Dedup: skip if we've already sent a BIRTHDAY this year.
      const alreadySent = await prisma.emailLog.findFirst({
        where: {
          memberId: m.id,
          eventType: "BIRTHDAY",
          success: true,
          createdAt: { gte: yearStart },
        },
        select: { id: true },
      });
      if (alreadySent) {
        skipped++;
        continue;
      }

      await sendBirthdayEmail({
        memberId: m.id,
        memberName: `${m.firstName} ${m.lastName}`.trim(),
      });
      sent++;
    } catch (err) {
      console.error("[birthdays] failed for member", m.id, err);
      failed++;
    }
  }

  return NextResponse.json({
    todays: todays.length,
    sent,
    skipped,
    failed,
  });
}
