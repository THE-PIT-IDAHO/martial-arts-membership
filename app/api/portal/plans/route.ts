import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/portal/plans — Public endpoint
export async function GET() {
  try {
    const plans = await prisma.membershipPlan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        billingCycle: true,
        autoRenew: true,
        trialDays: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(plans);
  } catch (error) {
    console.error("Error fetching plans:", error);
    return new NextResponse("Failed to load plans", { status: 500 });
  }
}
