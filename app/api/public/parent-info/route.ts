import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/public/parent-info?memberId=...
// Returns minimal parent info so the public add-child waiver page can greet them.
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ parent: member });
}
