import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLocalDate } from "@/lib/dates";
import { calculateNextPaymentDate } from "@/lib/billing";
import { calculateContractEndDate } from "@/lib/contracts";

type RankPdf = {
  name: string;
  url: string;
};

type BeltRank = {
  name: string;
  order: number;
  pdfDocuments?: RankPdf[];
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
};

// Helper function to get first rank from beltConfig
function getFirstRankFromBeltConfig(beltConfig: string | null): string | null {
  if (!beltConfig) return null;
  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (config.ranks && Array.isArray(config.ranks) && config.ranks.length > 0) {
      // Sort by order and return the first (lowest order) rank
      const sortedRanks = [...config.ranks].sort((a: BeltRank, b: BeltRank) => a.order - b.order);
      return sortedRanks[0].name;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// Helper function to add rank PDFs to member's styleDocuments
function addRankPdfsToDocuments(
  beltConfig: string | null,
  targetRankName: string,
  currentDocs: StyleDocument[]
): { docs: StyleDocument[]; hasChanges: boolean } {
  if (!beltConfig) return { docs: currentDocs, hasChanges: false };

  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (!config.ranks || !Array.isArray(config.ranks)) {
      return { docs: currentDocs, hasChanges: false };
    }

    // Find the target rank
    const targetRank = config.ranks.find((r: BeltRank) => r.name === targetRankName);
    if (!targetRank) return { docs: currentDocs, hasChanges: false };

    // Get all ranks up to and including the target rank (by order number)
    const ranksToInclude = config.ranks.filter((r: BeltRank) => r.order <= targetRank.order);

    let hasChanges = false;
    const updatedDocs = [...currentDocs];

    // Add PDFs from all these ranks
    for (const rank of ranksToInclude) {
      if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

      for (const rankPdf of rank.pdfDocuments) {
        // Check if this PDF already exists (by name)
        const exists = updatedDocs.some((doc) => doc.name === rankPdf.name);
        if (!exists) {
          const newDoc: StyleDocument = {
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: rankPdf.name,
            url: rankPdf.url,
            uploadedAt: new Date().toISOString(),
          };
          updatedDocs.push(newDoc);
          hasChanges = true;
        }
      }
    }

    return { docs: updatedDocs, hasChanges };
  } catch {
    return { docs: currentDocs, hasChanges: false };
  }
}

// Calculate next payment date based on billing cycle
// calculateNextPaymentDate imported from @/lib/billing

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

    // Get the membership plan to check for included styles, billing cycle, and contract
    const plan = await prisma.membershipPlan.findUnique({
      where: { id: membershipPlanId },
      select: { allowedStyles: true, billingCycle: true, contractLengthMonths: true },
    });

    // Get the member's current styles, documents, and status
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { primaryStyle: true, stylesNotes: true, styleDocuments: true, rank: true, status: true },
    });

    // Calculate dates using timezone-aware parsing
    const membershipStartDate = parseLocalDate(startDate);
    const membershipEndDate = endDate ? parseLocalDate(endDate) : null;

    // Calculate next payment date based on billing cycle (only for recurring memberships)
    const nextPaymentDate = !membershipEndDate && plan?.billingCycle
      ? calculateNextPaymentDate(membershipStartDate, plan.billingCycle)
      : null;

    // Calculate contract end date if plan has a contract length
    const contractEndDate = plan?.contractLengthMonths
      ? calculateContractEndDate(membershipStartDate, plan.contractLengthMonths)
      : null;

    // Create the membership
    const membership = await prisma.membership.create({
      data: {
        memberId,
        membershipPlanId,
        startDate: membershipStartDate,
        endDate: membershipEndDate,
        status: status || "ACTIVE",
        lastPaymentDate: membershipStartDate,
        nextPaymentDate,
        contractEndDate,
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

    // Auto-assign included styles to the member and reactivate existing inactive styles
    // Only do this if the membership is ACTIVE
    const membershipIsActive = (status || "ACTIVE") === "ACTIVE";

    if (membershipIsActive && plan?.allowedStyles) {
      try {
        const includedStyleIds: string[] = JSON.parse(plan.allowedStyles);

        if (includedStyleIds.length > 0) {
          // Get the styles with their beltConfig (contains ranks and PDFs)
          const stylesWithConfig = await prisma.style.findMany({
            where: { id: { in: includedStyleIds } },
            select: { id: true, name: true, beltConfig: true },
          });

          const planStyleNames = stylesWithConfig.map(s => s.name.toLowerCase());

          // Parse existing styles
          const existingStyles: Array<{
            name: string;
            rank?: string;
            beltSize?: string;
            uniformSize?: string;
            startDate?: string;
            lastPromotionDate?: string;
            attendanceResetDate?: string;
            active?: boolean;
          }> = member?.stylesNotes ? JSON.parse(member.stylesNotes) : [];

          // Parse existing style documents
          let currentDocs: StyleDocument[] = [];
          if (member?.styleDocuments) {
            try {
              currentDocs = JSON.parse(member.styleDocuments);
            } catch {
              currentDocs = [];
            }
          }

          // Get existing style names for comparison
          const existingStyleNames = existingStyles.map((s) => s.name.toLowerCase());

          // Add new styles that don't already exist
          const membershipStartDateStr = new Date(startDate).toISOString().split("T")[0];
          const newStyles: Array<{
            name: string;
            rank?: string;
            startDate?: string;
            lastPromotionDate?: string;
            attendanceResetDate?: string;
            active: boolean;
          }> = [];

          let updatedDocs = [...currentDocs];
          let docsChanged = false;

          for (const style of stylesWithConfig) {
            if (!existingStyleNames.includes(style.name.toLowerCase())) {
              // Get the first rank from beltConfig
              const firstRank = getFirstRankFromBeltConfig(style.beltConfig);

              newStyles.push({
                name: style.name,
                rank: firstRank || undefined,
                startDate: membershipStartDateStr,
                lastPromotionDate: membershipStartDateStr,
                attendanceResetDate: membershipStartDateStr,
                active: true,
              });

              // Add rank PDFs for this style
              if (firstRank && style.beltConfig) {
                const result = addRankPdfsToDocuments(style.beltConfig, firstRank, updatedDocs);
                if (result.hasChanges) {
                  updatedDocs = result.docs;
                  docsChanged = true;
                }
              }
            }
          }

          // Reactivate existing styles that are linked to this plan
          let stylesModified = false;
          const reactivatedStyles = existingStyles.map(style => {
            const styleLower = style.name.toLowerCase();
            if (planStyleNames.includes(styleLower) && style.active === false) {
              stylesModified = true;

              // Also add rank PDFs for reactivated styles
              const styleConfig = stylesWithConfig.find(s => s.name.toLowerCase() === styleLower);
              if (style.rank && styleConfig?.beltConfig) {
                const result = addRankPdfsToDocuments(styleConfig.beltConfig, style.rank, updatedDocs);
                if (result.hasChanges) {
                  updatedDocs = result.docs;
                  docsChanged = true;
                }
              }

              return { ...style, active: true };
            }
            return style;
          });

          // Check if we need to update member status (PROSPECT -> ACTIVE)
          const shouldUpdateStatus = member?.status !== "ACTIVE";

          if (newStyles.length > 0 || stylesModified || docsChanged || shouldUpdateStatus) {
            const updatedStyles = [...reactivatedStyles, ...newStyles];

            // Build update data
            const updateData: {
              stylesNotes: string;
              primaryStyle?: string;
              rank?: string;
              styleDocuments?: string;
              status?: string;
            } = {
              stylesNotes: JSON.stringify(updatedStyles),
            };

            // Set primary style and rank if not already set
            if (!member?.primaryStyle && newStyles.length > 0) {
              updateData.primaryStyle = newStyles[0].name;
              if (newStyles[0].rank) {
                updateData.rank = newStyles[0].rank;
              }
            }

            // Update style documents if changed
            if (docsChanged) {
              updateData.styleDocuments = JSON.stringify(updatedDocs);
            }

            // Update member status to ACTIVE if they were a PROSPECT
            if (shouldUpdateStatus) {
              updateData.status = "ACTIVE";
            }

            await prisma.member.update({
              where: { id: memberId },
              data: updateData,
            });
          }
        } else if (member?.status !== "ACTIVE") {
          // No styles to add, but still update member status to ACTIVE
          await prisma.member.update({
            where: { id: memberId },
            data: { status: "ACTIVE" },
          });
        }
      } catch (styleError) {
        // Log but don't fail the membership creation
        console.error("Error attaching styles to member:", styleError);
      }
    } else if (membershipIsActive && member?.status !== "ACTIVE") {
      // Even if no allowed styles, update member status to ACTIVE
      await prisma.member.update({
        where: { id: memberId },
        data: { status: "ACTIVE" },
      });
    }
    // Note: When allowedStyles is null, the plan covers ALL styles for eligibility purposes,
    // but we should NOT auto-activate any styles. Styles should only be activated when
    // the plan explicitly includes specific styles (allowedStyles has style IDs).

    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    console.error("Error creating membership:", error);
    return new NextResponse("Failed to create membership", { status: 500 });
  }
}
