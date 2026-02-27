import { NextRequest, NextResponse } from "next/server";
import { validateAdminSessionToken } from "@/lib/admin-auth";
import { getPermissionForRoute } from "@/lib/permissions";

const PORTAL_COOKIE = "portal_session";
const ADMIN_COOKIE = "admin_session";
const TENANT_SLUG_HEADER = "x-tenant-slug";

// Default slug for localhost / app.dojostormsoftware.com
const DEFAULT_SLUG = "app";

// Portal public routes (no auth required)
const PUBLIC_PORTAL_PAGES = ["/portal/login", "/portal/verify", "/portal/enroll", "/portal/reset-password"];
const PUBLIC_API_PREFIXES = [
  "/api/portal/auth/",
  "/api/portal/enroll",
  "/api/portal/plans",
];

// Admin public routes (no auth required)
const ADMIN_PUBLIC = ["/login", "/kiosk", "/waivers/new", "/waiver/sign"];
const ADMIN_PUBLIC_API_PREFIXES = ["/api/auth/", "/api/public/"];

function isPublicPortalPath(pathname: string): boolean {
  if (PUBLIC_PORTAL_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }
  return false;
}

function isPublicAdminPath(pathname: string): boolean {
  if (ADMIN_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (ADMIN_PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }
  return false;
}

/**
 * Extract subdomain from host.
 * "thepitidaho.dojostormsoftware.com" → "thepitidaho"
 * "app.dojostormsoftware.com" → "app"
 * "localhost:3000" → null (use default)
 */
function extractSubdomain(host: string): string | null {
  const hostname = host.split(":")[0];
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    return parts[0];
  }
  return null;
}

/** Create a NextResponse.next() with the tenant slug header injected */
function nextWithTenant(request: NextRequest, slug: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_SLUG_HEADER, slug);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Resolve tenant slug from subdomain ---
  const host = request.headers.get("host") || "localhost:3000";
  const subdomain = extractSubdomain(host);
  const tenantSlug = subdomain || DEFAULT_SLUG;

  // --- Portal routes ---
  const isPortalPage = pathname.startsWith("/portal");
  const isPortalApi = pathname.startsWith("/api/portal");

  if (isPortalPage || isPortalApi) {
    if (isPublicPortalPath(pathname)) {
      return nextWithTenant(request, tenantSlug);
    }
    const cookie = request.cookies.get(PORTAL_COOKIE);
    if (!cookie?.value) {
      if (isPortalApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/portal/login", request.url));
    }
    return nextWithTenant(request, tenantSlug);
  }

  // --- Admin routes (everything else matched by config) ---
  if (isPublicAdminPath(pathname)) {
    return nextWithTenant(request, tenantSlug);
  }

  // Check admin session cookie
  const adminCookie = request.cookies.get(ADMIN_COOKIE);
  if (!adminCookie?.value) {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Validate session token and check permissions
  const session = await validateAdminSessionToken(adminCookie.value);
  if (!session) {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check route-level permission
  const requiredPerm = getPermissionForRoute(pathname);
  if (requiredPerm && !session.permissions.includes(requiredPerm)) {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return nextWithTenant(request, tenantSlug);
}

export const config = {
  matcher: [
    // Portal routes
    "/portal/:path*",
    "/api/portal/:path*",
    // Admin routes — everything except static assets and uploads
    "/((?!_next|favicon|icons|belts|manifest|uploads|sw\\.js|.*\\.png|.*\\.svg|.*\\.ico|.*\\.pdf).*)",
  ],
};
