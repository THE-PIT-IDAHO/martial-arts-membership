import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendInactiveReengagementEmail } from "@/lib/notifications";

// GET/POST /api/cron/inactive-reengagement
// Weekly sweep. For each ACTIVE member whose most recent confirmed attendance
// was 30+ days ago, send a "we miss you" email — unless we've already sent
// one in the last 60 days (to avoid pestering).
const INACTIVE_THRESHOLD_DAYS = 30;
const RESEND_COOLDOWN_DAYS = 60;

export async function GET() {
  return handle();
}
export async function POST() {
  return handle();
}

async function handle() {
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const cooldownDate = new Date(now.getTime() - RESEND_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  // Active members with an email address.
  const members = await prisma.member.findMany({
    where: {
      status: { contains: "ACTIVE" },
      NOT: { status: { contains: "INACTIVE" } },
      email: { not: null },
      emailOptIn: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      attendances: {
        where: { confirmed: true },
        orderBy: { checkedInAt: "desc" },
        take: 1,
        select: { checkedInAt: true },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of members) {
    const lastAttendance = m.attendances[0]?.checkedInAt;
    // Skip members who have never attended — they get a different (future)
    // onboarding nudge, not a "we miss you".
    if (!lastAttendance) continue;
    if (lastAttendance > thresholdDate) continue; // attended recently

    // Cooldown: skip if we sent a re-engagement email in the last 60 days.
    const recentReengagement = await prisma.emailLog.findFirst({
      where: {
        memberId: m.id,
        eventType: "INACTIVE_REENGAGEMENT",
        success: true,
        createdAt: { gte: cooldownDate },
      },
      select: { id: true },
    });
    if (recentReengagement) {
      skipped++;
      continue;
    }

    const daysSince = Math.floor(
      (now.getTime() - lastAttendance.getTime()) / (24 * 60 * 60 * 1000)
    );

    try {
      await sendInactiveReengagementEmail({
        memberId: m.id,
        memberName: `${m.firstName} ${m.lastName}`.trim(),
        daysSinceLastClass: daysSince,
      });
      sent++;
    } catch (err) {
      console.error("[inactive-reengagement] failed for member", m.id, err);
      failed++;
    }
  }

  return NextResponse.json({
    checked: members.length,
    sent,
    skipped,
    failed,
  });
}
