import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getAdminSessionFromRequest, hashPassword } from "@/lib/admin-auth";
import { getRolePermissions, DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";

/**
 * Manage the admin-login access tied to a Member's profile.
 *
 * Gates: every method requires the caller to be OWNER or ADMIN on the
 * SAME tenant as the target member. Middleware has already verified
 * they hold an "account" permission (Users & Access sits under
 * /account), but membership admin grants are dangerous enough to
 * warrant the explicit role check here too.
 *
 * A Member.userId FK ties one User row to one Member. Granting creates
 * the User + populates Member.userId; revoking deletes the User and
 * (via SetNull) blanks the FK. Role changes just update the User row.
 */

const ALLOWED_ROLES = new Set(["OWNER", "ADMIN", "COACH", "FRONT_DESK"]);
const ALLOWED_SCOPES = new Set(["all", "own"]);

async function requireGrantingAdmin(req: NextRequest, clientId: string) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) return null;
  if (session.clientId && session.clientId !== clientId) return null;
  if (session.role !== "OWNER" && session.role !== "ADMIN") return null;
  return session;
}

async function loadMember(memberId: string, clientId: string) {
  return prisma.member.findFirst({
    where: { id: memberId, clientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      userId: true,
      linkedUser: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          classScope: true,
          mustChangePassword: true,
          totpEnabled: true,
        },
      },
    },
  });
}

