import { NextResponse } from "next/server";
import {
  validateMagicLinkToken,
  createMemberSession,
  setSessionCookie,
} from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const result = await validateMagicLinkToken(token);
    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired link. Please request a new one." },
        { status: 401 }
      );
    }

    const member = await prisma.member.findUnique({
      where: { id: result.memberId },
      select: { id: true, firstName: true, lastName: true, photoUrl: true, portalPasswordHash: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const sessionToken = await createMemberSession(member.id);

    const response = NextResponse.json({
      success: true,
      hasPassword: !!member.portalPasswordHash,
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        photoUrl: member.photoUrl,
      },
    });

    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    console.error("Error verifying token:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
