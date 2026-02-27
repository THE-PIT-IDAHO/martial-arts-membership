import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

// GET /api/export/full-backup — exports ALL tables as JSON
export async function GET() {
  try {
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
      prisma.member.findMany(),
      prisma.membership.findMany(),
      prisma.membershipPlan.findMany(),
      prisma.memberRelationship.findMany(),
      prisma.invoice.findMany(),
      prisma.classSession.findMany(),
      prisma.classBooking.findMany(),
      prisma.attendance.findMany(),
      prisma.style.findMany(),
      prisma.rank.findMany(),
      prisma.program.findMany(),
      prisma.testingEvent.findMany(),
      prisma.testingParticipant.findMany(),
      prisma.promotionEvent.findMany(),
      prisma.promotionParticipant.findMany(),
      prisma.pOSItem.findMany(),
      prisma.pOSTransaction.findMany(),
      prisma.boardEvent.findMany(),
      prisma.boardPost.findMany(),
      prisma.waiverTemplate.findMany(),
      prisma.signedWaiver.findMany(),
      prisma.trialPass.findMany(),
      prisma.enrollmentSubmission.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, createdAt: true } }), // exclude passwordHash
      prisma.settings.findMany(),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 }),
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
