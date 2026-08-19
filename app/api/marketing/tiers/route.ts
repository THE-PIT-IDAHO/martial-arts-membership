import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/marketing/tiers — public. Returns the platform's
 * publicly-listable pricing tiers for the marketing landing page.
 *
 * Filter: isActive AND NOT founderOnly AND NOT inviteOnly.
 *   founderOnly -> platform-admin-internal tier (e.g. Founder).
 *   inviteOnly  -> reserved for signup-link recipients (e.g.
 *                  Free Testing, Pit Ohana). Never appears on
 *                  the public site by design; those visitors
 *                  arrive with a signup-link token instead.
 *
 * Sorted by sortOrder ascending so the operator controls display
 * order from /admin/pricing without a code change.
 */
export async function GET() {
  try {
    const tiers = await prisma.pricingTier.findMany({
      where: {
        isActive: true,
        founderOnly: false,
        inviteOnly: false,
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
      },
    });
    return NextResponse.json({ tiers });
  } catch (err) {
    console.error("[marketing/tiers] fatal:", err);
    return NextResponse.json({ tiers: [] }, { status: 500 });
  }
}
