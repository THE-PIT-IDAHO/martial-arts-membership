import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember, setViewingAsCookie, clearViewingAsCookie } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// POST /api/portal/switch-account — switch the portal view to a related
// member (child). Body: { memberId } where memberId can be the parent's
// own id (to switch back to self) or any child the parent has a
// MemberRelationship to.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { memberId } = body;
  if (!memberId) {
    return NextResponse.json({ error: "memberId required" }, { status: 400 });
  }

  // Self → clear the cookie so future reads fall through to session member.
  if (memberId === auth.sessionMemberId) {
    const res = NextResponse.json({ success: true, viewingAs: auth.sessionMemberId });
    clearViewingAsCookie(res);
    return res;
  }

  // Switching to a related member — must have a MemberRelationship where
  // the signed-in member is the parent/guardian.
  const rel = await prisma.memberRelationship.findFirst({
    where: { fromMemberId: auth.sessionMemberId, toMemberId: memberId },
    select: { id: true },
  });
  if (!rel) {
    return NextResponse.json({ error: "Not authorized to view this account" }, { status: 403 });
  }

  const res = NextResponse.json({ success: true, viewingAs: memberId });
  setViewingAsCookie(res, memberId);
  return res;
}
