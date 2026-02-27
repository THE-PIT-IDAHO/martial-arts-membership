import { NextRequest, NextResponse } from "next/server";

const ADMIN_COOKIE = "admin_session";
const SESSION_SHORT_DAYS = 7;
const SESSION_LONG_DAYS = 90; // "Stay logged in"

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "replace-with-a-long-random-string") {
    throw new Error(
      "JWT_SECRET environment variable is not set. Generate a strong random secret (64+ characters) and set it in your .env file."
    );
  }
  return secret;
}

// Edge-compatible HMAC-SHA256 signing using Web Crypto API
async function signPayload(data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Stateless Session Token (no DB model needed) ---

export async function createAdminSessionToken(
  userId: string,
  role: string,
  name: string,
  permissions: string[],
  rememberMe = false
): Promise<string> {
  const days = rememberMe ? SESSION_LONG_DAYS : SESSION_SHORT_DAYS;
  const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ userId, role, name, permissions, expiresAt });
  const encoded = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sig = await signPayload(encoded);
  return `${encoded}.${sig}`;
}

export async function validateAdminSessionToken(
  token: string
): Promise<{ userId: string; role: string; name: string; permissions: string[] } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if ((await signPayload(encoded)) !== sig) return null;
  try {
    // Restore base64 padding for atob
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded));
    if (payload.expiresAt < Date.now()) return null;
    return {
      userId: payload.userId,
      role: payload.role,
      name: payload.name || "",
      permissions: payload.permissions || [],
    };
  } catch {
    return null;
  }
}

export async function getAdminSessionFromRequest(
  request: NextRequest
): Promise<{ userId: string; role: string; name: string; permissions: string[] } | null> {
  const cookie = request.cookies.get(ADMIN_COOKIE);
  if (!cookie?.value) return null;
  return validateAdminSessionToken(cookie.value);
}

export function setAdminSessionCookie(
  response: NextResponse,
  token: string,
  rememberMe = false
): void {
  const days = rememberMe ? SESSION_LONG_DAYS : SESSION_SHORT_DAYS;
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: days * 24 * 60 * 60,
  });
}

export function clearAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// --- Password Utilities (only used in API routes, not middleware) ---
// These use dynamic imports to avoid pulling bcryptjs/prisma into Edge Runtime

export async function verifyPassword(
  email: string,
  password: string
): Promise<{ userId: string; role: string; name: string; mustChangePassword: boolean } | null> {
  const { prisma } = await import("@/lib/prisma");
  const { compare } = await import("bcryptjs");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const valid = await compare(password, user.passwordHash);
  if (!valid) return null;
  return { userId: user.id, role: user.role, name: user.name || "", mustChangePassword: user.mustChangePassword };
}

export async function hashPassword(password: string): Promise<string> {
  const { hash } = await import("bcryptjs");
  return hash(password, 12);
}

// --- First-run: ensure at least one admin exists ---

export async function ensureDefaultAdmin(): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const { hash } = await import("bcryptjs");
  const count = await prisma.user.count();
  if (count > 0) return false;

  // Generate a random temporary password for the default admin
  const tempPassword = crypto.randomUUID().slice(0, 16);
  const passwordHash = await hash(tempPassword, 12);
  await prisma.user.create({
    data: {
      email: "admin@gym.com",
      passwordHash,
      name: "Owner",
      role: "OWNER",
      mustChangePassword: true,
      clientId: "default-client",
    },
  });

  console.log("=".repeat(60));
  console.log("DEFAULT ADMIN CREATED");
  console.log("Email:    admin@gym.com");
  console.log(`Password: ${tempPassword}`);
  console.log("CHANGE THIS PASSWORD IMMEDIATELY after first login.");
  console.log("=".repeat(60));

  return true;
}
