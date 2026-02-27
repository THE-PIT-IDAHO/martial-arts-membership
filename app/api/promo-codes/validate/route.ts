import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/promo-codes/validate
// Body: { code: string, planId?: string }
// Returns discount info or error
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { code, planId } = body;

    if (!code) {
      return NextResponse.json({ valid: false, error: "Code is required" }, { status: 400 });
    }

    const promo = await prisma.promoCode.findFirst({
      where: { code: code.toUpperCase(), clientId },
    });

    if (!promo) {
      return NextResponse.json({ valid: false, error: "Invalid promo code" });
    }

    if (!promo.isActive) {
      return NextResponse.json({ valid: false, error: "This promo code is no longer active" });
    }

    // Check date validity
    const now = new Date();
    if (promo.validFrom && now < new Date(promo.validFrom)) {
      return NextResponse.json({ valid: false, error: "This promo code is not yet active" });
    }
    if (promo.validUntil && now > new Date(promo.validUntil)) {
      return NextResponse.json({ valid: false, error: "This promo code has expired" });
    }

    // Check redemption limit
    if (promo.maxRedemptions && promo.redemptionCount >= promo.maxRedemptions) {
      return NextResponse.json({ valid: false, error: "This promo code has reached its usage limit" });
    }

    // Check plan applicability
    if (planId && promo.applicablePlanIds) {
      const applicableIds: string[] = JSON.parse(promo.applicablePlanIds);
      if (applicableIds.length > 0 && !applicableIds.includes(planId)) {
        return NextResponse.json({ valid: false, error: "This promo code does not apply to the selected plan" });
      }
    }

    return NextResponse.json({
      valid: true,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      description: promo.description,
      code: promo.code,
    });
  } catch (error) {
    console.error("Error validating promo code:", error);
    return new NextResponse("Failed to validate promo code", { status: 500 });
  }
}
