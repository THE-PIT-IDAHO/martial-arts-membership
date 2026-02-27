import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateMagicLinkToken,
  createMemberSession,
  setSessionCookie,
  verifyPassword,
} from "@/lib/portal-auth";
import { sendMagicLinkEmail } from "@/lib/notifications";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getClientId } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 attempts per 15 minutes per IP
    const ip = getClientIp(req);
    const { limited } = rateLimit(`portal-login:${ip}`, 10, 15 * 60 * 1000);
    if (limited) {
      // Return success to prevent enumeration, but don't process
      return NextResponse.json({ success: true });
    }

    const { email, password } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: true });
    }

    // Resolve tenant from subdomain to scope member lookup
    let clientId: string | undefined;
    try {
      clientId = await getClientId(req);
    } catch {
      // Fall back to unscoped lookup
    }

    const member = await prisma.member.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        status: { not: "INACTIVE" },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        portalPasswordHash: true,
      },
    });

    // --- Password login path ---
    if (password && typeof password === "string") {
      if (!member || !member.portalPasswordHash) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      const valid = await verifyPassword(password, member.portalPasswordHash);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      // Create session and set cookie
      const sessionToken = await createMemberSession(member.id);
      const response = NextResponse.json({ success: true, session: true });
      setSessionCookie(response, sessionToken);
      return response;
    }

    // --- Magic link path (unchanged) ---
    if (member && member.email) {
      const token = await generateMagicLinkToken(member.id, member.email);
      const baseUrl = req.headers.get("origin") || req.headers.get("host") || "";
      const protocol = baseUrl.startsWith("http") ? "" : "http://";
      const loginUrl = `${protocol}${baseUrl}/portal/verify?token=${token}`;

      // In dev mode, return the login URL directly (no email needed)
      if (process.env.NODE_ENV !== "production") {
        return NextResponse.json({ success: true, devLoginUrl: loginUrl });
      }

      await sendMagicLinkEmail({
        email: member.email,
        memberName: `${member.firstName} ${member.lastName}`,
        loginUrl,
      });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in portal login:", error);
    return NextResponse.json({ success: true });
  }
}
