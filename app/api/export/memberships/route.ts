import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatInTimezone, getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

export async function GET() {
  const memberships = await prisma.membership.findMany({
    orderBy: { startDate: "desc" },
    include: {
      member: { select: { firstName: true, lastName: true, memberNumber: true, email: true } },
      membershipPlan: { select: { name: true, priceCents: true, billingCycle: true, autoRenew: true } },
    },
  });

  const headers = [
    "Member #",
    "Member Name",
    "Email",
    "Plan",
    "Status",
    "Start Date",
    "End Date",
    "Price",
    "Billing Cycle",
    "Auto Renew",
    "Next Payment",
    "Custom Price",
  ];

  const tz = (await getSetting("timezone")) || "America/Denver";
  const dateFmt: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };

  const rows = memberships.map((m) => [
    m.member?.memberNumber?.toString() || "",
    m.member ? `${m.member.firstName} ${m.member.lastName}` : "",
    m.member?.email || "",
    m.membershipPlan?.name || "",
    m.status,
    formatInTimezone(new Date(m.startDate), tz, dateFmt),
    m.endDate ? formatInTimezone(new Date(m.endDate), tz, dateFmt) : "",
    m.membershipPlan?.priceCents ? (m.membershipPlan.priceCents / 100).toFixed(2) : "",
    m.membershipPlan?.billingCycle || "",
    m.membershipPlan?.autoRenew ? "Yes" : "No",
    m.nextPaymentDate ? formatInTimezone(new Date(m.nextPaymentDate), tz, dateFmt) : "",
    m.customPriceCents ? (m.customPriceCents / 100).toFixed(2) : "",
  ]);

  const today = getTodayInTimezone(tz);
  return csvResponse(toCsv(headers, rows), `memberships-${today}.csv`);
}
