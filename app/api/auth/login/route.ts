import { NextResponse } from "next/server";
import {
  verifyPassword,
  createAdminSessionToken,
  setAdminSessionCookie,
  ensureDefaultAdmin,
} from "@/lib/admin-auth";
import { getRolePermissions } from "@/lib/permissions";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    // Rate limit: 10 attempts per 15 minutes per IP
    const ip = getClientIp(request);
    const { limited, resetAt } = rateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) },
        }
      );
    }

    // Ensure default admin exists on first-ever login attempt
    const created = await ensureDefaultAdmin();
    if (created) {
      console.log("Default admin user created on first login");
    }

    const { email, password, rememberMe } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await verifyPassword(email.toLowerCase().trim(), password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const permissions = await getRolePermissions(user.role);
    const token = await createAdminSessionToken(
      user.userId,
      user.role,
      user.name,
      permissions,
      !!rememberMe
    );

    const response = NextResponse.json({
      user: { id: user.userId, name: user.name, role: user.role, permissions },
      mustChangePassword: user.mustChangePassword,
    });

    setAdminSessionCookie(response, token, !!rememberMe);
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
