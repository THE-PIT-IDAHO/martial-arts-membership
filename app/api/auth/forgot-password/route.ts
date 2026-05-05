import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, getSettings } from "@/lib/email";

// POST /api/auth/forgot-password — send a reset link to admin email
export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find user by email (check all clients)
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true, clientId: true },
    });

    // Always return success even if user not found (prevent email enumeration)
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Create reset token (expires in 1 hour)
    const resetToken = await prisma.adminResetToken.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Build reset URL
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const resetUrl = `${protocol}://${host}/reset-password?token=${resetToken.token}`;

    // Send email
    const settings = await getSettings(["gymName"], user.clientId);
    const gymName = settings.gymName || "Dojo Storm";

    await sendEmail({
      to: user.email,
      subject: `Reset your ${gymName} admin password`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#c41111;">Reset Your Password</h2>
          <p>Hi ${user.name || "there"},</p>
          <p>A password reset was requested for your admin account. Click the button below to set a new password.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background-color:#c41111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
              Reset Password
            </a>
          </p>
          <p style="font-size:13px;color:#666;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      clientId: user.clientId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
