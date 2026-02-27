import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// Header set by middleware: the subdomain slug (e.g., "thepitidaho")
export const TENANT_SLUG_HEADER = "x-tenant-slug";

// In-memory cache: slug → clientId (avoids repeated DB lookups per request)
const slugCache = new Map<string, { clientId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve the tenant clientId from the request.
 * Middleware sets x-tenant-slug header from the subdomain.
 * This function resolves slug → clientId via Prisma (with caching).
 */
export async function getClientId(req?: Request): Promise<string> {
  let slug: string | null = null;

  // Try request header first (API routes)
  if (req) {
    slug = req.headers.get(TENANT_SLUG_HEADER);
  }

  // Fallback: Next.js headers() for server components
  if (!slug) {
    try {
      const h = await headers();
      slug = h.get(TENANT_SLUG_HEADER);
    } catch {
      // headers() not available (e.g., during build)
    }
  }

  if (!slug) {
    throw new Error("Tenant not resolved — missing x-tenant-slug header");
  }

  return resolveSlugToClientId(slug);
}

async function resolveSlugToClientId(slug: string): Promise<string> {
  // Check cache
  const cached = slugCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.clientId;
  }

  // DB lookup
  const client = await prisma.client.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!client) {
    throw new Error(`Unknown tenant: ${slug}`);
  }

  // Cache it
  slugCache.set(slug, { clientId: client.id, expiresAt: Date.now() + CACHE_TTL_MS });

  return client.id;
}

/**
 * Extract subdomain from a host string.
 * "thepitidaho.dojostormsoftware.com" → "thepitidaho"
 * "app.dojostormsoftware.com" → "app"
 * "localhost:3000" → null
 */
export function extractSubdomain(host: string): string | null {
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

/** Generate a slug from a gym name: "The Pit Idaho" → "thepitidaho" */
export function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
