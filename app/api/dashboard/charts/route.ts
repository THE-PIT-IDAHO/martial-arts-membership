import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const now = new Date();

    // --- 1. Monthly Revenue (last 12 months) ---
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const transactions = await prisma.pOSTransaction.findMany({
      where: {
        status: "COMPLETED",
        createdAt: { gte: twelveMonthsAgo },
        clientId,
      },
      select: { totalCents: true, createdAt: true },
    });

    const paidInvoices = await prisma.invoice.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: twelveMonthsAgo },
        member: { clientId },
      },
      select: { amountCents: true, paidAt: true },
    });

    // Build monthly buckets
    const monthlyRevenue: { month: string; posCents: number; invoiceCents: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyRevenue.push({ month: key, posCents: 0, invoiceCents: 0 });
    }

    for (const tx of transactions) {
      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthlyRevenue.find((m) => m.month === key);
      if (bucket) bucket.posCents += tx.totalCents;
    }

    for (const inv of paidInvoices) {
      if (!inv.paidAt) continue;
      const d = new Date(inv.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthlyRevenue.find((m) => m.month === key);
      if (bucket) bucket.invoiceCents += inv.amountCents;
    }

    // --- 2. Membership Growth (last 12 months) ---
    // Fetch all memberships — the loop checks start/end per month-end snapshot
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const memberships = await prisma.membership.findMany({
      where: {
        startDate: { lte: endOfCurrentMonth },
        member: { clientId },
      },
      select: { startDate: true, endDate: true, status: true },
    });

    const membershipGrowth: { month: string; active: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // last day of month
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let active = 0;
      for (const ms of memberships) {
        const started = new Date(ms.startDate) <= d;
        const notEnded = !ms.endDate || new Date(ms.endDate) > d;
        const isActive = ms.status === "ACTIVE";
        if (started && notEnded && isActive) {
          active++;
        }
      }
      membershipGrowth.push({ month: key, active });
    }

    // --- 3. Attendance Trends (last 12 weeks) ---
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    const attendances = await prisma.attendance.findMany({
      where: {
        attendanceDate: { gte: twelveWeeksAgo },
        member: { clientId },
      },
      select: { attendanceDate: true },
    });

    const weeklyAttendance: { week: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      let count = 0;
      for (const a of attendances) {
        const d = new Date(a.attendanceDate);
        if (d >= weekStart && d < weekEnd) count++;
      }
      weeklyAttendance.push({ week: label, count });
    }

    // --- 4. Lead Source Breakdown ---
    const members = await prisma.member.findMany({
      where: { leadSource: { not: null }, clientId },
      select: { leadSource: true },
    });

    const leadSourceMap: Record<string, number> = {};
    for (const m of members) {
      if (m.leadSource) {
        leadSourceMap[m.leadSource] = (leadSourceMap[m.leadSource] || 0) + 1;
      }
    }
    const leadSources = Object.entries(leadSourceMap).map(([name, value]) => ({ name, value }));

    return NextResponse.json({
      monthlyRevenue,
      membershipGrowth,
      weeklyAttendance,
      leadSources,
    });
  } catch (err) {
    console.error("GET /api/dashboard/charts error:", err);
    return NextResponse.json({ error: "Failed to load chart data" }, { status: 500 });
  }
}