/**
 * GET — return current admin-access state for the member. Includes the
 * default class scope for the member's current linked role (or COACH
 * if no user yet) so the modal can preview what a new grant would
 * default to.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = await getClientId(req);
  const caller = await requireGrantingAdmin(req, clientId);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const member = await loadMember(id, clientId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Permission menu the caller sees for each role. Uses per-tenant
  // overrides when present, falls back to DEFAULT_ROLE_PERMISSIONS.
  // Same source of truth the login flow uses so what the modal shows
  // matches what the granted user actually gets.
  const rolePermissions: Record<string, string[]> = {};
  for (const role of ["OWNER", "ADMIN", "COACH", "FRONT_DESK"]) {
    rolePermissions[role] = await getRolePermissions(role);
  }

  return NextResponse.json({
    member: {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      status: member.status,
    },
    adminAccess: member.linkedUser
      ? {
          userId: member.linkedUser.id,
          email: member.linkedUser.email,
          name: member.linkedUser.name,
          role: member.linkedUser.role,
          classScope: member.linkedUser.classScope,
          mustChangePassword: member.linkedUser.mustChangePassword,
          totpEnabled: member.linkedUser.totpEnabled,
        }
      : null,
    rolePermissions,
    // Ship the ALL_PERMISSION_KEYS shape via DEFAULT_ROLE_PERMISSIONS
    // so the modal can label each permission consistently.
    defaultRoleTemplate: DEFAULT_ROLE_PERMISSIONS,
  });
}

/**
 * POST — grant admin access. Creates a User row using the member's
 * email (or an override in the body), a temporary password, and the
 * requested role. Links Member.userId. Returns the temp password so
 * the admin can hand it over in person; separately marks
 * mustChangePassword so the granted user is forced to rotate on first
 * login.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = await getClientId(req);
  const caller = await requireGrantingAdmin(req, clientId);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const member = await loadMember(id, clientId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (member.userId) return NextResponse.json({ error: "Member already has admin access" }, { status: 400 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const email = String(body.email || member.email || "").trim().toLowerCase();
  const role = String(body.role || "COACH").toUpperCase();
  const classScope = String(body.classScope || (role === "COACH" ? "own" : "all")).toLowerCase();

  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  if (!ALLOWED_ROLES.has(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (!ALLOWED_SCOPES.has(classScope)) return NextResponse.json({ error: "Invalid classScope" }, { status: 400 });

  // Only OWNERs can grant OWNER. Otherwise an ADMIN could self-promote
  // by granting OWNER to a member they control.
  if (role === "OWNER" && caller.role !== "OWNER") {
    return NextResponse.json({ error: "Only an OWNER can grant OWNER access" }, { status: 403 });
  }

  // Reject when the email already belongs to a different tenant user.
  const existingEmailUser = await prisma.user.findFirst({
    where: { email, clientId },
    select: { id: true },
  });
  if (existingEmailUser) {
    return NextResponse.json({ error: "That email is already in use by another admin user" }, { status: 409 });
  }

  // Random-ish temp password. 12 chars from a URL-safe alphabet so it
  // reads cleanly if the admin dictates it to the new user.
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const displayName = `${member.firstName || ""} ${member.lastName || ""}`.trim() || null;

  const user = await prisma.user.create({
    data: {
      email,
      name: displayName,
      role,
      classScope,
      passwordHash,
      mustChangePassword: true,
      clientId,
    },
  });
  await prisma.member.update({
    where: { id: member.id },
    data: { userId: user.id, accessRole: role },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    role: user.role,
    classScope: user.classScope,
    // Returned ONE time to the granting admin so they can hand it
    // over. Never stored anywhere else -- it's already hashed on the
    // User row.
    tempPassword,
  });
}

/**
 * PATCH — update role / classScope / mustChangePassword flag on the
 * linked User. Same OWNER-guard on role promotion applies.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = await getClientId(req);
  const caller = await requireGrantingAdmin(req, clientId);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const member = await loadMember(id, clientId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (!member.userId || !member.linkedUser) {
    return NextResponse.json({ error: "Member has no admin access to update" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const updateData: Record<string, unknown> = {};

  if (typeof body.role === "string") {
    const role = body.role.toUpperCase();
    if (!ALLOWED_ROLES.has(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (role === "OWNER" && caller.role !== "OWNER") {
      return NextResponse.json({ error: "Only an OWNER can grant OWNER access" }, { status: 403 });
    }
    updateData.role = role;
  }
  if (typeof body.classScope === "string") {
    const cs = body.classScope.toLowerCase();
    if (!ALLOWED_SCOPES.has(cs)) return NextResponse.json({ error: "Invalid classScope" }, { status: 400 });
    updateData.classScope = cs;
  }
  if (typeof body.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    if (email !== member.linkedUser.email) {
      const clash = await prisma.user.findFirst({
        where: { email, clientId, id: { not: member.userId } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
      updateData.email = email;
    }
  }

  // Optional password reset in the same call. Returns the new temp
  // password once so the admin can hand it over.
  let tempPassword: string | undefined;
  if (body.resetPassword === true) {
    tempPassword = generateTempPassword();
    updateData.passwordHash = await hashPassword(tempPassword);
    updateData.mustChangePassword = true;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const updated = await prisma.user.update({
    where: { id: member.userId },
    data: updateData,
    select: { role: true, classScope: true, email: true },
  });
  // Keep Member.accessRole in step with the linked User so the existing
  // Users & Access role-assignments view stays coherent.
  if (updateData.role) {
    await prisma.member.update({
      where: { id: member.id },
      data: { accessRole: updated.role },
    });
  }

  return NextResponse.json({
    ok: true,
    role: updated.role,
    classScope: updated.classScope,
    email: updated.email,
    tempPassword,
  });
}

/**
 * DELETE — revoke admin access. Deletes the linked User row; the
 * Member.userId FK is set null by the schema's onDelete SetNull.
 * accessRole is cleared so nothing on the member row still hints at
 * admin access.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = await getClientId(req);
  const caller = await requireGrantingAdmin(req, clientId);
  if (!caller) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const member = await loadMember(id, clientId);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (!member.userId) return NextResponse.json({ ok: true, skipped: "no-access" });

  // Refuse to revoke access from the caller themselves -- avoids the
  // "locked myself out" foot-gun.
  if (caller.userId === member.userId) {
    return NextResponse.json({ error: "You can't revoke your own admin access" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: member.userId } });
  await prisma.member.update({
    where: { id: member.id },
    data: { accessRole: null, userId: null },
  });
  return NextResponse.json({ ok: true, revoked: true });
}

/**
 * URL-safe 12-char temp password. Enough entropy for a one-shot
 * hand-off ("here's your login, change it on first sign-in"); the
 * mustChangePassword flag forces rotation before real use.
 */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
