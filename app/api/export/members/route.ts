import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatInTimezone, getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { clientId: "default-client" };
  if (status) where.status = { contains: status };

  const members = await prisma.member.findMany({
    where,
    orderBy: { lastName: "asc" },
    include: {
      memberships: {
        where: { status: "ACTIVE" },
        include: { membershipPlan: { select: { name: true } } },
        take: 1,
      },
    },
  });

  const headers = [
    "Member #",
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Status",
    "Date of Birth",
    "Primary Style",
    "Rank",
    "Start Date",
    "Active Plan",
    "Lead Source",
    "Address",
    "City",
    "State",
    "Zip",
    "Emergency Contact",
    "Emergency Phone",
    "Waiver Signed",
  ];

  const tz = (await getSetting("timezone")) || "America/Denver";
  const dateFmt: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };

  const rows = members.map((m) => [
    m.memberNumber?.toString() || "",
    m.firstName,
    m.lastName,
    m.email || "",
    m.phone || "",
    m.status,
    m.dateOfBirth ? formatInTimezone(new Date(m.dateOfBirth), tz, dateFmt) : "",
    m.primaryStyle || "",
    m.rank || "",
    m.startDate ? formatInTimezone(new Date(m.startDate), tz, dateFmt) : "",
    m.memberships[0]?.membershipPlan?.name || "",
    m.leadSource || "",
    m.address || "",
    m.city || "",
    m.state || "",
    m.zipCode || "",
    m.emergencyContactName || "",
    m.emergencyContactPhone || "",
    m.waiverSigned ? "Yes" : "No",
  ]);

  const today = getTodayInTimezone(tz);
  return csvResponse(toCsv(headers, rows), `members-${today}.csv`);
}
