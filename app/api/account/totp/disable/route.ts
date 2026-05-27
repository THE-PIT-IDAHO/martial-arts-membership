import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { verifyTotpCode } from "@/lib/totp";
import { logAudit } from "@/lib/audit";

// POST /api/account/totp/disable
// Turns 2FA off. Requires the user's current password AND a valid TOTP code
// (so a stolen session can't unilaterally disable 2FA).
// Body: { password: string, code: string }
export async function POST(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password, code } = await req.json().catch(() => ({}));
  if (!password || !code) {
    return NextResponse.json({ error: "Password and code are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true, totpSecret: true, totpEnabled: true, clientId: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (!passwordOk) return NextResponse.json({ error: "Incorrect password" }, { status: 401 });

  if (!verifyTotpCode(user.totpSecret, code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { totpEnabled: false, totpSecret: null, backupCodes: null },
  });

  logAudit({
    entityType: "User",
    entityId: session.userId,
    action: "UPDATE",
    summary: "Disabled 2FA",
    clientId: user.clientId,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
