import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { formatInTimezone, getTodayInTimezone, getGymTimezone } from "@/lib/dates";
import { getSetting, sendEmail } from "@/lib/email";
import { getClientId } from "@/lib/tenant";

// POST /api/export/members/email
// Generates the same Members CSV as /api/export/members and emails it as an
// attachment to the gym's email so it can be opened with Drive on a phone.
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const clientId = await getClientId(request);

    const gymEmail = await getSetting("gymEmail", clientId);
    if (!gymEmail) {
      return NextResponse.json(
        { error: "Set your gym email in Account → Business Details before emailing exports." },
        { status: 400 },
      );
    }

    const where: Record<string, unknown> = { clientId };
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

    const tz = await getGymTimezone(clientId);
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

    const csv = toCsv(headers, rows);
    const csvBase64 = Buffer.from(csv, "utf-8").toString("base64");
    const today = getTodayInTimezone(tz);
    const fileName = `members-${today}.csv`;

    const gymName = (await getSetting("gymName", clientId)) || "Our Gym";
    const ok = await sendEmail({
      to: gymEmail,
      subject: `${gymName} — Members export ${today}`,
      html: `
        <p>Attached is the latest members export from ${gymName} (${members.length} members).</p>
        <p>Filename: <strong>${fileName}</strong></p>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Generated ${new Date().toISOString()}. Open the attachment with your spreadsheet app (Excel, Numbers, Google Sheets).
        </p>
      `,
      attachments: [{ filename: fileName, content: csvBase64 }],
      clientId,
      eventType: "MEMBERS_EXPORT",
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Export was generated but email failed to send. Check your Resend setup in Account → Preferences." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, recipient: gymEmail, memberCount: members.length });
  } catch (err) {
    console.error("Email members export error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to email export" },
      { status: 500 },
    );
  }
}
