import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/memberships/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const membership = await prisma.membership.findUnique({
      where: { id },
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
    });

    if (!membership) {
      return new NextResponse("Membership not found", { status: 404 });
    }

    return NextResponse.json({ membership });
  } catch (error) {
    console.error("Error fetching membership:", error);
    return new NextResponse("Failed to load membership", { status: 500 });
  }
}

// PATCH /api/memberships/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { startDate, endDate, status, customPriceCents, lastPaymentDate, nextPaymentDate } = body;

    const membership = await prisma.membership.update({
      where: { id },
      data: {
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status !== undefined && { status }),
        ...(customPriceCents !== undefined && { customPriceCents }),
        ...(lastPaymentDate !== undefined && { lastPaymentDate: lastPaymentDate ? new Date(lastPaymentDate) : null }),
        ...(nextPaymentDate !== undefined && { nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null }),
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            stylesNotes: true,
          },
        },
        membershipPlan: {
          select: {
            id: true,
            name: true,
            allowedStyles: true,
          },
        },
      },
    });

    // Update member status based on membership changes
    // Handle multi-value statuses like "ACTIVE,COACH" or "INACTIVE,PARENT"
    if (membership.member) {
      const currentStatuses = membership.member.status
        ? membership.member.status.split(",").map((s: string) => s.trim())
        : [];

      if (status === "ACTIVE") {
        // Membership activated - replace INACTIVE/PROSPECT with ACTIVE
        const filteredStatuses = currentStatuses.filter(
          (s: string) => !["INACTIVE", "PROSPECT"].includes(s)
        );
        if (!filteredStatuses.includes("ACTIVE")) {
          filteredStatuses.unshift("ACTIVE");
        }
        const newStatus = filteredStatuses.join(",");

        await prisma.member.update({
          where: { id: membership.memberId },
          data: { status: newStatus },
        });

        // Reactivate styles associated with this membership plan
        if (membership.member.stylesNotes) {
          // Get the style names for this plan (if allowedStyles is null, plan covers all styles)
          let planStyleNames: string[] = [];

          if (membership.membershipPlan.allowedStyles) {
            const planStyleIds: string[] = JSON.parse(membership.membershipPlan.allowedStyles);
            if (planStyleIds.length > 0) {
              const planStyles = await prisma.style.findMany({
                where: { id: { in: planStyleIds } },
                select: { name: true },
              });
              planStyleNames = planStyles.map(s => s.name.toLowerCase());
            }
          } else {
            // allowedStyles is null - this plan covers ALL styles
            const allStyles = await prisma.style.findMany({
              select: { name: true },
            });
            planStyleNames = allStyles.map(s => s.name.toLowerCase());
          }

          if (planStyleNames.length > 0) {
            // Parse member's styles and reactivate ones from this plan
            const memberStyles: Array<{
              name: string;
              rank?: string;
              beltSize?: string;
              uniformSize?: string;
              startDate?: string;
              lastPromotionDate?: string;
              active?: boolean;
            }> = JSON.parse(membership.member.stylesNotes);

            let stylesUpdated = false;
            const updatedStyles = memberStyles.map(style => {
              const styleLower = style.name.toLowerCase();
              // If this style is from the activated plan and currently inactive
              if (planStyleNames.includes(styleLower) && style.active === false) {
                stylesUpdated = true;
                return { ...style, active: true };
              }
              return style;
            });

            if (stylesUpdated) {
              await prisma.member.update({
                where: { id: membership.memberId },
                data: { stylesNotes: JSON.stringify(updatedStyles) },
              });
            }
          }
        }
      } else if (status && status !== "ACTIVE") {
        // Membership deactivated (PAUSED, CANCELED, EXPIRED) - check if member has any other active memberships
        const otherActiveMemberships = await prisma.membership.findFirst({
          where: {
            memberId: membership.memberId,
            status: "ACTIVE",
            id: { not: id },
          },
        });
        // If no other active memberships, replace ACTIVE with INACTIVE
        if (!otherActiveMemberships) {
          const filteredStatuses = currentStatuses.filter(
            (s: string) => !["ACTIVE", "PROSPECT"].includes(s)
          );
          if (!filteredStatuses.includes("INACTIVE")) {
            filteredStatuses.unshift("INACTIVE");
          }
          const newStatus = filteredStatuses.join(",");

          await prisma.member.update({
            where: { id: membership.memberId },
            data: { status: newStatus },
          });
        }

        // Deactivate styles associated with this membership plan
        if (membership.member.stylesNotes) {
          // Get the style names for this plan (if allowedStyles is null, plan covers all styles)
          let planStyleNames: string[] = [];

          if (membership.membershipPlan.allowedStyles) {
            const planStyleIds: string[] = JSON.parse(membership.membershipPlan.allowedStyles);
            if (planStyleIds.length > 0) {
              const planStyles = await prisma.style.findMany({
                where: { id: { in: planStyleIds } },
                select: { name: true },
              });
              planStyleNames = planStyles.map(s => s.name.toLowerCase());
            }
          } else {
            // allowedStyles is null - this plan covers ALL styles
            const allStyles = await prisma.style.findMany({
              select: { name: true },
            });
            planStyleNames = allStyles.map(s => s.name.toLowerCase());
          }

          if (planStyleNames.length > 0) {
            // Check if any other active membership covers these styles
            const otherActiveMembershipsWithStyles = await prisma.membership.findMany({
              where: {
                memberId: membership.memberId,
                status: "ACTIVE",
                id: { not: id },
              },
              include: {
                membershipPlan: {
                  select: { allowedStyles: true },
                },
              },
            });

            // Collect style names covered by other active memberships
            const coveredStyleNames: string[] = [];
            for (const otherMembership of otherActiveMembershipsWithStyles) {
              if (otherMembership.membershipPlan.allowedStyles) {
                const otherStyleIds: string[] = JSON.parse(otherMembership.membershipPlan.allowedStyles);
                if (otherStyleIds.length > 0) {
                  const otherStyles = await prisma.style.findMany({
                    where: { id: { in: otherStyleIds } },
                    select: { name: true },
                  });
                  otherStyles.forEach(s => coveredStyleNames.push(s.name.toLowerCase()));
                }
              } else {
                // Other membership has null allowedStyles - covers ALL styles
                const allStyles = await prisma.style.findMany({
                  select: { name: true },
                });
                allStyles.forEach(s => coveredStyleNames.push(s.name.toLowerCase()));
              }
            }

            // Parse member's styles and deactivate ones from this plan that aren't covered elsewhere
            const memberStyles: Array<{
              name: string;
              rank?: string;
              beltSize?: string;
              uniformSize?: string;
              startDate?: string;
              lastPromotionDate?: string;
              active?: boolean;
            }> = JSON.parse(membership.member.stylesNotes);

            let stylesUpdated = false;
            const updatedStyles = memberStyles.map(style => {
              const styleLower = style.name.toLowerCase();
              // If this style is from the deactivated plan and not covered by another active membership
              if (planStyleNames.includes(styleLower) && !coveredStyleNames.includes(styleLower)) {
                if (style.active !== false) {
                  stylesUpdated = true;
                  return { ...style, active: false };
                }
              }
              return style;
            });

            if (stylesUpdated) {
              await prisma.member.update({
                where: { id: membership.memberId },
                data: { stylesNotes: JSON.stringify(updatedStyles) },
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ membership });
  } catch (error) {
    console.error("Error updating membership:", error);
    return new NextResponse("Failed to update membership", { status: 500 });
  }
}

// DELETE /api/memberships/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get membership info before deleting
    const membership = await prisma.membership.findUnique({
      where: { id },
      include: {
        member: {
          select: { id: true, status: true },
        },
      },
    });

    if (!membership) {
      return new NextResponse("Membership not found", { status: 404 });
    }

    const memberId = membership.memberId;
    const wasActive = membership.status === "ACTIVE";
    const memberStatus = membership.member?.status;

    await prisma.membership.delete({
      where: { id },
    });

    // If deleted membership was active, check if they have any other active memberships
    // Handle multi-value statuses like "ACTIVE,COACH" or "INACTIVE,PARENT"
    if (wasActive && memberStatus) {
      const otherActiveMemberships = await prisma.membership.findFirst({
        where: {
          memberId,
          status: "ACTIVE",
        },
      });
      // If no other active memberships, replace ACTIVE with INACTIVE
      if (!otherActiveMemberships) {
        const currentStatuses = memberStatus.split(",").map((s: string) => s.trim());
        const filteredStatuses = currentStatuses.filter(
          (s: string) => !["ACTIVE", "PROSPECT"].includes(s)
        );
        if (!filteredStatuses.includes("INACTIVE")) {
          filteredStatuses.unshift("INACTIVE");
        }
        const newStatus = filteredStatuses.join(",");

        await prisma.member.update({
          where: { id: memberId },
          data: { status: newStatus },
        });
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting membership:", error);
    return new NextResponse("Failed to delete membership", { status: 500 });
  }
}
