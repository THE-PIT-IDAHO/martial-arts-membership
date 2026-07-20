import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Parse Client.grantedTierIds (JSON array as a string) safely. Bad
// JSON or the null default resolves to an empty list rather than
// throwing -- the field is optional metadata, not a data contract.
function parseGrantedTierIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Visibility rules the plan picker follows:
//   * Public tiers (neither flag): everyone sees them.
//   * founderOnly: only the platform-admin gym sees them.
//   * inviteOnly: only gyms explicitly entitled via grantedTierIds
//     see them. Platform admins see them too, so the software owner
//     can inspect / switch into any tier.
function isTierVisible(
  tier: { founderOnly: boolean; inviteOnly: boolean; id: string },
  ctx: { isPlatformAdmin: boolean; grantedIds: string[] },
): boolean {
  if (tier.founderOnly) return ctx.isPlatformAdmin;
  if (tier.inviteOnly) return ctx.isPlatformAdmin || ctx.grantedIds.includes(tier.id);
  return true;
}

// GET /api/plan — get current plan and available tiers.
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);

    const [client, tiers] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        select: {
          maxMembers: true, maxStyles: true, maxRanksPerStyle: true,
          maxMembershipPlans: true, maxClasses: true, maxUsers: true,
          maxLocations: true, maxReports: true, maxPOSItems: true,
          allowStripe: true, allowPaypal: true, allowSquare: true,
          priceCents: true, trialExpiresAt: true,
          isPlatformAdmin: true, grantedTierIds: true,
        },
      }),
      prisma.pricingTier.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const grantedIds = parseGrantedTierIds(client.grantedTierIds);
    const visibleTiers = tiers.filter((t) =>
      isTierVisible(t, { isPlatformAdmin: client.isPlatformAdmin, grantedIds })
    );

    // Find current tier by matching limits. Match against the full
    // list (not visibleTiers) so a client's current-tier name still
    // resolves even on the odd chance they are currently sitting on
    // a tier they can no longer see.
    const currentTier = tiers.find(t =>
      t.maxMembers === client.maxMembers &&
      t.maxStyles === client.maxStyles &&
      t.priceCents === client.priceCents
    ) || null;

    // Strip internal-only fields from the client blob before
    // returning it -- both are used server-side for gating and
    // aren't something we want to leak to the browser.
    const { isPlatformAdmin: _ipa, grantedTierIds: _gt, ...clientPublic } = client;

    return NextResponse.json({
      current: clientPublic,
      currentTierId: currentTier?.id || null,
      currentTierName: currentTier?.name || "Custom",
      tiers: visibleTiers,
    });
  } catch (error) {
    console.error("Error fetching plan:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// PATCH /api/plan — change to a different tier
export async function PATCH(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { tierId } = await req.json();

    if (!tierId) {
      return NextResponse.json({ error: "tierId required" }, { status: 400 });
    }

    const [tier, client] = await Promise.all([
      prisma.pricingTier.findUnique({ where: { id: tierId } }),
      prisma.client.findUnique({
        where: { id: clientId },
        select: { isPlatformAdmin: true, grantedTierIds: true },
      }),
    ]);
    if (!tier || !tier.isActive) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
    }
    // Defense in depth: rerun the same visibility check on the
    // switch attempt so a hand-crafted PATCH can't sidestep the
    // filter in GET.
    const grantedIds = parseGrantedTierIds(client?.grantedTierIds ?? null);
    if (!isTierVisible(tier, {
      isPlatformAdmin: !!client?.isPlatformAdmin,
      grantedIds,
    })) {
      return NextResponse.json({ error: "Tier not available" }, { status: 403 });
    }

    await prisma.client.update({
      where: { id: clientId },
      data: {
        maxMembers: tier.maxMembers,
        maxStyles: tier.maxStyles,
        maxRanksPerStyle: tier.maxRanksPerStyle,
        maxMembershipPlans: tier.maxMembershipPlans,
        maxClasses: tier.maxClasses,
        maxUsers: tier.maxUsers,
        maxLocations: tier.maxLocations,
        maxReports: tier.maxReports,
        maxPOSItems: tier.maxPOSItems,
        allowStripe: tier.allowStripe,
        allowPaypal: tier.allowPaypal,
        allowSquare: tier.allowSquare,
        priceCents: tier.priceCents,
      },
    });

    return NextResponse.json({ success: true, tierName: tier.name });
  } catch (error) {
    console.error("Error changing plan:", error);
    return NextResponse.json({ error: "Failed to change plan" }, { status: 500 });
  }
}
