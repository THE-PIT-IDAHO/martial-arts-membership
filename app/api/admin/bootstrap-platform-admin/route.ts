import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSessionFromRequest } from "@/lib/admin-auth";

// One-shot fix to set Client.isPlatformAdmin = true on the gym the
// currently signed-in OWNER belongs to. Without this flag, the
// /admin/gyms page returns 403 because requireOwner won't accept the
// session. New gyms get isPlatformAdmin = false by default (per the
// schema), so the very first platform admin needs a way to flip it.
//
// Gating: must be hit with a valid admin session whose email matches
// the BOOTSTRAP_ADMIN_EMAIL env var. The env var has no default and
// the endpoint is a no-op without it — so once you've used it, just
// remove the env var and the route is inert.
//
// GET so it can be triggered from a browser address bar.
export async function GET(req: NextRequest) {
  const expectedEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!expectedEmail) {
    return NextResponse.json(
      { error: "BOOTSTRAP_ADMIN_EMAIL env var is not set; endpoint disabled" },
      { status: 503 },
    );
  }

  const session = await getAdminSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { error: `Your role is ${session.role}, must be OWNER` },
      { status: 403 },
    );
  }
  if (!session.clientId) {
    return NextResponse.json({ error: "Session has no clientId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, clientId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.email.toLowerCase() !== expectedEmail.toLowerCase()) {
    return NextResponse.json(
      { error: `Signed-in email (${user.email}) does not match BOOTSTRAP_ADMIN_EMAIL` },
      { status: 403 },
    );
  }

  const before = await prisma.client.findUnique({
    where: { id: user.clientId },
    select: { id: true, slug: true, name: true, isPlatformAdmin: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (before.isPlatformAdmin) {
    return NextResponse.json({
      ok: true,
      message: "Already a platform admin — no change",
      client: before,
    });
  }

  const after = await prisma.client.update({
    where: { id: user.clientId },
    data: { isPlatformAdmin: true },
    select: { id: true, slug: true, name: true, isPlatformAdmin: true },
  });

  return NextResponse.json({
    ok: true,
    message: `Promoted ${after.name} to platform admin. Refresh /admin/gyms.`,
    client: after,
  });
}
