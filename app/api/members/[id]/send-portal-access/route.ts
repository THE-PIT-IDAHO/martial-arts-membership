import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateMagicLinkToken } from "@/lib/portal-auth";
import { sendMagicLinkEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";

// POST /api/members/[id]/send-portal-access
// Admin-triggered: emails the member a magic link with a 7-day expiry so they
// can sign in to the portal without a password. After they click it, they
// land on the portal (with auto-redirect to /portal/set-password if they
// haven't set one yet).
//
// This exists as a manual path so admins can resend access at any time
// without coupling it to a transaction (POS sale, contract sign, etc.) where
// duplicate emails would be a problem for members buying multiple plans.
const EXPIRY_MINUTES = 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = await getClientId(request);
    const member = await prisma.member.findUnique({
      where: { id: params.id },
      select: { id: true, clientId: true, firstName: true, lastName: true, email: true, status: true },
    });

    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (!member.email) {
      return NextResponse.json(
        { error: "Member does not have an email address" },
        { status: 400 }
      );
    }

    const token = await generateMagicLinkToken(member.id, member.email, EXPIRY_MINUTES);
    const origin =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const loginUrl = `${protocol}://${origin}/portal/verify?token=${token}`;

    await sendMagicLinkEmail({
      email: member.email,
      memberName: `${member.firstName} ${member.lastName}`.trim(),
      loginUrl,
      memberId: member.id,
      linkExpiry: "7 days",
    });

    return NextResponse.json({ success: true, email: member.email });
  } catch (err) {
    console.error("Send portal access error:", err);
    return NextResponse.json(
      { error: "Failed to send portal access email" },
      { status: 500 }
    );
  }
}
