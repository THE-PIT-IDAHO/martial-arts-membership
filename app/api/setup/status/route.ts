// GET /api/setup/status
//
// Returns the state of the setup checklist for the current tenant so the
// dashboard card can render "3 of 13 done" and link each task to its
// real configuration page. Each task's `done` flag is derived from the
// tenant's actual data (a Style exists, a MembershipPlan exists, etc.)
// rather than from a manual "I did this" acknowledgment -- that way the
// checklist stays in sync when data is added elsewhere in the app.
//
// Two exceptions live in the Settings table:
//   - Payment method: no real payment integration yet, so the user
//     acknowledges the placeholder manually.
//   - Kiosk mode: no first-class kiosk-config row to inspect, so we
//     stamp a Settings key when the owner completes that step.
//
// Individual tasks can also be user-dismissed (Settings.setup_dismissed
// carries a JSON array of task ids) so gyms that legitimately don't use
// e.g. POS or staff accounts don't stare at a permanently incomplete
// checklist.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { getClientId } from "@/lib/tenant";
import type { NextRequest } from "next/server";

export type SetupTaskId =
  | "profile"
  | "location"
  | "style"
  | "class"
  | "plan"
  | "style-reqs"
  | "curriculum"
  | "testing"
  | "grading"
  | "promotions"
  | "member"
  | "notifications"
  | "staff"
  | "waivers"
  | "payment"
  | "pos"
  | "kiosk";

type Task = {
  id: SetupTaskId;
  title: string;
  hint: string;
  href: string;
  done: boolean;
  // Whether this task's done state came from a manual mark rather than
  // real data. Client shows an "unmark" affordance for these so a user
  // can back out of a stray click.
  manual?: boolean;
};

