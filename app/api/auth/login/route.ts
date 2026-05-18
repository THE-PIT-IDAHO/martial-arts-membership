import { NextResponse } from "next/server";
import {
  verifyPassword,
  createAdminSessionToken,
  setAdminSessionCookie,
  ensureDefaultAdmin,
} from "@/lib/admin-auth";
import { getRolePermissions } from "@/lib/permissions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getClientId } from "@/lib/tenant";
import { verifyTotpCode, verifyBackupCode } from "@/lib/totp";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    // Rate limit: max 10 attempts per IP per 15 min. Blocks casual brute force
    // even when bcrypt's slowness already makes large-scale attacks expensive.
    const ip = getClientIp(request);
    const { limited, resetAt } = rateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000);
    if (limited) {
      const retrySecs = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${Math.ceil(retrySecs / 60)} minute(s).` },
        { status: 429, headers: { "Retry-After": String(retrySecs) } }
      );
    }

    // Ensure default admin exists on first-ever login attempt
    const created = await ensureDefaultAdmin();
    if (created) {
      console.log("Default admin user created on first login");
    }

    const { email, password, rememberMe, totpCode, backupCode } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Resolve tenant from subdomain
    let clientId: string | undefined;
    try {
      clientId = await getClientId(request);
    } catch {
      // Tenant not resolved — fall back to email-only lookup
    }

    const user = await verifyPassword(email.toLowerCase().trim(), password, clientId);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // --- 2FA gate -------------------------------------------------------
    if (user.totpEnabled) {
      // Step 1: client just submitted password — ask for a code.
      if (!totpCode && !backupCode) {
        return NextResponse.json({ needs2FA: true });
      }

      // Step 2: verify TOTP or a backup code. Backup codes are single-use and
      // we splice the matched entry out of the stored list on success.
      let twoFactorOk = false;
      if (totpCode && user.totpSecret) {
        twoFactorOk = verifyTotpCode(user.totpSecret, totpCode);
      } else if (backupCode && user.backupCodes) {
        try {
          const codes: string[] = JSON.parse(user.backupCodes);
          if (Array.isArray(codes)) {
            const matchIdx = await verifyBackupCode(backupCode, codes);
            if (matchIdx >= 0) {
              twoFactorOk = true;
              const remaining = [...codes.slice(0, matchIdx), ...codes.slice(matchIdx + 1)];
              await prisma.user.update({
                where: { id: user.userId },
                data: { backupCodes: remaining.length > 0 ? JSON.stringify(remaining) : null },
              });
            }
          }
        } catch { /* fall through to twoFactorOk=false */ }
      }

      if (!twoFactorOk) {
        return NextResponse.json(
          { needs2FA: true, error: "Invalid 2FA code" },
          { status: 401 }
        );
      }
    }
    // --- end 2FA gate ---------------------------------------------------

    const permissions = await getRolePermissions(user.role);
    const token = await createAdminSessionToken(
      user.userId,
      user.role,
      user.name,
      permissions,
      !!rememberMe,
      user.clientId
    );

    const response = NextResponse.json({
      user: { id: user.userId, name: user.name, role: user.role, permissions },
      mustChangePassword: user.mustChangePassword,
    });

    setAdminSessionCookie(response, token, !!rememberMe);
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
