/**
 * Cleanup script — wipes member data + transaction history while keeping
 * all "stuff you built" (styles, ranks, curriculum, classes, plans, settings).
 *
 * Usage:
 *   DRY RUN (counts only, no changes):
 *     node scripts/cleanup-for-launch.js
 *     node scripts/cleanup-for-launch.js "<DATABASE_URL>"
 *
 *   APPLY (actually delete — irreversible):
 *     node scripts/cleanup-for-launch.js --apply
 *     node scripts/cleanup-for-launch.js "<DATABASE_URL>" --apply
 *
 * KEEPS:
 *   - User (admin/staff logins)
 *   - Style, Rank, RankTest*, WeeklyFocus (curriculum)
 *   - ClassSession (class schedule)
 *   - Program, MembershipType, MembershipPlan
 *   - Settings, Locations, Spaces, CoachAvailability
 *   - Appointment, ServicePackage, WaiverTemplate, EmailTemplate
 *   - BoardChannel (the channels themselves)
 *   - PromoCode
 *   - Task rows with recurrence (recurring/default tasks)
 *
 * DELETES:
 *   - All Member rows + every member-linked record (cascade or explicit)
 *   - All POSTransaction + POSLineItem (sales history)
 *   - All POSItem + POSItemVariant (product catalog — per user request)
 *   - All Invoice
 *   - All GiftCertificate
 *   - All TestingEvent / PromotionEvent + participants
 *   - All BoardPost / BoardReply / BoardFile / BoardPoll* (member posts)
 *   - All BoardEvent
 *   - All CalendarEvent
 *   - All ScheduledAppointment
 *   - All AuditLog, AdminResetToken
 *   - Task rows where recurrence IS NULL (one-off / history)
 */

const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const connStr = args.find((a) => !a.startsWith("--"));

