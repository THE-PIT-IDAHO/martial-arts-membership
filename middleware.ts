import { NextRequest, NextResponse } from "next/server";
import { validateAdminSessionToken } from "@/lib/admin-auth";
import { getPermissionForRoute } from "@/lib/permissions";

const PORTAL_COOKIE = "portal_session";
const ADMIN_COOKIE = "admin_session";
const TENANT_SLUG_HEADER = "x-tenant-slug";
const CRON_MODE_HEADER = "x-cron-mode";

// API paths Vercel cron hits. These bypass admin auth iff the request
// carries a valid CRON_SECRET (Vercel sends `Authorization: Bearer
// ${CRON_SECRET}` automatically when the env var is set). Without that
// env var, the path falls through to the normal admin-auth check —
// matching what dashboard callers already do.
const CRON_API_PATHS = [
  "/api/billing/auto-run",
  "/api/lifecycle/auto-run",
  "/api/admin/cleanup",
  "/api/cron/",
];

// Default slug for localhost / bare domain / "app" subdomain
// The Client record in DB was created with slug "app" by migrate-tenant.ts
const DEFAULT_SLUG = "app";

// Map subdomains to their DB slug if different
// Production client slug is "thepitidaho"; "app" subdomain aliases to it
const SLUG_ALIASES: Record<string, string> = {
  app: "thepitidaho",
};

// Portal public routes (no auth required)
const PUBLIC_PORTAL_PAGES = ["/portal/login", "/portal/verify", "/portal/enroll", "/portal/reset-password"];
const PUBLIC_API_PREFIXES = [
  "/api/portal/auth/",
  "/api/portal/enroll",
  "/api/portal/plans",
];

// Admin public routes (no auth required)
const ADMIN_PUBLIC = ["/login", "/signup", "/forgot-password", "/reset-password", "/kiosk", "/waivers/new", "/waivers/sign", "/waiver/sign", "/waiver/add-child"];
const ADMIN_PUBLIC_API_PREFIXES = ["/api/auth/", "/api/public/", "/api/waivers/add-child", "/api/webhooks/"];

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

  // --- Admin subdomain: admin.dojostormsoftware.com ---
  if (subdomain === "admin") {
    // Only allow /admin/* paths and /login on the admin subdomain
    if (!pathname.startsWith("/admin") && pathname !== "/login" && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/admin")) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    // Route to platform owner's client
    return nextWithTenant(request, "thepitidaho");
  }

  // Treat "app" subdomain as default, and resolve aliases for branded subdomains
  const rawSlug = (!subdomain || subdomain === "app") ? DEFAULT_SLUG : subdomain;
  const tenantSlug = SLUG_ALIASES[rawSlug] || rawSlug;

  // --- Cron-authenticated paths ---
  // If the request carries a matching CRON_SECRET, let it through with
  // x-cron-mode set and skip admin-cookie validation. The downstream route
  // uses x-cron-mode to fan out across every tenant instead of treating
  // this as a single-tenant dashboard call.
  const isCronPath = CRON_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
  if (isCronPath) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(TENANT_SLUG_HEADER, tenantSlug);
      requestHeaders.set(CRON_MODE_HEADER, "true");
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    // No secret set or mismatch — fall through to normal admin-auth path
    // so the dashboard "Run billing now" button still works.
  }

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

  // --- Public admin routes (no auth required) ---
  if (isPublicAdminPath(pathname)) {
    return nextWithTenant(request, tenantSlug);
  }

  // --- Admin routes ---

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

  // Check route-level permission. OWNER always passes -- they have
  // full access by definition. This also avoids the "old session
  // JWT doesn't have a permission key we added after login" trap:
  // /api/auth/me recomputes permissions for the client, but the
  // JWT snapshot the middleware sees is still frozen at login time,
  // so without this bypass an OWNER would get redirected off a new
  // route (e.g. /setup) until they logged out and back in.
  const requiredPerm = getPermissionForRoute(pathname);
  if (
    requiredPerm &&
    session.role !== "OWNER" &&
    !session.permissions.includes(requiredPerm)
  ) {
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
    // Admin routes — everything except static assets, uploads, and public
    // pages. NOTE: do NOT exclude .pdf here. Rank curriculum PDF URLs now
    // end in a friendly filename like ".../Yellow Belt.pdf" so the middleware
    // needs to run on them to set the x-tenant-slug header — otherwise
    // getClientId() throws and the route 500s with "Failed to load PDF".
    "/((?!_next|favicon|icons|belts|manifest|uploads|sw\\.js|signup|forgot-password|reset-password|.*\\.png|.*\\.svg|.*\\.ico).*)",
  ],
};
