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
import { expireLapsedCreditMemberships } from "@/lib/class-credits";

// Vercel cron sends GET. Dashboard sends POST. Both delegate here.
//
// Previously every query in this file was unscoped: any tenant's
// dashboard "run lifecycle now" click sent birthday / inactive /
// renewal / trial-expiring emails for ALL gyms, and one tenant's
// lifecycle_last_auto_run row blocked every other tenant for the day.
// Now this route mirrors /api/billing/auto-run -- iterates every
// tenant when cron-mode, otherwise runs for the single caller-tenant,
// and every query is scoped by clientId.
export async function GET(req: Request) {
  return POST(req);
}

type TenantResult = {
  clientId: string;
  skipped?: boolean;
  message?: string;
  birthdaysSent?: number;
  inactiveSent?: number;
  renewalsSent?: number;
  trialsSent?: number;
  autoFinishedEvents?: number;
  autoFinishErrors?: number;
  classPacksExpired?: number;
  error?: string;
};

export async function POST(req: Request) {
  try {
    const isCronCall = req.headers.get("x-cron-mode") === "true";

    let tenantIds: string[];
    if (isCronCall) {
      const candidates = await prisma.client.findMany({ select: { id: true } });
      tenantIds = candidates.map((c) => c.id);
    } else {
      tenantIds = [await getClientId(req)];
    }

    const results: TenantResult[] = [];
    for (const clientId of tenantIds) {
      try {
        results.push(await processLifecycleForTenant(clientId, req));
      } catch (err) {
        console.error(`Lifecycle failed for tenant ${clientId}:`, err);
        results.push({
          clientId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    if (results.length === 1) {
      const r = results[0];
      if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
      if (r.skipped) return NextResponse.json({ skipped: true, reason: r.message });
      return NextResponse.json({
        success: true,
        birthdaysSent: r.birthdaysSent || 0,
        inactiveSent: r.inactiveSent || 0,
        renewalsSent: r.renewalsSent || 0,
        trialsSent: r.trialsSent || 0,
        autoFinishedEvents: r.autoFinishedEvents || 0,
        autoFinishErrors: r.autoFinishErrors || 0,
        classPacksExpired: r.classPacksExpired || 0,
      });
    }
    return NextResponse.json({ tenants: results.length, results });
  } catch (error) {
    console.error("Lifecycle auto-run error:", error);
    return new NextResponse("Failed to run lifecycle", { status: 500 });
  }
}

async function processLifecycleForTenant(clientId: string, req: Request): Promise<TenantResult> {
  const tz = (await getSetting("timezone", clientId)) || "America/Denver";
  const today = getTodayInTimezone(tz);

  // Per-tenant "already run today" guard. Previously used
  // findFirst({ where: { key } }) which returned whichever tenant's
  // row happened first, so any one tenant's daily run blocked every
  // other tenant.
  const lastRun = await prisma.settings.findUnique({
    where: { key_clientId: { key: "lifecycle_last_auto_run", clientId } },
  });
  if (lastRun?.value === today) {
    return { clientId, skipped: true, message: "Already run today" };
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
      where: { clientId, status: { contains: "ACTIVE" }, dateOfBirth: { not: null } },
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
    const thresholdSetting = await prisma.settings.findUnique({
      where: { key_clientId: { key: "inactive_threshold_days", clientId } },
    });
    const thresholdDays = thresholdSetting ? parseInt(thresholdSetting.value) || 30 : 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    const activeMembers = await prisma.member.findMany({
      where: { clientId, status: { contains: "ACTIVE" } },
      select: { id: true, firstName: true, lastName: true },
    });

    for (const m of activeMembers) {
      const lastAttendance = await prisma.attendance.findFirst({
        where: { memberId: m.id },
        orderBy: { attendanceDate: "desc" },
        select: { attendanceDate: true },
      });

      if (lastAttendance && lastAttendance.attendanceDate < cutoffDate) {
        const daysSince = Math.floor(
          (Date.now() - lastAttendance.attendanceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
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
          member: { clientId },
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
        clientId,
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

  // --- 5. Auto-finish promotion events ---
  let autoFinishedEvents = 0;
  let autoFinishErrors = 0;
  try {
    const dueEvents = await prisma.promotionEvent.findMany({
      where: {
        clientId,
        finishedAt: null,
        status: { not: "CANCELLED" },
        autoFinishAt: { not: null, lte: new Date() },
      },
      select: { id: true, clientId: true },
    });
    for (const ev of dueEvents) {
      try {
        const client = await prisma.client.findUnique({
          where: { id: ev.clientId },
          select: { slug: true },
        }).catch(() => null);
        if (!client?.slug) continue;
        const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
        const url = `${origin}/api/promotion-events/${ev.id}/finish`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-slug": client.slug,
          },
          body: JSON.stringify({ mode: "auto", paymentMethod: "ACCOUNT" }),
        });
        if (res.ok) autoFinishedEvents++;
        else autoFinishErrors++;
      } catch (err) {
        console.error(`Auto-finish failed for event ${ev.id}:`, err);
        autoFinishErrors++;
      }
    }
  } catch (err) {
    console.error("Auto-finish promotion events error:", err);
  }

  // --- Expire lapsed class-pack memberships ---
  // Two ways a class-pack membership expires:
  //   (a) Balance hits 0 -- handled inline at check-in time in
  //       lib/class-credits.ts.
  //   (b) creditsExpireAt passes with unused credits still on the
  //       row -- swept here so the member's status flips even if
  //       they never come back to check in.
  // Whichever comes first wins.
  let classPacksExpired = 0;
  try {
    classPacksExpired = await expireLapsedCreditMemberships(clientId);
  } catch (err) {
    console.error("Class-pack expiry sweep error:", err);
  }

  // Per-tenant "last run today" stamp.
  await prisma.settings.upsert({
    where: { key_clientId: { key: "lifecycle_last_auto_run", clientId } },
    update: { value: today },
    create: { key: "lifecycle_last_auto_run", value: today, clientId },
  });

  return {
    clientId,
    birthdaysSent,
    inactiveSent,
    renewalsSent,
    trialsSent,
    autoFinishedEvents,
    autoFinishErrors,
    classPacksExpired,
  };
}
