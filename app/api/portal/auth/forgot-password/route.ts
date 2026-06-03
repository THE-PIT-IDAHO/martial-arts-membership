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

    const cleanEmail = email.trim().toLowerCase();

    // Find member by email — don't reveal to the caller if email exists,
    // but log every outcome so admins/devs can diagnose why a member said
    // "it didn't work." Each branch below console.log()s with a [forgot-password]
    // prefix; check Vercel function logs to see what happened.
    const member = await prisma.member.findFirst({
      where: { email: cleanEmail, clientId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!member) {
      // Was the email registered at a DIFFERENT gym? Common failure mode:
      // member typed the wrong subdomain (or hit a bookmark for the
      // generic /portal/login). We don't auto-redirect because that
      // would leak cross-tenant membership, but we DO log it so the
      // admin can tell the member "try yourgym.dojostormsoftware.com".
      const elsewhere = await prisma.member.findFirst({
        where: { email: cleanEmail },
        select: { client: { select: { slug: true, name: true } } },
      });
      if (elsewhere) {
        console.warn(
          `[forgot-password] email=${cleanEmail} not found in tenant=${clientId} ` +
          `but IS in tenant=${elsewhere.client?.slug} (${elsewhere.client?.name}). ` +
          `Member is probably on the wrong subdomain.`,
        );
      } else {
        console.warn(`[forgot-password] email=${cleanEmail} not found in ANY tenant`);
      }
      // Still return success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    if (!member.email) {
      console.warn(`[forgot-password] member=${member.id} matched but has no email field`);
      return NextResponse.json({ success: true });
    }

    const token = await generatePasswordResetToken(member.id, member.email);

    const origin =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const resetUrl = `${protocol}://${origin}/portal/reset-password?token=${token}`;

    // Pass clientId explicitly so the template resolver and email log
    // hit the correct tenant — the admin-triggered path does this and
    // is the version that's been confirmed working.
    const result = await sendPasswordResetEmail({
      email: member.email,
      memberName: `${member.firstName} ${member.lastName}`.trim(),
      resetUrl,
      memberId: member.id,
      clientId,
    });

    if (!result.ok) {
      console.error(
        `[forgot-password] send failed for member=${member.id} email=${member.email}: ${result.error}`,
      );
    } else {
      console.log(`[forgot-password] sent OK to member=${member.id} email=${member.email}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[forgot-password] unexpected error:", err);
    // Still return success to prevent email enumeration
    return NextResponse.json({ success: true });
  }
}
