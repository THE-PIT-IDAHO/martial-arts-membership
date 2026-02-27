import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/promo-codes
export async function GET() {
  try {
    const codes = await prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ codes });
  } catch (error) {
    console.error("Error fetching promo codes:", error);
    return new NextResponse("Failed to load promo codes", { status: 500 });
  }
}

// POST /api/promo-codes
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      code,
      description,
      discountType,
      discountValue,
      applicablePlanIds,
      maxRedemptions,
      validFrom,
      validUntil,
      isActive,
    } = body;

    if (!code || discountValue === undefined) {
      return new NextResponse("Code and discount value are required", { status: 400 });
    }

    // Check for duplicate code
    const existing = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
      return new NextResponse("Promo code already exists", { status: 400 });
    }

    const promoCode = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase(),
        description: description || null,
        discountType: discountType || "PERCENT",
        discountValue,
        applicablePlanIds: applicablePlanIds ? JSON.stringify(applicablePlanIds) : null,
        maxRedemptions: maxRedemptions || null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ promoCode }, { status: 201 });
  } catch (error) {
    console.error("Error creating promo code:", error);
    return new NextResponse("Failed to create promo code", { status: 500 });
  }
}
