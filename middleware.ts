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

// Map subdomains to their DB slug if different.
// "app" subdomain (prod) aliases to the operator's live gym.
// "staging" subdomain (staging.dojostormsoftware.com) also routes to
// that same slug -- staging is served by a separate Vercel deployment
// with its own env vars pointing at the staging Neon branch, which
// carries a copy of prod data (same slug present there too). Anything
// on the staging host lands on the branched DB, not prod.
const SLUG_ALIASES: Record<string, string> = {
  app: "thepitidaho",
  staging: "thepitidaho",
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
 * "admin.thepitidaho.dojostormsoftware.com" → "admin"
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

/**
 * Split host into logical parts so we can distinguish
 * `admin.<gym>.dojostormsoftware.com` (per-gym admin subdomain)
 * from `admin.dojostormsoftware.com` (platform-admin subdomain).
 *
 * Returns:
 *   { adminPrefix: true, tenant: "thepitidaho" }  ← per-gym admin
 *   { adminPrefix: false, tenant: "thepitidaho" } ← bare gym subdomain
 *   { adminPrefix: false, tenant: "admin" }       ← 3-part admin.dojo... platform admin
 *   { adminPrefix: false, tenant: null }          ← marketing / localhost
 */
function parseHost(host: string): { adminPrefix: boolean; tenant: string | null } {
  const hostname = host.split(":")[0];
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return { adminPrefix: false, tenant: null };
  }
  const parts = hostname.split(".");
  // 4+ parts AND first is "admin" ⇒ per-gym admin subdomain.
  // The gym slug is the SECOND segment. Middle segments beyond that
  // (unlikely in practice) are ignored.
  if (parts.length >= 4 && parts[0] === "admin") {
    return { adminPrefix: true, tenant: parts[1] };
  }
  if (parts.length >= 3) {
    return { adminPrefix: false, tenant: parts[0] };
  }
  return { adminPrefix: false, tenant: null };
}

// Path prefixes that are legitimately ADMIN-app paths (need to redirect
// from bare gym subdomain to admin subdomain). Anything not in this
// set on the bare subdomain is either portal, public (waivers etc.),
// or already-portal (/portal/*).
const ADMIN_APP_PATH_PREFIXES = [
  "/dashboard",
  "/members",
  "/memberships",
  "/styles",
  "/classes",
  "/calendar",
  "/testing",
  "/curriculum",
  "/promotions",
  "/pos",
  "/discounts",
  "/invoices",
  "/contracts",
  "/reports",
  "/tasks",
  "/communication",
  "/communications",
  "/kiosk/settings",
  "/setup",
  "/audit-log",
  "/settings",
  "/account",
  "/notifications",
];

