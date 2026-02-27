import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendBirthdayEmail,
  sendInactiveReengagementEmail,
  sendRenewalReminderEmail,
  sendTrialExpiringEmail,
} from "@/lib/notifications";
import { getTodayInTimezone, formatDateInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";
import { getClientId } from "@/lib/tenant";

export async function POST(req: Request) {
  const tz = (await getSetting("timezone")) || "America/Denver";
  const today = getTodayInTimezone(tz);

  // Check if already run today
  const lastRun = await prisma.settings.findFirst({
    where: { key: "lifecycle_last_auto_run" },
  });
  if (lastRun?.value === today) {
    return NextResponse.json({ skipped: true, reason: "Already run today" });
  }

  let birthdaysSent = 0;
  let inactiveSent = 0;
  let renewalsSent = 0;
  let trialsSent = 0;

  // --- 1. Birthday Emails ---
  try {
    const todayMonth = new Date().getMonth() + 1;
    const todayDay = new Date().getDate();

    const membersWithDOB = await prisma.member.findMany({
      where: { status: { contains: "ACTIVE" }, dateOfBirth: { not: null } },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
    });

    for (const m of membersWithDOB) {
      if (!m.dateOfBirth) continue;
      const dob = new Date(m.dateOfBirth);
      if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
        sendBirthdayEmail({
          memberId: m.id,
          memberName: `${m.firstName} ${m.lastName}`,
        }).catch(() => {});
        birthdaysSent++;
      }
    }
  } catch (err) {
    console.error("Birthday email error:", err);
  }

  // --- 2. Inactive Re-engagement ---
  try {
    const thresholdSetting = await prisma.settings.findFirst({
      where: { key: "inactive_threshold_days" },
    });
    const thresholdDays = thresholdSetting ? parseInt(thresholdSetting.value) || 30 : 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    // Find active members
    const activeMembers = await prisma.member.findMany({
      where: { status: { contains: "ACTIVE" } },
      select: { id: true, firstName: true, lastName: true },
    });

    for (const m of activeMembers) {
      // Check last attendance
      const lastAttendance = await prisma.attendance.findFirst({
        where: { memberId: m.id },
        orderBy: { attendanceDate: "desc" },
        select: { attendanceDate: true },
      });

      if (lastAttendance && lastAttendance.attendanceDate < cutoffDate) {
        const daysSince = Math.floor(
          (Date.now() - lastAttendance.attendanceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        // Only send once per 30-day period (check if divisible by threshold)
        if (daysSince % thresholdDays < 1) {
          sendInactiveReengagementEmail({
            memberId: m.id,
            memberName: `${m.firstName} ${m.lastName}`,
            daysSinceLastClass: daysSince,
          }).catch(() => {});
          inactiveSent++;
        }
      }
    }
  } catch (err) {
    console.error("Inactive re-engagement error:", err);
  }

  // --- 3. Renewal Reminders (7, 14, 30 days before expiry) ---
  try {
    const reminderDays = [7, 14, 30];
    for (const days of reminderDays) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      const targetStr = formatDateInTimezone(targetDate, tz);

      const expiringMemberships = await prisma.membership.findMany({
        where: {
          status: "ACTIVE",
          endDate: {
            gte: new Date(targetStr + "T00:00:00"),
            lt: new Date(targetStr + "T23:59:59"),
          },
        },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
          membershipPlan: { select: { name: true, autoRenew: true } },
        },
      });

      for (const ms of expiringMemberships) {
        // Only for non-auto-renewing plans
        if (ms.membershipPlan.autoRenew) continue;
        sendRenewalReminderEmail({
          memberId: ms.member.id,
          memberName: `${ms.member.firstName} ${ms.member.lastName}`,
          planName: ms.membershipPlan.name,
          expiryDate: ms.endDate!,
          daysRemaining: days,
        }).catch(() => {});
        renewalsSent++;
      }
    }
  } catch (err) {
    console.error("Renewal reminder error:", err);
  }

  // --- 4. Trial Expiring (2 days before) ---
  try {
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    const twoDayStr = formatDateInTimezone(twoDaysFromNow, tz);

    const expiringTrials = await prisma.trialPass.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          gte: new Date(twoDayStr + "T00:00:00"),
          lt: new Date(twoDayStr + "T23:59:59"),
        },
      },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const t of expiringTrials) {
      sendTrialExpiringEmail({
        memberId: t.member.id,
        memberName: `${t.member.firstName} ${t.member.lastName}`,
        expiresAt: t.expiresAt,
        classesUsed: t.classesUsed,
        maxClasses: t.maxClasses,
      }).catch(() => {});
      trialsSent++;
    }
  } catch (err) {
    console.error("Trial expiring email error:", err);
  }

  // Mark as run today
  const existingLifecycleRun = await prisma.settings.findFirst({ where: { key: "lifecycle_last_auto_run" } });
  if (existingLifecycleRun) {
    await prisma.settings.update({ where: { id: existingLifecycleRun.id }, data: { value: today } });
  } else {
    const clientId = await getClientId(req);
    await prisma.settings.create({ data: { key: "lifecycle_last_auto_run", value: today, clientId } });
  }

  return NextResponse.json({
    success: true,
    date: today,
    birthdaysSent,
    inactiveSent,
    renewalsSent,
    trialsSent,
  });
}
