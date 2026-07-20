import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const session = await getAdminSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch fresh user data
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Recompute permissions from the current role rather than trusting
  // the JWT snapshot. Old sessions won't have permission keys that
  // were added after they logged in (e.g. "setup"), and forcing a
  // logout every time we add a permission is not a great UX. This
  // adds one small DB read per /api/auth/me call.
  const permissions = await getRolePermissions(user.role);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions,
    },
  });
}
