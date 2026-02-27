import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLIENT_ID = "default-client";
const MIN_MEMBERSHIP_NUMBER = 20000000;

// Find lowest free membershipId >= MIN_MEMBERSHIP_NUMBER
async function getNextMembershipId(): Promise<string> {
  const existing = await prisma.membershipPlan.findMany({
    where: {
      membershipId: { not: null },
    },
    select: { membershipId: true },
  });

  // Parse numeric IDs and filter valid ones
  const numericIds = existing
    .map((p) => parseInt(p.membershipId || "", 10))
    .filter((n) => !isNaN(n) && n >= MIN_MEMBERSHIP_NUMBER)
    .sort((a, b) => a - b);

  let candidate = MIN_MEMBERSHIP_NUMBER;
  for (const id of numericIds) {
    if (id === candidate) {
      candidate++;
    } else if (id > candidate) {
      break;
    }
  }
  return String(candidate);
}

// GET /api/membership-plans
export async function GET() {
  try {
    const membershipPlans = await prisma.membershipPlan.findMany({
      where: { clientId: DEFAULT_CLIENT_ID },
      include: {
        membershipType: true,
        memberships: {
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ membershipPlans });
  } catch (error) {
    console.error("Error fetching membership plans:", error);
    return new NextResponse("Failed to load membership plans", { status: 500 });
  }
}

// POST /api/membership-plans
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      membershipId,
      membershipTypeId,
      name,
      description,
      priceCents,
      setupFeeCents,
      purchaseLimit,
      billingCycle,
      contractLengthMonths,
      autoRenew,
      classesPerDay,
      classesPerWeek,
      classesPerMonth,
      allowedStyles,
      familyDiscountPercent,
      rankPromotionDiscountPercent,
      otherDiscountPercent,
      trialDays,
      promoCode,
      cancellationNoticeDays,
      cancellationFeeCents,
      contractClauses,
      sortOrder,
      color,
      isActive,
      availableOnline,
    } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    // Auto-generate membershipId if not provided
    const finalMembershipId = membershipId?.trim() || await getNextMembershipId();

    const membershipPlan = await prisma.membershipPlan.create({
      data: {
        membershipId: finalMembershipId,
        membershipTypeId: membershipTypeId || null,
        name: name.trim(),
        description: description?.trim() || null,
        priceCents: priceCents ? Number(priceCents) : null,
        setupFeeCents: setupFeeCents ? Number(setupFeeCents) : null,
        purchaseLimit: purchaseLimit ? Number(purchaseLimit) : null,
        billingCycle: billingCycle || "MONTHLY",
        contractLengthMonths: contractLengthMonths ? Number(contractLengthMonths) : null,
        autoRenew: autoRenew ?? true,
        classesPerDay: classesPerDay ? Number(classesPerDay) : null,
        classesPerWeek: classesPerWeek ? Number(classesPerWeek) : null,
        classesPerMonth: classesPerMonth ? Number(classesPerMonth) : null,
        allowedStyles: allowedStyles || null,
        familyDiscountPercent: familyDiscountPercent ? Number(familyDiscountPercent) : null,
        rankPromotionDiscountPercent: rankPromotionDiscountPercent ? Number(rankPromotionDiscountPercent) : null,
        otherDiscountPercent: otherDiscountPercent ? Number(otherDiscountPercent) : null,
        trialDays: trialDays ? Number(trialDays) : null,
        promoCode: promoCode?.trim() || null,
        cancellationNoticeDays: cancellationNoticeDays ? Number(cancellationNoticeDays) : null,
        cancellationFeeCents: cancellationFeeCents ? Number(cancellationFeeCents) : null,
        contractClauses: contractClauses || null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        color: color || null,
        isActive: isActive ?? true,
        availableOnline: availableOnline ?? false,
        clientId: DEFAULT_CLIENT_ID,
      },
    });

    return NextResponse.json({ membershipPlan }, { status: 201 });
  } catch (error) {
    console.error("Error creating membership plan:", error);
    return new NextResponse("Failed to create membership plan", { status: 500 });
  }
}