const prisma = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function counts() {
  return {
    Member: await prisma.member.count(),
    Membership: await prisma.membership.count(),
    Attendance: await prisma.attendance.count(),
    POSTransaction: await prisma.pOSTransaction.count(),
    POSLineItem: await prisma.pOSLineItem.count(),
    POSItem: await prisma.pOSItem.count(),
    POSItemVariant: await prisma.pOSItemVariant.count(),
    Invoice: await prisma.invoice.count(),
    GiftCertificate: await prisma.giftCertificate.count(),
    TestingEvent: await prisma.testingEvent.count(),
    TestingParticipant: await prisma.testingParticipant.count(),
    PromotionEvent: await prisma.promotionEvent.count(),
    PromotionParticipant: await prisma.promotionParticipant.count(),
    BoardPost: await prisma.boardPost.count(),
    BoardReply: await prisma.boardReply.count(),
    BoardFile: await prisma.boardFile.count(),
    BoardPoll: await prisma.boardPoll.count(),
    BoardPollOption: await prisma.boardPollOption.count(),
    BoardPollVote: await prisma.boardPollVote.count(),
    BoardEvent: await prisma.boardEvent.count(),
    CalendarEvent: await prisma.calendarEvent.count(),
    DirectMessage: await prisma.directMessage.count(),
    DirectConversationMember: await prisma.directConversationMember.count(),
    DirectConversation: await prisma.directConversation.count(),
    ScheduledAppointment: await prisma.scheduledAppointment.count(),
    MemberServiceCredit: await prisma.memberServiceCredit.count(),
    SignedWaiver: await prisma.signedWaiver.count(),
    SignedContract: await prisma.signedContract.count(),
    TrialPass: await prisma.trialPass.count(),
    ClassBooking: await prisma.classBooking.count(),
    EnrollmentSubmission: await prisma.enrollmentSubmission.count(),
    MemberRelationship: await prisma.memberRelationship.count(),
    MemberAuthToken: await prisma.memberAuthToken.count(),
    MemberSession: await prisma.memberSession.count(),
    AuditLog: await prisma.auditLog.count(),
    AdminResetToken: await prisma.adminResetToken.count(),
    "Task (one-off, history)": await prisma.task.count({ where: { recurrence: null } }),
    "Task (recurring, KEEP)": await prisma.task.count({ where: { NOT: { recurrence: null } } }),
    // KEEP counts for sanity:
    "User (KEEP)": await prisma.user.count(),
    "Style (KEEP)": await prisma.style.count(),
    "ClassSession (KEEP)": await prisma.classSession.count(),
    "MembershipPlan (KEEP)": await prisma.membershipPlan.count(),
    "Settings (KEEP)": await prisma.settings.count(),
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log(apply ? "APPLY MODE — changes will be committed" : "DRY RUN — no changes will be made");
  console.log("Connection:", connStr ? "custom URL provided" : "default (env DATABASE_URL)");
  console.log("=".repeat(60));

  const before = await counts();
  console.log("\nCurrent row counts:");
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(35)} ${v}`);
  }

  if (!apply) {
    console.log("\n(Re-run with --apply to actually delete the above rows that aren't marked KEEP.)");
    await prisma.$disconnect();
    return;
  }

  console.log("\nDeleting in dependency order...");

  await prisma.$transaction(async (tx) => {
    // History tables (no FK dependencies on the things we're keeping)
    await tx.auditLog.deleteMany({});
    await tx.adminResetToken.deleteMany({});
    await tx.calendarEvent.deleteMany({});

    // Tasks: only one-off / history rows, keep recurring templates
    await tx.task.deleteMany({ where: { recurrence: null } });

    // Direct messages
    await tx.directMessage.deleteMany({});
    await tx.directConversationMember.deleteMany({});
    await tx.directConversation.deleteMany({});

    // Board (posts/polls — keep channels)
    await tx.boardPollVote.deleteMany({});
    await tx.boardPollOption.deleteMany({});
    await tx.boardPoll.deleteMany({});
    await tx.boardReply.deleteMany({});
    await tx.boardFile.deleteMany({});
    await tx.boardPost.deleteMany({});
    await tx.boardEvent.deleteMany({});

    // Testing / promotion event history
    await tx.testingParticipant.deleteMany({});
    await tx.testingEvent.deleteMany({});
    await tx.promotionParticipant.deleteMany({});
    await tx.promotionEvent.deleteMany({});

    // Scheduled appointments (before MemberServiceCredit due to FK)
    await tx.scheduledAppointment.deleteMany({});

    // POS sales history — line items cascade with transactions, but be explicit
    await tx.pOSLineItem.deleteMany({});
    await tx.giftCertificate.deleteMany({});
    await tx.pOSTransaction.deleteMany({});

    // POS product catalog (user wants these gone)
    await tx.pOSItemVariant.deleteMany({});
    await tx.pOSItem.deleteMany({});

    // Invoices + Memberships (must precede Member)
    await tx.invoice.deleteMany({});
    await tx.membership.deleteMany({});

    // Member-linked data not covered by cascade
    await tx.attendance.deleteMany({});
    await tx.memberRelationship.deleteMany({});
    await tx.enrollmentSubmission.deleteMany({});

    // NOTE: Member rows are intentionally KEPT — the existing prospects
    // sitting in the waiver section are real new sign-ups, not test data.
    // Their SignedWaivers stay too. If we ever want to wipe these later,
    // uncomment the lines below.
    //
    // await tx.member.deleteMany({});
    // await tx.signedWaiver.deleteMany({});
    // await tx.signedContract.deleteMany({});
    // await tx.classBooking.deleteMany({});
    // await tx.memberServiceCredit.deleteMany({});
    // await tx.trialPass.deleteMany({});
    // await tx.memberAuthToken.deleteMany({});
    // await tx.memberSession.deleteMany({});
  }, { timeout: 60_000 });

  console.log("\nDeletion committed. Verifying...");
  const after = await counts();
  console.log("\nRow counts after cleanup:");
  for (const [k, v] of Object.entries(after)) {
    const was = before[k];
    const change = was !== v ? `  (was ${was})` : "";
    console.log(`  ${k.padEnd(35)} ${v}${change}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
