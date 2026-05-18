import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";

// GET /api/account/totp/status
// Returns whether 2FA is enabled for the current admin + how many backup
// codes remain. Used by the Account page to render the right controls.
export async function GET(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { totpEnabled: true, backupCodes: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let backupCount = 0;
  if (user.backupCodes) {
    try {
      const arr = JSON.parse(user.backupCodes);
      if (Array.isArray(arr)) backupCount = arr.length;
    } catch { /* ignore */ }
  }

  return NextResponse.json({ enabled: user.totpEnabled, backupCodesRemaining: backupCount });
}
