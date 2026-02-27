import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse } from "@/lib/csv";
import { formatInTimezone, getTodayInTimezone } from "@/lib/dates";
import { getSetting } from "@/lib/email";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.attendanceDate = {};
    if (from) (where.attendanceDate as Record<string, unknown>).gte = new Date(from);
    if (to) (where.attendanceDate as Record<string, unknown>).lte = new Date(to + "T23:59:59");
  }

  const records = await prisma.attendance.findMany({
    where,
    orderBy: { attendanceDate: "desc" },
    include: {
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      classSession: { select: { name: true, styleName: true } },
    },
  });

  const headers = [
    "Date",
    "Member #",
    "Member Name",
    "Class",
    "Style",
    "Source",
    "Confirmed",
    "Check-in Time",
  ];

  const tz = (await getSetting("timezone")) || "America/Denver";

  const rows = records.map((a) => [
    formatInTimezone(new Date(a.attendanceDate), tz, { year: "numeric", month: "2-digit", day: "2-digit" }),
    a.member?.memberNumber?.toString() || "",
    a.member ? `${a.member.firstName} ${a.member.lastName}` : "",
    a.classSession?.name || "",
    a.classSession?.styleName || "",
    a.source,
    a.confirmed ? "Yes" : "No",
    formatInTimezone(new Date(a.checkedInAt), tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" }),
  ]);

  const today = getTodayInTimezone(tz);
  return csvResponse(toCsv(headers, rows), `attendance-${today}.csv`);
}
