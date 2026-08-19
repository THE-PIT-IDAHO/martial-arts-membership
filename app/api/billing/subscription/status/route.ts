import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAdminSessionToken } from "@/lib/admin-auth";
import { getClientId } from "@/lib/tenant";
import { getSubscriptionSnapshot } from "@/lib/platform-subscription";
import { isStripeConfigured } from "@/lib/stripe";

/**
 * GET /api/billing/subscription/status
 *
 * Returns this gym's current platform-subscription snapshot plus the
 * list of tiers they can pick from. Powers the /settings/subscription
 * page. OWNER-only.
 *
 * Tier list rules:
 *  - `isActive: true` (as everywhere else)
 *  - `founderOnly: false`
 *  - OR `inviteOnly: true` AND the tier id is in Client.grantedTierIds
 *    (so invited-only "Free Testing" tiers still appear for their
 *    entitled gyms)
 */
export async function GET(req: Request) {
  try {
    // OWNER-only auth
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/admin_session=([^;]+)/);
    if (!match) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const session = await validateAdminSessionToken(match[1]);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const clientId = await getClientId(req);
    const snapshot = await getSubscriptionSnapshot(clientId);

    // Available tiers for this Client's plan picker.
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { grantedTierIds: true },
    });
    const grantedIds = parseGrantedTierIds(client?.grantedTierIds);
    const tiers = await prisma.pricingTier.findMany({
      where: {
        isActive: true,
        founderOnly: false,
        OR: [
          { inviteOnly: false },
          ...(grantedIds.length ? [{ id: { in: grantedIds } }] : []),
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        billingPeriod: true,
        maxMembers: true,
        maxStyles: true,
        maxUsers: true,
        maxLocations: true,
        maxReports: true,
        maxPOSItems: true,
        allowStripe: true,
        allowPaypal: true,
        allowSquare: true,
        inviteOnly: true,
        stripePriceId: true,
      },
    });

    return NextResponse.json({
      snapshot,
      tiers,
      stripeConfigured: isStripeConfigured(),
    });
  } catch (err) {
    console.error("[billing/subscription/status] fatal:", err);
    const msg = err instanceof Error ? err.message : "Failed to load subscription";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function parseGrantedTierIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}
