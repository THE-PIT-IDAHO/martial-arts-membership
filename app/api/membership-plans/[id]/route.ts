import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/membership-plans/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const membershipPlan = await prisma.membershipPlan.findUnique({
      where: { id },
      include: {
        membershipType: true,
        memberships: {
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!membershipPlan || membershipPlan.clientId !== clientId) {
      return new NextResponse("Membership plan not found", { status: 404 });
    }

    return NextResponse.json({ membershipPlan });
  } catch (error) {
    console.error("Error fetching membership plan:", error);
    return new NextResponse("Failed to load membership plan", { status: 500 });
  }
}

// PATCH /api/membership-plans/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    // Verify the plan belongs to this tenant
    const existingPlan = await prisma.membershipPlan.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existingPlan || existingPlan.clientId !== clientId) {
      return new NextResponse("Membership plan not found", { status: 404 });
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
      applyToCurrentMembers,
      updatePlanTemplate = true, // Default to true for backwards compatibility
    } = body;

    let membershipPlan;

    // Only update the plan template if updatePlanTemplate is true
    if (updatePlanTemplate) {
      membershipPlan = await prisma.membershipPlan.update({
        where: { id },
        data: {
          ...(membershipId !== undefined && { membershipId: membershipId?.trim() || null }),
          ...(membershipTypeId !== undefined && { membershipTypeId: membershipTypeId || null }),
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(priceCents !== undefined && { priceCents: priceCents ? Number(priceCents) : null }),
          ...(setupFeeCents !== undefined && { setupFeeCents: setupFeeCents ? Number(setupFeeCents) : null }),
          ...(purchaseLimit !== undefined && { purchaseLimit: purchaseLimit ? Number(purchaseLimit) : null }),
          ...(billingCycle !== undefined && { billingCycle }),
          ...(contractLengthMonths !== undefined && { contractLengthMonths: contractLengthMonths ? Number(contractLengthMonths) : null }),
          ...(autoRenew !== undefined && { autoRenew }),
          ...(classesPerDay !== undefined && { classesPerDay: classesPerDay ? Number(classesPerDay) : null }),
          ...(classesPerWeek !== undefined && { classesPerWeek: classesPerWeek ? Number(classesPerWeek) : null }),
          ...(classesPerMonth !== undefined && { classesPerMonth: classesPerMonth ? Number(classesPerMonth) : null }),
          ...(allowedStyles !== undefined && { allowedStyles: allowedStyles || null }),
          ...(familyDiscountPercent !== undefined && { familyDiscountPercent: familyDiscountPercent ? Number(familyDiscountPercent) : null }),
          ...(rankPromotionDiscountPercent !== undefined && { rankPromotionDiscountPercent: rankPromotionDiscountPercent ? Number(rankPromotionDiscountPercent) : null }),
          ...(otherDiscountPercent !== undefined && { otherDiscountPercent: otherDiscountPercent ? Number(otherDiscountPercent) : null }),
          ...(trialDays !== undefined && { trialDays: trialDays ? Number(trialDays) : null }),
          ...(promoCode !== undefined && { promoCode: promoCode?.trim() || null }),
          ...(cancellationNoticeDays !== undefined && { cancellationNoticeDays: cancellationNoticeDays ? Number(cancellationNoticeDays) : null }),
          ...(cancellationFeeCents !== undefined && { cancellationFeeCents: cancellationFeeCents ? Number(cancellationFeeCents) : null }),
          ...(sortOrder !== undefined && { sortOrder: sortOrder ? Number(sortOrder) : 0 }),
          ...(color !== undefined && { color: color || null }),
          ...(isActive !== undefined && { isActive }),
          ...(contractClauses !== undefined && { contractClauses: contractClauses || null }),
          ...(availableOnline !== undefined && { availableOnline }),
        },
      });
    } else {
      // Just fetch the current plan without updating
      membershipPlan = await prisma.membershipPlan.findUnique({
        where: { id },
      });
    }

    // If applyToCurrentMembers is true, update existing active members with new styles
    if (applyToCurrentMembers && allowedStyles) {
      const includedStyleIds: string[] = JSON.parse(allowedStyles);

      if (includedStyleIds.length > 0) {
        // Get all active memberships for this plan
        const activeMemberships = await prisma.membership.findMany({
          where: {
            membershipPlanId: id,
            status: "ACTIVE",
          },
          include: {
            member: {
              select: {
                id: true,
                primaryStyle: true,
                stylesNotes: true,
              },
            },
          },
        });

        // Get the styles with their first rank
        const stylesWithRanks = await prisma.style.findMany({
          where: { id: { in: includedStyleIds } },
          include: {
            ranks: {
              orderBy: { order: "asc" },
              take: 1,
            },
          },
        });

        // Update each member's styles
        const today = new Date().toISOString().split("T")[0];

        for (const membership of activeMemberships) {
          const member = membership.member;
          if (!member) continue;

          // Parse existing styles
          const existingStyles: Array<{
            name: string;
            rank?: string;
            beltSize?: string;
            uniformSize?: string;
            startDate?: string;
            lastPromotionDate?: string;
          }> = member.stylesNotes ? JSON.parse(member.stylesNotes) : [];

          // Get existing style names for comparison
          const existingStyleNames = existingStyles.map((s) => s.name.toLowerCase());

          // Add new styles that don't already exist
          const newStyles = stylesWithRanks
            .filter((style) => !existingStyleNames.includes(style.name.toLowerCase()))
            .map((style) => ({
              name: style.name,
              rank: style.ranks[0]?.name || undefined,
              startDate: today,
              lastPromotionDate: today,
            }));

          if (newStyles.length > 0) {
            const updatedStyles = [...existingStyles, ...newStyles];

            // Set primary style if not already set
            const updateData: { stylesNotes: string; primaryStyle?: string } = {
              stylesNotes: JSON.stringify(updatedStyles),
            };

            if (!member.primaryStyle && newStyles.length > 0) {
              updateData.primaryStyle = newStyles[0].name;
            }

            await prisma.member.update({
              where: { id: member.id },
              data: updateData,
            });
          }
        }
      }
    }

    return NextResponse.json({ membershipPlan });
  } catch (error) {
    console.error("Error updating membership plan:", error);
    return new NextResponse("Failed to update membership plan", { status: 500 });
  }
}

// DELETE /api/membership-plans/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    // Verify the plan belongs to this tenant
    const existingPlan = await prisma.membershipPlan.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existingPlan || existingPlan.clientId !== clientId) {
      return new NextResponse("Membership plan not found", { status: 404 });
    }

    // Check if there are any active memberships using this plan
    const activeMemberships = await prisma.membership.count({
      where: {
        membershipPlanId: id,
        status: "ACTIVE",
      },
    });

    if (activeMemberships > 0) {
      return new NextResponse(
        `Cannot delete plan with ${activeMemberships} active membership(s). Please cancel or transfer them first.`,
        { status: 400 }
      );
    }

    await prisma.membershipPlan.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting membership plan:", error);
    return new NextResponse("Failed to delete membership plan", { status: 500 });
  }
}
