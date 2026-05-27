import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { canAddMembershipPlan } from "@/lib/trial";
import { getNextMembershipPlanId } from "@/lib/sequence";
import { logAudit } from "@/lib/audit";

// GET /api/membership-plans
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const membershipPlans = await prisma.membershipPlan.findMany({
      where: { clientId },
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
    const clientId = await getClientId(req);

    const planCheck = await canAddMembershipPlan(clientId);
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason }, { status: 403 });
    }

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
      rankPromotionDiscountFlatCents,
      otherDiscountPercent,
      trialDays,
      promoCode,
      cancellationNoticeDays,
      cancellationFeeCents,
      cancellationProcedure,
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
    const finalMembershipId = membershipId?.trim() || await getNextMembershipPlanId(clientId);

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
        rankPromotionDiscountFlatCents: rankPromotionDiscountFlatCents ? Number(rankPromotionDiscountFlatCents) : null,
        otherDiscountPercent: otherDiscountPercent ? Number(otherDiscountPercent) : null,
        trialDays: trialDays ? Number(trialDays) : null,
        promoCode: promoCode?.trim() || null,
        cancellationNoticeDays: cancellationNoticeDays ? Number(cancellationNoticeDays) : null,
        cancellationFeeCents: cancellationFeeCents ? Number(cancellationFeeCents) : null,
        cancellationProcedure: cancellationProcedure?.trim() || null,
        contractClauses: contractClauses || null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        color: color || null,
        isActive: isActive ?? true,
        availableOnline: availableOnline ?? false,
        clientId,
      },
    });

    logAudit({
      entityType: "MembershipPlan",
      entityId: membershipPlan.id,
      action: "CREATE",
      summary: `Created membership plan "${membershipPlan.name}" (#${finalMembershipId})`,
      clientId,
    }).catch(() => {});

    return NextResponse.json({ membershipPlan }, { status: 201 });
  } catch (error) {
    console.error("Error creating membership plan:", error);
    // Surface the real message so the admin sees something useful in the
    // toast / alert. Unique-constraint hits (e.g. duplicate membershipId)
    // and missing-relation errors used to all collapse into a generic
    // "Failed to create membership plan."
    const msg =
      error instanceof Error
        ? error.message
        : "Failed to create membership plan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
