import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/admin-auth";

// GET /api/auth/reset-password?token=xxx — validate token
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const resetToken = await prisma.adminResetToken.findUnique({ where: { token } });

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
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const resetToken = await prisma.adminResetToken.findUnique({ where: { token } });

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
