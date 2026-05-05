import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/plan — get current plan and available tiers
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

    // Find current tier by matching limits
    const currentTier = tiers.find(t =>
      t.maxMembers === client.maxMembers &&
      t.maxStyles === client.maxStyles &&
      t.priceCents === client.priceCents
    ) || null;

    return NextResponse.json({
      current: client,
      currentTierId: currentTier?.id || null,
      currentTierName: currentTier?.name || "Custom",
      tiers,
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

    const tier = await prisma.pricingTier.findUnique({ where: { id: tierId } });
    if (!tier || !tier.isActive) {
      return NextResponse.json({ error: "Tier not found" }, { status: 404 });
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