export async function GET(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only OWNER/ADMIN see setup -- coaches and front-desk staff aren't
  // the ones configuring the gym.
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ tasks: [], hidden: true, visible: false });
  }

  const clientId = await getClientId(req);

  // Batch every needed count / lookup in parallel.
  const [
    settings,
    locationCount,
    styles,
    classCount,
    planCount,
    memberCount,
    staffCount,
    waiverCount,
    posCount,
    curriculumItemCount,
    rankTestCount,
    promotionEventCount,
  ] = await Promise.all([
    prisma.settings.findMany({
      where: {
        clientId,
        key: {
          in: [
            "gymName",
            "resendApiKey",
            "notificationsEnabled",
            "setup_hidden",
            "setup_dismissed",
            "setup_payment_ack",
            "setup_kiosk_ack",
          ],
        },
      },
      select: { key: true, value: true },
    }),
    prisma.location.count({ where: { clientId } }),
    prisma.style.findMany({ where: { clientId }, select: { beltConfig: true, gradingDates: true } }),
    prisma.classSession.count({ where: { clientId } }),
    prisma.membershipPlan.count({ where: { clientId } }),
    prisma.member.count({ where: { clientId } }),
    prisma.user.count({ where: { clientId, role: { not: "OWNER" } } }),
    prisma.waiverTemplate.count({ where: { clientId } }),
    prisma.pOSItem.count({ where: { clientId } }),
    // Curriculum + testing live under Style -> Rank -> RankTest, so
    // filter through the rank relation for clientId scoping (RankTest
    // has styleId but no formal `style` relation; Rank does).
    prisma.rankTestItem.count({
      where: { category: { rankTest: { rank: { style: { clientId } } } } },
    }),
    prisma.rankTest.count({ where: { rank: { style: { clientId } } } }),
    prisma.promotionEvent.count({ where: { clientId } }),
  ]);

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));
  const hidden = settingsMap.get("setup_hidden") === "1";
  let dismissed: SetupTaskId[] = [];
  try {
    const raw = settingsMap.get("setup_dismissed");
    if (raw) dismissed = JSON.parse(raw) as SetupTaskId[];
  } catch {
    /* empty */
  }
  const isDismissed = (id: SetupTaskId) => dismissed.includes(id);

  // Style step (3): at least one style with at least one rank in its
  // beltConfig. A style with no ranks yet doesn't count.
  // Style requirements step (6): at least one style has a rank that
  // carries a non-empty classRequirements array.
  // Grading step: at least one style has a scheduled grading date on
  // its gradingDates JSON.
  let hasStyleWithBelt = false;
  let hasStyleReqs = false;
  let hasGradingScheduled = false;
  for (const s of styles) {
    if (s.beltConfig) {
      try {
        const parsed = JSON.parse(s.beltConfig);
        const ranks: Array<{ classRequirements?: Array<unknown> }> = Array.isArray(parsed?.ranks)
          ? parsed.ranks
          : [];
        if (ranks.length > 0) hasStyleWithBelt = true;
        if (ranks.some((r) => Array.isArray(r.classRequirements) && r.classRequirements.length > 0)) {
          hasStyleReqs = true;
        }
      } catch {
        /* bad JSON on this style -- ignore for detection */
      }
    }
    if (s.gradingDates) {
      try {
        const parsed = JSON.parse(s.gradingDates);
        if (Array.isArray(parsed) && parsed.length > 0) hasGradingScheduled = true;
      } catch {
        /* ignore malformed gradingDates */
      }
    }
  }

  const gymNameSet = !!(settingsMap.get("gymName") || "").trim();
  const emailReady = !!(settingsMap.get("resendApiKey") || "").trim();
  const paymentAck = settingsMap.get("setup_payment_ack") === "1";
  const kioskAck = settingsMap.get("setup_kiosk_ack") === "1";

  const raw: Task[] = [
    {
      id: "profile",
      title: "Set your gym profile",
      hint: "Gym name, logo, contact info.",
      href: "/account",
      done: gymNameSet,
    },
    {
      id: "location",
      title: "Add a location",
      hint: "At least one physical location so classes have a home.",
      href: "/settings/locations",
      done: locationCount > 0,
    },
    {
      id: "style",
      title: "Add a style with a belt",
      hint: "One style + one rank so members can be enrolled.",
      href: "/styles",
      done: hasStyleWithBelt,
    },
    {
      id: "class",
      title: "Add a class",
      hint: "Put at least one class on the calendar.",
      href: "/calendar",
      done: classCount > 0,
    },
    {
      id: "plan",
      title: "Add a membership plan",
      hint: "Name, price, billing cycle.",
      href: "/memberships",
      done: planCount > 0,
    },
    {
      id: "style-reqs",
      title: "Set class requirements on a rank",
      hint: "Tell the app how many classes each rank needs to promote.",
      href: "/styles",
      done: hasStyleReqs,
    },
    {
      id: "curriculum",
      title: "Add a curriculum item",
      hint: "Even one technique or knowledge item on any rank counts.",
      href: "/curriculum",
      done: curriculumItemCount > 0,
    },
    {
      id: "testing",
      title: "Create a test",
      hint: "One rank test set up (categories can come later).",
      href: "/testing",
      done: rankTestCount > 0,
    },
    {
      id: "grading",
      title: "Schedule a grading",
      hint: "One grading date on your calendar so members know when to test.",
      href: "/grading",
      done: hasGradingScheduled,
    },
    {
      id: "promotions",
      title: "Create a promotion event",
      hint: "Set up your first promotion event so eligible members can be promoted.",
      href: "/promotions",
      done: promotionEventCount > 0,
    },
    {
      id: "member",
      title: "Add a member",
      hint: "Enroll your first member.",
      href: "/members",
      done: memberCount > 0,
    },
    {
      id: "notifications",
      title: "Turn on email notifications",
      hint: "Paste your Resend API key so receipts and alerts go out.",
      href: "/account",
      done: emailReady,
    },
    {
      id: "staff",
      title: "Invite staff",
      hint: "Coaches, admins, front desk.",
      href: "/account",
      done: staffCount > 0,
    },
    {
      id: "waivers",
      title: "Add a waiver template",
      hint: "The default form new members will sign at signup.",
      href: "/waivers",
      done: waiverCount > 0,
    },
    {
      id: "payment",
      title: "Set up a payment method",
      hint: "Stripe isn't wired up yet. Mark this done once you've decided how you'll collect payments for now.",
      href: "/account",
      done: paymentAck,
      manual: true,
    },
    {
      id: "pos",
      title: "Add a POS item",
      hint: "First product for the shop (t-shirts, drop-in passes, etc.).",
      href: "/pos/items",
      done: posCount > 0,
    },
    {
      id: "kiosk",
      title: "Set up kiosk sign-in",
      hint: "Optional -- enables the tablet check-in flow.",
      href: "/kiosk",
      done: kioskAck,
      manual: true,
    },
  ];

  // A user-dismissed task counts as done for progress but is still
  // labeled distinctly on the client so they know they skipped it.
  const tasks = raw.map((t) => ({
    ...t,
    dismissed: isDismissed(t.id),
    done: t.done || isDismissed(t.id),
  }));

  const completedCount = tasks.filter((t) => t.done).length;

  return NextResponse.json({
    tasks,
    hidden,
    visible: true,
    completedCount,
    totalCount: tasks.length,
  });
}
