import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { verifyTotpCode, generateBackupCodes, hashBackupCodes } from "@/lib/totp";
import { logAudit } from "@/lib/audit";

// POST /api/account/totp/enable
// Activates 2FA after the user proves they can read codes from their authenticator
// app. Returns one-time backup codes (only shown once).
// Body: { code: string }
export async function POST(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { totpSecret: true, totpEnabled: true, clientId: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!user.totpSecret) {
    return NextResponse.json({ error: "Call /setup first to stage a secret." }, { status: 400 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "Already enabled" }, { status: 400 });
  }

  if (!verifyTotpCode(user.totpSecret, code)) {
    return NextResponse.json({ error: "Invalid code. Make sure your device clock is correct and try the next code." }, { status: 400 });
  }

  // Generate 10 single-use backup codes. Shown to the user once here; only the
  // bcrypt hashes are persisted.
  const plainCodes = generateBackupCodes(10);
  const hashes = await hashBackupCodes(plainCodes);

  await prisma.user.update({
    where: { id: session.userId },
    data: { totpEnabled: true, backupCodes: JSON.stringify(hashes) },
  });

  logAudit({
    entityType: "User",
    entityId: session.userId,
    action: "UPDATE",
    summary: "Enabled 2FA",
    clientId: user.clientId,
  }).catch(() => {});

  return NextResponse.json({ success: true, backupCodes: plainCodes });
}
