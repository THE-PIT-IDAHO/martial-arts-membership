import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, getSettings } from "@/lib/email";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const { memberId } = await req.json();
    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, firstName: true, lastName: true, email: true, clientId: true },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (!member.email) {
      return NextResponse.json({ error: "Member has no email on file" }, { status: 400 });
    }

    const settings = await getSettings(["gymName"], member.clientId);
    const gymName = settings.gymName || "the gym";

    const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
    const link = `${origin}/waiver/sign/${member.id}`;
    const memberName = `${member.firstName} ${member.lastName}`.trim();

    const html = `
      <p>Hi ${memberName},</p>
      <p>${gymName} has sent you a link to complete a liability waiver.</p>
      <p>Please tap the link below to review and sign:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open Waiver</a></p>
      <p style="color:#666;font-size:13px">If the button does not work, copy and paste this link into your browser:<br>${link}</p>
      <p style="color:#666;font-size:13px">— ${gymName}</p>
    `;

    const sent = await sendEmail({
      to: member.email,
      subject: `Waiver from ${gymName}`,
      html,
      clientId: member.clientId,
    });

    if (!sent) {
      return NextResponse.json(
        { error: "Email could not be sent. Check that Resend is configured." },
        { status: 500 },
      );
    }

    logAudit({
      entityType: "Member",
      entityId: member.id,
      action: "UPDATE",
      summary: `Sent waiver link to ${member.email}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, sentTo: member.email });
  } catch (err) {
    console.error("send-link error:", err);
    return NextResponse.json({ error: "Failed to send waiver link" }, { status: 500 });
  }
}
