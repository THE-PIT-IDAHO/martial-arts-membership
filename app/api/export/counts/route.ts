import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/export/counts — record counts per table for backup summary,
// scoped to the calling tenant. Each count filters by clientId
// directly when the model has one; otherwise it reaches clientId
// through a relation (Rank via style, ClassBooking via member).
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
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
      prisma.member.count({ where: { clientId } }),
      prisma.membership.count({ where: { member: { clientId } } }),
      prisma.membershipPlan.count({ where: { clientId } }),
      prisma.invoice.count({ where: { clientId } }),
      prisma.classSession.count({ where: { clientId } }),
      prisma.classBooking.count({ where: { member: { clientId } } }),
      prisma.attendance.count({ where: { member: { clientId } } }),
      prisma.style.count({ where: { clientId } }),
      prisma.rank.count({ where: { style: { clientId } } }),
      prisma.testingEvent.count({ where: { clientId } }),
      prisma.promotionEvent.count({ where: { clientId } }),
      prisma.pOSItem.count({ where: { clientId } }),
      prisma.pOSTransaction.count({ where: { clientId } }),
      prisma.waiverTemplate.count({ where: { clientId } }),
      prisma.signedWaiver.count({ where: { clientId } }),
      prisma.trialPass.count({ where: { clientId } }),
      prisma.enrollmentSubmission.count({ where: { clientId } }),
      prisma.user.count({ where: { clientId } }),
      prisma.auditLog.count({ where: { clientId } }),
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
