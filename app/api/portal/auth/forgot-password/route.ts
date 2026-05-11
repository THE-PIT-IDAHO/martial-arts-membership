import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePasswordResetToken } from "@/lib/portal-auth";
import { sendPasswordResetEmail } from "@/lib/notifications";
import { getClientId } from "@/lib/tenant";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// POST /api/portal/auth/forgot-password — Member requests their own password reset
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const { limited } = rateLimit(`portal-forgot:${ip}`, 3, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const clientId = await getClientId(request);
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find member by email — don't reveal if email exists or not
    const member = await prisma.member.findFirst({
      where: { email: email.trim().toLowerCase(), clientId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    // Always return success to prevent email enumeration
    if (!member || !member.email) {
      return NextResponse.json({ success: true });
    }

    const token = await generatePasswordResetToken(member.id, member.email);

    const origin =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const resetUrl = `${protocol}://${origin}/portal/reset-password?token=${token}`;

    await sendPasswordResetEmail({
      email: member.email,
      memberName: `${member.firstName} ${member.lastName}`.trim(),
      resetUrl,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    // Still return success to prevent email enumeration
    return NextResponse.json({ success: true });
  }
}
