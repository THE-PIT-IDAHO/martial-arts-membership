import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import {
  createAdminSessionToken,
  setAdminSessionCookie,
} from "@/lib/admin-auth";
import { getRolePermissions } from "@/lib/permissions";

/**
 * GET /api/portal/admin-handoff
 *
 * Signed-in member portal -> admin app single-tap handoff. The Admin
 * pill on the member portal profile navigates here; if the caller
 * has admin login access linked to their Member row, we mint the
 * admin session cookie in-place and redirect them to /dashboard.
 * No second login prompt.
 *
 * Auth: relies on the portal member session (getAuthenticatedMember).
 *   Refuses if there's no portal auth OR if the member has no
 *   linked User row / no admin role. Middleware still enforces
 *   permission gates once the admin cookie is set, so a coach with
 *   a limited permission set still can't reach areas outside their
 *   role.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    // Portal isn't authenticated -- send them to the portal login,
    // which will bounce them back here after they sign in. Keeps the
    // "one login" promise: they log in ONCE (portal), tap the pill,
    // land on admin.
    return NextResponse.redirect(new URL("/portal/login?next=/portal/profile", req.url));
  }

  // Load the linked User row. viewing-as (parent viewing child) is
  // NOT allowed to hand off -- the admin session must belong to the
  // logged-in member themselves, not the child they're viewing.
  const member = await prisma.member.findUnique({
    where: { id: auth.sessionMemberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      accessRole: true,
      linkedUser: {
        select: { id: true, role: true, name: true, clientId: true },
      },
    },
  });

  if (!member) {
    return NextResponse.redirect(new URL("/portal/profile?err=member", req.url));
  }
  if (!member.linkedUser) {
    // Portal member without admin access -- shouldn't have seen the
    // pill in the first place, but guard anyway. Send them back with
    // a hint so the client can surface a message.
    return NextResponse.redirect(new URL("/portal/profile?err=no-admin", req.url));
  }

  // Resolve the current permission list for the linked user's role
  // (tenant-customized when Users & Access overrides exist). Session
  // token stores the resolved permissions so middleware doesn't have
  // to re-fetch per request.
  const permissions = await getRolePermissions(member.linkedUser.role);
  const displayName =
    member.linkedUser.name ||
    `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
    "Admin";

  const token = await createAdminSessionToken(
    member.linkedUser.id,
    member.linkedUser.role,
    displayName,
    permissions,
    false, // don't "remember me" -- short-lived is safer for a phone tap
    member.linkedUser.clientId,
  );

  // Redirect first, then set the cookie on the redirect response so
  // /dashboard sees the fresh cookie on its very first request.
  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  setAdminSessionCookie(res, token, false);
  return res;
}