function isAdminAppPath(pathname: string): boolean {
  return ADMIN_APP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Bare-subdomain paths that map to the PORTAL app. Middleware rewrites
// these to /portal/<path> internally so the URL bar stays clean.
// Everything else on the bare subdomain either serves as-is (public
// waiver flows, /portal/*) or redirects to admin.<gym> (admin paths).
const BARE_PORTAL_PATHS = new Set([
  "/",
  "/login",
  "/verify",
  "/enroll",
  "/reset-password",
]);

/** Create a NextResponse.next() with the tenant slug header injected */
function nextWithTenant(request: NextRequest, slug: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_SLUG_HEADER, slug);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Resolve tenant slug + admin-subdomain flag from host ---
  const host = request.headers.get("host") || "localhost:3000";
  const subdomain = extractSubdomain(host);
  const { adminPrefix: isGymAdminSubdomain, tenant: parsedTenant } = parseHost(host);

  // staging.dojostormsoftware.com is Cruz's dev/testing deployment.
  // It maps to the same tenant as prod (SLUG_ALIASES.staging =
  // thepitidaho) but has no admin.staging.* Vercel host set up, so
  // the URL split (bare gym subdomain = portal) leaves the admin app
  // unreachable there. Treat staging as a dual-role host: /portal/*
  // serves the portal directly (no rewrite), everything else routes
  // through admin auth. Handled inline below via isStagingHost so
  // the bare-subdomain block never rewrites / -> /portal for staging.
  const isStagingHost = subdomain === "staging";

  // Whether the incoming request is carrying an admin_session cookie
  // that lingered on the BARE gym subdomain from before the URL split.
  // Set inside the bare-subdomain branch, consumed at every response-
  // point below so the cookie is told to expire without ever short-
  // circuiting the tenant / portal-auth resolution below. Do NOT set
  // this on admin subdomains where admin_session is legitimate.
  let shouldClearStaleAdminCookie = false;
  const attachCleanup = <T extends NextResponse>(response: T): T => {
    if (shouldClearStaleAdminCookie) {
      response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
    }
    return response;
  };

  // --- Marketing site host: www.dojostormsoftware.com and bare
  // dojostormsoftware.com serve the public marketing site (not the
  // app). Rewrite the request into /marketing/* so route files under
  // that folder render, and bypass every auth / tenant / permission
  // check.
  const isBareOrWww = subdomain === null || subdomain === "www";
  if (isBareOrWww && !host.startsWith("localhost")) {
    if (pathname === "/" || pathname === "/marketing") {
      return NextResponse.rewrite(new URL("/marketing", request.url));
    }
    if (pathname.startsWith("/marketing") || pathname.startsWith("/api/marketing")) {
      return NextResponse.next();
    }
    // Not a marketing path on the marketing host -- send to app
    // subdomain equivalent so legacy links (/portal/login shared on
    // www) keep working.
    const url = request.nextUrl.clone();
    url.host = host.replace(/^(www\.)?/, "app.");
    return NextResponse.redirect(url);
  }

  // --- Platform-admin subdomain: admin.dojostormsoftware.com ---
  // 3-part hostname whose first segment is "admin" -- NOT a per-gym
  // admin subdomain (those are 4+ parts, handled below).
  if (subdomain === "admin" && !isGymAdminSubdomain) {
    if (!pathname.startsWith("/admin") && pathname !== "/login" && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/admin")) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    return nextWithTenant(request, "thepitidaho");
  }

  // --- Per-gym admin subdomain: admin.<gym>.dojostormsoftware.com ---
  // Reroute /portal/* back to the bare subdomain (members using the
  // wrong URL) and block any /admin/* (platform-admin dashboard) --
  // otherwise fall through to the shared admin-gating flow below with
  // the tenant slug set from the SECOND host segment.
  let tenantSlug: string;
  if (isGymAdminSubdomain && parsedTenant) {
    if (pathname.startsWith("/portal")) {
      const url = request.nextUrl.clone();
      url.host = host.replace(/^admin\./, "");
      url.pathname = pathname.replace(/^\/portal/, "") || "/";
      return NextResponse.redirect(url);
    }
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      // Platform admin only lives on admin.dojostormsoftware.com; a
      // stray hit here would render the platform dashboard on a per-
      // gym admin subdomain if the caller happens to have a valid
      // platform-admin session cookie.
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    tenantSlug = SLUG_ALIASES[parsedTenant] || parsedTenant;
  } else {
    // Bare gym subdomain: <gym>.dojostormsoftware.com is now the
    // MEMBER PORTAL. Bare admin paths get redirected to the admin
    // subdomain so old bookmarks still resolve.
    const rawSlug = (!subdomain || subdomain === "app") ? DEFAULT_SLUG : subdomain;
    tenantSlug = SLUG_ALIASES[rawSlug] || rawSlug;

    // Stale admin session cleanup: any ADMIN_COOKIE that arrives on
    // the bare gym subdomain was set on this host BEFORE the URL
    // split (admin used to live here). Cookies without a Domain
    // attribute stay bound to the exact host they were set on, so
    // that old cookie still ships with every bare-subdomain request
    // -- causing the admin identity to bleed into the portal (Cruz
    // saw the admin nav "Cruz Gomez / Owner" rendering on a member's
    // portal home). We proactively expire it via attachCleanup on
    // every response below. Do NOT short-circuit portal / API paths
    // here -- doing so previously skipped tenant-slug injection AND
    // portal-cookie validation, which caused signed-in members to
    // land on the login page when the browser had both cookies.
    // Only flag the admin cookie as "stale" on real bare gym subdomains
    // (production tenants where admin lives on admin.<gym>.*). On
    // staging the admin cookie is the LEGITIMATE session for the admin
    // app served here -- expiring it would sign Cruz out on every load.
    shouldClearStaleAdminCookie = !isStagingHost && !!request.cookies.get(ADMIN_COOKIE);

    // On staging, keep admin at bare / and /login (dev-testing host --
    // no admin.staging.* is provisioned), and let /portal/* serve as-
    // is for exercising the portal side. The prod bare-subdomain
    // rewrites below are skipped for staging.
    if (!isStagingHost) {
      if (isAdminAppPath(pathname)) {
        const url = request.nextUrl.clone();
        url.host = `admin.${host}`;
        return attachCleanup(NextResponse.redirect(url));
      }
      if (BARE_PORTAL_PATHS.has(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = pathname === "/" ? "/portal" : `/portal${pathname}`;
        // Inject the tenant slug into the REQUEST headers forwarded to
        // the rewritten route so downstream getClientId() works. Setting
        // it on response.headers alone (previous behaviour) didn't make
        // it visible to the rewritten page's server code.
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set(TENANT_SLUG_HEADER, tenantSlug);
        return attachCleanup(
          NextResponse.rewrite(url, { request: { headers: requestHeaders } })
        );
      }
      // Bare /forgot-password: portal has no dedicated forgot page --
      // the forgot form is inline on /portal/login -- so send members
      // there. Prevents the admin forgot-password page from serving on
      // the member-facing host (which would generate an admin reset
      // token that can't be redeemed on the portal reset page).
      if (pathname === "/forgot-password") {
        return attachCleanup(NextResponse.redirect(new URL("/login", request.url)));
      }
    }
    // Fall through to the shared portal/admin auth checks below.
    // attachCleanup will expire the stale admin cookie on whichever
    // response those branches produce.
  }

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
      return attachCleanup(nextWithTenant(request, tenantSlug));
    }
    const cookie = request.cookies.get(PORTAL_COOKIE);
    if (!cookie?.value) {
      if (isPortalApi) {
        return attachCleanup(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
      }
      // "/login" (not "/portal/login") -- on the bare gym subdomain
      // middleware rewrites /login -> /portal/login internally, so
      // the URL bar stays clean when a portal page kicks an
      // unauthenticated visitor back to sign in.
      return attachCleanup(NextResponse.redirect(new URL("/login", request.url)));
    }
    return attachCleanup(nextWithTenant(request, tenantSlug));
  }

  // --- Public admin routes (no auth required) ---
  if (isPublicAdminPath(pathname)) {
    return attachCleanup(nextWithTenant(request, tenantSlug));
  }

  // --- Admin routes ---

  // Check admin session cookie
  const adminCookie = request.cookies.get(ADMIN_COOKIE);
  if (!adminCookie?.value) {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return attachCleanup(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    return attachCleanup(NextResponse.redirect(new URL("/login", request.url)));
  }

  // Validate session token and check permissions
  const session = await validateAdminSessionToken(adminCookie.value);
  if (!session) {
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return attachCleanup(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    return attachCleanup(NextResponse.redirect(new URL("/login", request.url)));
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
      return attachCleanup(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    return attachCleanup(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return attachCleanup(nextWithTenant(request, tenantSlug));
}

export const config = {
  matcher: [
    // Portal routes
    "/portal/:path*",
    "/api/portal/:path*",
    // Admin routes — everything except static assets. NOTE: do NOT
    // exclude .pdf. Rank curriculum PDF URLs now end in a friendly
    // filename like ".../Yellow Belt.pdf" so the middleware needs to
    // run on them to set the x-tenant-slug header — otherwise
    // getClientId() throws and the route 500s with "Failed to load
    // PDF". Also NOT excluding forgot-password / reset-password /
    // signup: middleware needs to run on them so the bare-gym-
    // subdomain rewrite (`/reset-password` -> `/portal/reset-
    // password`) fires. Without middleware, the admin file at
    // /reset-password would render on a bare-subdomain visit and
    // validate a portal token against the wrong table -> "Invalid
    // Link".
    "/((?!_next|favicon|icons|belts|manifest|uploads|sw\\.js|.*\\.png|.*\\.svg|.*\\.ico).*)",
  ],
};
