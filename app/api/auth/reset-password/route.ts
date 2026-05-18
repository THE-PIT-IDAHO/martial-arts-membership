import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/admin-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/** Look up reset tokens by SHA-256 hash since the DB doesn't store plain text. */
function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// GET /api/auth/reset-password?token=xxx — validate token
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const resetToken = await prisma.adminResetToken.findUnique({
    where: { token: hashResetToken(token) },
  });

  if (!resetToken) {
    return NextResponse.json({ error: "Invalid reset link" }, { status: 404 });
  }
  if (resetToken.usedAt) {
    return NextResponse.json({ error: "This reset link has already been used" }, { status: 410 });
  }
  if (new Date() > resetToken.expiresAt) {
    return NextResponse.json({ error: "This reset link has expired" }, { status: 410 });
  }

  return NextResponse.json({ valid: true });
}

// POST /api/auth/reset-password — set new password
export async function POST(req: Request) {
  try {
    // Throttle so the reset token can't be brute-forced (entropy is fine but
    // belt-and-suspenders for any future token-format weakening).
    const ip = getClientIp(req);
    const { limited } = rateLimit(`admin-reset:${ip}`, 20, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const resetToken = await prisma.adminResetToken.findUnique({
    where: { token: hashResetToken(token) },
  });

    if (!resetToken) {
      return NextResponse.json({ error: "Invalid reset link" }, { status: 404 });
    }
    if (resetToken.usedAt) {
      return NextResponse.json({ error: "This reset link has already been used" }, { status: 410 });
    }
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json({ error: "This reset link has expired" }, { status: 410 });
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      prisma.adminResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
