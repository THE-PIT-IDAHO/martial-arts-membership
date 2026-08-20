/**
 * scripts/scrub-staging-data.js
 *
 * Wipes CUSTOMER data from a staging database, keeping the CONFIG
 * data the gym owner built (styles, ranks, curriculum, plans,
 * products, waivers, email templates, settings, staff logins).
 *
 * Intended workflow:
 *   1. Neon: branch prod -> staging (fresh copy of everything)
 *   2. Run this script -> removes members / invoices / attendance /
 *      messages / etc, leaving the config surface intact
 *   3. Staging is ready to use for testing without leaking customer
 *      PII or triggering emails to real customer addresses
 *
 * USAGE:
 *   IS_STAGING=1 node scripts/scrub-staging-data.js "postgres://…staging URL…" --yes-really-scrub
 *
 *   Both guards are required:
 *     - IS_STAGING=1 in the shell env
 *     - --yes-really-scrub flag on the command line
 *     - A DATABASE URL argument that is NOT the prod URL (script
 *       refuses if you don't pass a URL AT ALL, to prevent falling
 *       back to whatever .env has)
 *
 * IDEMPOTENT: safe to re-run. Rows already gone stay gone.
 *
 * TO ADD OR REMOVE tables from the wipe list: edit STEPS below.
 * Order matters -- leaves before roots so FK constraints don't
 * block a delete.
 */

const { PrismaClient } = require("@prisma/client");

const targetUrl = process.argv[2];
const confirmFlag = process.argv.includes("--yes-really-scrub");

function abort(msg) {
  console.error(`\nABORT: ${msg}\n`);
  process.exit(1);
}

if (!targetUrl || !targetUrl.startsWith("postgres")) {
  abort(
    "First argument must be an explicit postgres:// connection string for the STAGING database.\n" +
      "  Usage: IS_STAGING=1 node scripts/scrub-staging-data.js \"postgres://…staging…\" --yes-really-scrub\n" +
      "  Refusing to fall back to whatever DATABASE_URL is in .env -- that could be prod."
  );
}
if (process.env.IS_STAGING !== "1" && process.env.IS_STAGING !== "true") {
  abort("Set IS_STAGING=1 in the shell env before running. This is a seatbelt against running against prod.");
}
if (!confirmFlag) {
  abort("Add --yes-really-scrub to confirm you understand this wipes customer data.");
}

const prisma = new PrismaClient({
  datasources: { db: { url: targetUrl } },
});

// Order matters: children before parents so FK constraints hold.
// Each entry: [displayName, () => Promise<{count}>]
const STEPS = [
  // --- ephemeral / logs first (no deps) ---
  ["EmailLog", () => prisma.emailLog.deleteMany()],
  ["AuditLog", () => prisma.auditLog.deleteMany()],
  ["AdminResetToken", () => prisma.adminResetToken.deleteMany()],
  ["MemberSession", () => prisma.memberSession.deleteMany()],
  ["MemberAuthToken", () => prisma.memberAuthToken.deleteMany()],

  // --- board / messaging content (posts before channels) ---
  ["BoardPollVote", () => prisma.boardPollVote.deleteMany()],
  ["BoardPollOption", () => prisma.boardPollOption.deleteMany()],
  ["BoardPoll", () => prisma.boardPoll.deleteMany()],
  ["BoardReply", () => prisma.boardReply.deleteMany()],
  ["BoardFile", () => prisma.boardFile.deleteMany()],
  ["BoardPost", () => prisma.boardPost.deleteMany()],
  ["BoardEvent", () => prisma.boardEvent.deleteMany()],
  // BoardChannel kept -- these are the "rooms" the gym owner sets up.
  ["DirectMessage", () => prisma.directMessage.deleteMany()],
  ["DirectConversationMember", () => prisma.directConversationMember.deleteMany()],
  ["DirectConversation", () => prisma.directConversation.deleteMany()],

  // --- test / promotion event instances (participants first) ---
  ["TestingParticipant", () => prisma.testingParticipant.deleteMany()],
  ["TestingEvent", () => prisma.testingEvent.deleteMany()],
  ["PromotionParticipant", () => prisma.promotionParticipant.deleteMany()],
  ["PromotionEvent", () => prisma.promotionEvent.deleteMany()],
  ["Promotion", () => prisma.promotion.deleteMany()], // per-member rank history

  // --- per-member state ---
  ["TrialPass", () => prisma.trialPass.deleteMany()],
  ["MemberDiscount", () => prisma.memberDiscount.deleteMany()],
  ["MemberRelationship", () => prisma.memberRelationship.deleteMany()],
  ["Attendance", () => prisma.attendance.deleteMany()],
  ["ClassBooking", () => prisma.classBooking.deleteMany()],
  ["ScheduledAppointment", () => prisma.scheduledAppointment.deleteMany()],
  ["CoachAvailability", () => prisma.coachAvailability.deleteMany()],
  ["SignedContract", () => prisma.signedContract.deleteMany()],
  ["SignedWaiver", () => prisma.signedWaiver.deleteMany()],
  ["GiftCertificate", () => prisma.giftCertificate.deleteMany()],
  ["MemberServiceCredit", () => prisma.memberServiceCredit.deleteMany()],
  ["EnrollmentSubmission", () => prisma.enrollmentSubmission.deleteMany()],
  ["CalendarEvent", () => prisma.calendarEvent.deleteMany()],

  // --- transactions / billing history ---
  ["POSLineItem", () => prisma.pOSLineItem.deleteMany()],
  ["POSTransaction", () => prisma.pOSTransaction.deleteMany()],
  ["Invoice", () => prisma.invoice.deleteMany()],
  ["Membership", () => prisma.membership.deleteMany()],

  // --- members themselves (must be last of the per-member group) ---
  ["Member", () => prisma.member.deleteMany()],
];

async function main() {
  // Sanity: confirm which client(s) live in this DB before wiping.
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, slug: true },
  });
  console.log("\nTarget database contains these Client rows (KEPT):");
  for (const c of clients) {
    console.log(`  - ${c.name}  [slug=${c.slug}, id=${c.id}]`);
  }
  console.log();

  console.log("Scrubbing customer data…\n");
  let total = 0;
  const failures = [];

  for (const [name, fn] of STEPS) {
    try {
      const res = await fn();
      const count = res && typeof res.count === "number" ? res.count : 0;
      console.log(`  ✓ ${name.padEnd(28)} deleted ${count}`);
      total += count;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${name.padEnd(28)} ${msg.split("\n")[0]}`);
      failures.push({ name, err: msg });
    }
  }

  console.log(`\nDone. ${total} rows deleted.`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} step(s) failed:`);
    for (const f of failures) console.error(`  - ${f.name}: ${f.err.split("\n")[0]}`);
    process.exit(2);
  }

  console.log("\nPreserved (staging still has these):");
  console.log("  Client, Settings, User (staff logins)");
  console.log("  Style, Rank, RankTest, RankTestCategory, RankTestItem (curriculum)");
  console.log("  Program, MembershipType, MembershipPlan");
  console.log("  ClassSession, Appointment, Location, Space");
  console.log("  POSItem, POSItemVariant, ServicePackage, PromoCode");
  console.log("  WaiverTemplate, EmailTemplate, BoardChannel, WeeklyFocus, Task");
  console.log("  Platform: PricingTier, SignupLink, PlatformAnnouncement, SupportTicket");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\nUnexpected error:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
