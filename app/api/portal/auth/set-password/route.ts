import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember, hashPassword } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMember(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await request.json();

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const portalPasswordHash = await hashPassword(password);
    await prisma.member.update({
      where: { id: auth.memberId },
      data: { portalPasswordHash },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Set password error:", err);
    return NextResponse.json(
      { error: "Failed to set password" },
      { status: 500 }
    );
  }
}
