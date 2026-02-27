import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePasswordResetToken } from "@/lib/portal-auth";
import { sendPasswordResetEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = await getClientId(_request);
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

    const token = await generatePasswordResetToken(member.id, member.email);

    // Build reset URL using the request origin
    const origin =
      _request.headers.get("x-forwarded-host") ||
      _request.headers.get("host") ||
      "localhost:3000";
    const protocol = _request.headers.get("x-forwarded-proto") || "http";
    const resetUrl = `${protocol}://${origin}/portal/reset-password?token=${token}`;

    // In dev mode, return the reset URL directly (no email needed)
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ success: true, devResetUrl: resetUrl });
    }

    await sendPasswordResetEmail({
      email: member.email,
      memberName: `${member.firstName} ${member.lastName}`.trim(),
      resetUrl,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send password reset error:", err);
    return NextResponse.json(
      { error: "Failed to send password reset email" },
      { status: 500 }
    );
  }
}
