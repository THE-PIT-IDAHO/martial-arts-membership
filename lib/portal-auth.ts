import { prisma } from "@/lib/prisma";
import { randomBytes, createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "portal_session";
const SESSION_DURATION_DAYS = 30;
const TOKEN_EXPIRY_MINUTES = 15;

function getSecret(): string {
  return process.env.JWT_SECRET || "fallback-dev-secret";
}

function signToken(token: string): string {
  return createHmac("sha256", getSecret()).update(token).digest("hex");
}

// --- Magic Link Tokens ---

export async function generateMagicLinkToken(
  memberId: string,
  email: string
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await prisma.memberAuthToken.create({
    data: { token, memberId, email, expiresAt },
  });

  return token;
}

export async function validateMagicLinkToken(
  token: string
): Promise<{ memberId: string; email: string } | null> {
  const record = await prisma.memberAuthToken.findUnique({ where: { token } });

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

  await prisma.memberSession.create({
    data: { token, memberId, expiresAt },
  });

  return token;
}

export async function validateMemberSession(
  token: string
): Promise<{ memberId: string } | null> {
  const session = await prisma.memberSession.findUnique({ where: { token } });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.memberSession.delete({ where: { id: session.id } });
    return null;
  }

  return { memberId: session.memberId };
}

export async function destroyMemberSession(token: string): Promise<void> {
  await prisma.memberSession
    .delete({ where: { token } })
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

// --- Request Auth Helper (for API routes) ---

export async function getAuthenticatedMember(
  request: NextRequest
): Promise<{ memberId: string } | null> {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  return validateMemberSession(token);
}

// --- Password Reset Tokens ---

export async function generatePasswordResetToken(
  memberId: string,
  email: string
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await prisma.memberAuthToken.create({
    data: { token, memberId, email, expiresAt },
  });

  return token;
}

export async function validatePasswordResetToken(
  token: string
): Promise<{ memberId: string; email: string } | null> {
  const record = await prisma.memberAuthToken.findUnique({ where: { token } });

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
