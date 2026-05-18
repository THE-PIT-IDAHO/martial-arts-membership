import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";

// POST /api/account/totp/setup
// Stage a fresh TOTP secret on the user. Returns the secret in base32 + an
// otpauth:// URL + a data-URL QR code for the setup UI. The secret is stored
// with totpEnabled=false so logins are not gated until the user proves they
// can read codes by calling /enable with a valid one.
export async function POST(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, totpEnabled: true, client: { select: { name: true } } },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.totpEnabled) {
    return NextResponse.json({ error: "2FA is already enabled. Disable it first to re-enroll." }, { status: 400 });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: session.userId },
    data: { totpSecret: secret, totpEnabled: false },
  });

  const issuer = (user.client?.name || "Dojo Storm").replace(/[:?#]/g, "");
  const url = otpauthUrl({ secret, label: user.email, issuer });
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });

  return NextResponse.json({ secret, otpauthUrl: url, qrDataUrl });
}
