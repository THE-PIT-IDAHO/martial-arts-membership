import { prisma } from "@/lib/prisma";
import { randomBytes, createHmac, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "portal_session";
const VIEWING_AS_COOKIE = "portal_viewing_as";
const SESSION_DURATION_DAYS = 30;
const TOKEN_EXPIRY_MINUTES = 15;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

function signToken(token: string): string {
  return createHmac("sha256", getSecret()).update(token).digest("hex");
}

/**
 * Hash a token for storage. Auth tokens are high-entropy random bytes, so
 * a plain SHA-256 (no salt, no bcrypt cost) is sufficient — the purpose is
 * to ensure a DB leak doesn't yield usable session / magic-link tokens, not
 * to slow down a password-cracking attack.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// --- Magic Link Tokens ---

export async function generateMagicLinkToken(
  memberId: string,
  email: string,
  expiresInMinutes: number = TOKEN_EXPIRY_MINUTES,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  // Only the hash is persisted — the raw token leaves over the email URL.
  await prisma.memberAuthToken.create({
    data: { token: hashToken(token), memberId, email, expiresAt },
  });

  return token;
}

export async function validateMagicLinkToken(
  token: string
): Promise<{ memberId: string; email: string } | null> {
  const record = await prisma.memberAuthToken.findUnique({
    where: { token: hashToken(token) },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < new Date()) return null;

  await prisma.memberAuthToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { memberId: record.memberId, email: record.email };
}

// --- Sessions ---

export async function createMemberSession(memberId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  // Session row stores hash; the raw token is set as the portal_session cookie.
  await prisma.memberSession.create({
    data: { token: hashToken(token), memberId, expiresAt },
  });

  return token;
}

export async function validateMemberSession(
  token: string
): Promise<{ memberId: string } | null> {
  const session = await prisma.memberSession.findUnique({
    where: { token: hashToken(token) },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.memberSession.delete({ where: { id: session.id } });
    return null;
  }

  return { memberId: session.memberId };
}

export async function destroyMemberSession(token: string): Promise<void> {
  await prisma.memberSession
    .delete({ where: { token: hashToken(token) } })
    .catch(() => {});
}

// --- Cookie Helpers ---

export function getSessionTokenFromRequest(request: NextRequest): string | null {
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return null;

  const parts = cookie.value.split(".");
  if (parts.length !== 2) return null;

  const [token, sig] = parts;
  const expected = signToken(token);
  if (sig !== expected) return null;

  return token;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  const signed = `${token}.${signToken(token)}`;
  response.cookies.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// --- Viewing-As (parent acting on behalf of a related child) ---
// Stored in a separate signed cookie. getAuthenticatedMember resolves it
// against MemberRelationship on every request so that data ops auto-route
// to whichever account the parent has switched into.

function getViewingAsFromRequest(request: NextRequest): string | null {
  const cookie = request.cookies.get(VIEWING_AS_COOKIE);
  if (!cookie?.value) return null;
  const parts = cookie.value.split(".");
  if (parts.length !== 2) return null;
  const [token, sig] = parts;
  if (sig !== signToken(token)) return null;
  return token;
}

export function setViewingAsCookie(response: NextResponse, memberId: string): void {
  const signed = `${memberId}.${signToken(memberId)}`;
  response.cookies.set(VIEWING_AS_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });
}

export function clearViewingAsCookie(response: NextResponse): void {
  response.cookies.set(VIEWING_AS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// --- Request Auth Helper (for API routes) ---
//
// `memberId` is the EFFECTIVE member — equals sessionMemberId unless the
// signed-in member is currently "viewing as" a related child, in which
// case it's the child's id. Most routes should use memberId so they
// automatically operate on whoever the user has switched into.
//
// `sessionMemberId` is the real logged-in user. Use this for identity
// concerns (password change, logout, the switcher itself).

export async function getAuthenticatedMember(
  request: NextRequest
): Promise<{ memberId: string; sessionMemberId: string } | null> {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  const session = await validateMemberSession(token);
  if (!session) return null;

  const viewingAs = getViewingAsFromRequest(request);
  if (viewingAs && viewingAs !== session.memberId) {
    // Confirm the session member actually has a relationship to the target.
    const rel = await prisma.memberRelationship.findFirst({
      where: { fromMemberId: session.memberId, toMemberId: viewingAs },
      select: { id: true },
    });
    if (rel) {
      return { memberId: viewingAs, sessionMemberId: session.memberId };
    }
  }

  return { memberId: session.memberId, sessionMemberId: session.memberId };
}

// --- Password Reset Tokens ---

export async function generatePasswordResetToken(
  memberId: string,
  email: string
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await prisma.memberAuthToken.create({
    data: { token: hashToken(token), memberId, email, expiresAt },
  });

  return token;
}

export async function validatePasswordResetToken(
  token: string
): Promise<{ memberId: string; email: string } | null> {
  const record = await prisma.memberAuthToken.findUnique({
    where: { token: hashToken(token) },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt < new Date()) return null;

  await prisma.memberAuthToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { memberId: record.memberId, email: record.email };
}

// --- Password Hashing ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- Invalidate All Sessions for a Member ---

export async function invalidateAllMemberSessions(
  memberId: string
): Promise<void> {
  await prisma.memberSession.deleteMany({ where: { memberId } });
}
