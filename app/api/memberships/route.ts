import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/memberships
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    const planId = searchParams.get("planId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (memberId) where.memberId = memberId;
    if (planId) where.membershipPlanId = planId;
    if (status) where.status = status;

    const memberships = await prisma.membership.findMany({
      where,
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
        membershipPlan: true,
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({ memberships });
  } catch (error) {
    console.error("Error fetching memberships:", error);
    return new NextResponse("Failed to load memberships", { status: 500 });
  }
}

// POST /api/memberships - Assign a membership plan to a member
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberId, membershipPlanId, startDate, endDate, status } = body;

    if (!memberId) {
      return new NextResponse("Member ID is required", { status: 400 });
    }
    if (!membershipPlanId) {
      return new NextResponse("Membership plan ID is required", { status: 400 });
    }
    if (!startDate) {
      return new NextResponse("Start date is required", { status: 400 });
    }

    // Check if member already has an active membership for this plan
    const existingActive = await prisma.membership.findFirst({
      where: {
        memberId,
        membershipPlanId,
        status: "ACTIVE",
      },
    });

    if (existingActive) {
      return new NextResponse(
        "Member already has an active membership for this plan",
        { status: 400 }
      );
    }

    // Get the membership plan to check for included styles
    const plan = await prisma.membershipPlan.findUnique({
      where: { id: membershipPlanId },
      select: { allowedStyles: true },
    });

    // Get the member's current styles
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { primaryStyle: true, stylesNotes: true },
    });

    // Create the membership
    const membership = await prisma.membership.create({
      data: {
        memberId,
        membershipPlanId,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        status: status || "ACTIVE",
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        membershipPlan: true,
      },
    });

    // Auto-assign included styles to the member
    if (plan?.allowedStyles) {
      const includedStyleIds: string[] = JSON.parse(plan.allowedStyles);

      if (includedStyleIds.length > 0) {
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

        // Parse existing styles
        const existingStyles: Array<{
          name: string;
          rank?: string;
          beltSize?: string;
          uniformSize?: string;
          startDate?: string;
          lastPromotionDate?: string;
        }> = member?.stylesNotes ? JSON.parse(member.stylesNotes) : [];

        // Get existing style names for comparison
        const existingStyleNames = existingStyles.map((s) => s.name.toLowerCase());

        // Add new styles that don't already exist
        const membershipStartDate = new Date(startDate).toISOString().split("T")[0];
        const newStyles = stylesWithRanks
          .filter((style) => !existingStyleNames.includes(style.name.toLowerCase()))
          .map((style) => ({
            name: style.name,
            rank: style.ranks[0]?.name || undefined,
            startDate: membershipStartDate,
            lastPromotionDate: membershipStartDate,
          }));

        if (newStyles.length > 0) {
          const updatedStyles = [...existingStyles, ...newStyles];

          // Set primary style if not already set
          const updateData: { stylesNotes: string; primaryStyle?: string } = {
            stylesNotes: JSON.stringify(updatedStyles),
          };

          if (!member?.primaryStyle && newStyles.length > 0) {
            updateData.primaryStyle = newStyles[0].name;
          }

          await prisma.member.update({
            where: { id: memberId },
            data: updateData,
          });
        }
      }
    }

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    console.error("Error creating membership:", error);
    return new NextResponse("Failed to create membership", { status: 500 });
  }
}
