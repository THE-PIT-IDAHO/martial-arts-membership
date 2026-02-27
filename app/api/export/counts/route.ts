import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/export/counts — record counts per table for backup summary
export async function GET() {
  try {
    const [
      members,
      memberships,
      membershipPlans,
      invoices,
      classSessions,
      classBookings,
      attendances,
      styles,
      ranks,
      testingEvents,
      promotionEvents,
      posItems,
      posTransactions,
      waiverTemplates,
      signedWaivers,
      trialPasses,
      enrollmentSubmissions,
      users,
      auditLogs,
    ] = await Promise.all([
      prisma.member.count(),
      prisma.membership.count(),
      prisma.membershipPlan.count(),
      prisma.invoice.count(),
      prisma.classSession.count(),
      prisma.classBooking.count(),
      prisma.attendance.count(),
      prisma.style.count(),
      prisma.rank.count(),
      prisma.testingEvent.count(),
      prisma.promotionEvent.count(),
      prisma.pOSItem.count(),
      prisma.pOSTransaction.count(),
      prisma.waiverTemplate.count(),
      prisma.signedWaiver.count(),
      prisma.trialPass.count(),
      prisma.enrollmentSubmission.count(),
      prisma.user.count(),
      prisma.auditLog.count(),
    ]);

    return NextResponse.json({
      counts: {
        members,
        memberships,
        membershipPlans,
        invoices,
        classSessions,
        classBookings,
        attendances,
        styles,
        ranks,
        testingEvents,
        promotionEvents,
        posItems,
        posTransactions,
        waiverTemplates,
        signedWaivers,
        trialPasses,
        enrollmentSubmissions,
        users,
        auditLogs,
      },
      total: members + memberships + membershipPlans + invoices + classSessions +
        classBookings + attendances + styles + ranks + testingEvents + promotionEvents +
        posItems + posTransactions + waiverTemplates + signedWaivers + trialPasses +
        enrollmentSubmissions + users + auditLogs,
    });
  } catch (error) {
    console.error("Counts error:", error);
    return NextResponse.json({ error: "Failed to get counts" }, { status: 500 });
  }
}
