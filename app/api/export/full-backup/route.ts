import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";
import { getClientId } from "@/lib/tenant";

// GET /api/export/full-backup — exports tenant-scoped tables as JSON
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);

    const [
      members,
      memberships,
      membershipPlans,
      memberRelationships,
      invoices,
      classSessions,
      classBookings,
      attendances,
      styles,
      ranks,
      programs,
      testingEvents,
      testingParticipants,
      promotionEvents,
      promotionParticipants,
      posItems,
      posTransactions,
      boardEvents,
      boardPosts,
      waiverTemplates,
      signedWaivers,
      trialPasses,
      enrollmentSubmissions,
      users,
      settings,
      auditLogs,
    ] = await Promise.all([
      prisma.member.findMany({ where: { clientId } }),
      prisma.membership.findMany({ where: { member: { clientId } } }),
      prisma.membershipPlan.findMany({ where: { clientId } }),
      prisma.memberRelationship.findMany({ where: { fromMember: { clientId } } }),
      prisma.invoice.findMany({ where: { member: { clientId } } }),
      prisma.classSession.findMany({ where: { clientId } }),
      prisma.classBooking.findMany({ where: { classSession: { clientId } } }),
      prisma.attendance.findMany({ where: { member: { clientId } } }),
      prisma.style.findMany({ where: { clientId } }),
      prisma.rank.findMany({ where: { style: { clientId } } }),
      prisma.program.findMany({ where: { clientId } }),
      prisma.testingEvent.findMany({ where: { clientId } }),
      prisma.testingParticipant.findMany({ where: { testingEvent: { clientId } } }),
      prisma.promotionEvent.findMany({ where: { clientId } }),
      prisma.promotionParticipant.findMany({ where: { promotionEvent: { clientId } } }),
      prisma.pOSItem.findMany({ where: { clientId } }),
      prisma.pOSTransaction.findMany({ where: { clientId } }),
      prisma.boardEvent.findMany({ where: { clientId } }),
      prisma.boardPost.findMany({ where: { channel: { clientId } } }),
      prisma.waiverTemplate.findMany({ where: { clientId } }),
      prisma.signedWaiver.findMany({ where: { clientId } }),
      prisma.trialPass.findMany({ where: { member: { clientId } } }),
      prisma.enrollmentSubmission.findMany({ where: { clientId } }),
      prisma.user.findMany({ where: { clientId }, select: { id: true, email: true, name: true, role: true, createdAt: true } }),
      prisma.settings.findMany({ where: { clientId } }),
      prisma.auditLog.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 5000 }),
    ]);

    const backup = {
      exportDate: new Date().toISOString(),
      version: "1.0",
      tables: {
        members,
        memberships,
        membershipPlans,
        memberRelationships,
        invoices,
        classSessions,
        classBookings,
        attendances,
        styles,
        ranks,
        programs,
        testingEvents,
        testingParticipants,
        promotionEvents,
        promotionParticipants,
        posItems,
        posTransactions,
        boardEvents,
        boardPosts,
        waiverTemplates,
        signedWaivers,
        trialPasses,
        enrollmentSubmissions,
        users,
        settings,
        auditLogs,
      },
    };

    const json = JSON.stringify(backup, null, 2);
    const tz = (await getSetting("timezone")) || "America/Denver";
    const dateStr = getTodayInTimezone(tz);

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="full-backup-${dateStr}.json"`,
      },
    });
  } catch (error) {
    console.error("Full backup error:", error);
    return NextResponse.json({ error: "Failed to generate backup" }, { status: 500 });
  }
}
