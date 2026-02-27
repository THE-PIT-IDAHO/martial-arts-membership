import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseLocalDate } from "@/lib/dates";
import { isUnderContract, calculateEarlyTerminationFee, calculateCancellationEffectiveDate } from "@/lib/contracts";
import { logAudit } from "@/lib/audit";

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

// Helper function to get all PDF names from a style's beltConfig
function getPdfNamesFromBeltConfig(beltConfig: string | null): string[] {
  if (!beltConfig) return [];
  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (!config.ranks || !Array.isArray(config.ranks)) return [];

    const pdfNames: string[] = [];
    for (const rank of config.ranks) {
      if (rank.pdfDocuments && Array.isArray(rank.pdfDocuments)) {
        for (const pdf of rank.pdfDocuments) {
          if (pdf.name) pdfNames.push(pdf.name);
        }
      }
    }
    return pdfNames;
  } catch {
    return [];
  }
}

// Helper function to add rank PDFs for a specific rank
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

    const targetRank = config.ranks.find((r: BeltRank) => r.name === targetRankName);
    if (!targetRank) return { docs: currentDocs, hasChanges: false };

    const ranksToInclude = config.ranks.filter((r: BeltRank) => r.order <= targetRank.order);

    let hasChanges = false;
    const updatedDocs = [...currentDocs];

    for (const rank of ranksToInclude) {
      if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

      for (const rankPdf of rank.pdfDocuments) {
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

// Helper function to sync member's styles and rank documents based on their active/canceled memberships
// Any style not covered by an active/canceled membership should be inactive
// Rank documents are removed for inactive styles and added for active styles
async function syncMemberStyles(memberId: string) {
  // Get member's current styles and documents
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { stylesNotes: true, styleDocuments: true },
  });

  if (!member?.stylesNotes) return;

  // Get all active/canceled memberships for this member (NOT paused - paused = inactive)
  const activeMemberships = await prisma.membership.findMany({
    where: {
      memberId,
      status: { in: ["ACTIVE", "CANCELED"] },
    },
    include: {
      membershipPlan: {
        select: { allowedStyles: true },
      },
    },
  });

  // Collect all style IDs covered by active/canceled memberships
  const coveredStyleIds: string[] = [];
  let coversAllStyles = false;

  for (const membership of activeMemberships) {
    if (membership.membershipPlan.allowedStyles) {
      const styleIds: string[] = JSON.parse(membership.membershipPlan.allowedStyles);
      coveredStyleIds.push(...styleIds);
    } else {
      // allowedStyles is null - this plan covers ALL styles
      coversAllStyles = true;
    }
  }

  // Get style details including beltConfig for document management
  let coveredStyles: Array<{ id: string; name: string; beltConfig: string | null }> = [];
  if (coversAllStyles) {
    coveredStyles = await prisma.style.findMany({
      select: { id: true, name: true, beltConfig: true },
    });
  } else if (coveredStyleIds.length > 0) {
    coveredStyles = await prisma.style.findMany({
      where: { id: { in: Array.from(new Set(coveredStyleIds)) } },
      select: { id: true, name: true, beltConfig: true },
    });
  }

  const coveredStyleNames = coveredStyles.map(s => s.name.toLowerCase());

  // Parse member's styles
  const memberStyles: Array<{
    name: string;
    rank?: string;
    beltSize?: string;
    uniformSize?: string;
    startDate?: string;
    lastPromotionDate?: string;
    active?: boolean;
  }> = JSON.parse(member.stylesNotes);

  // Parse current style documents
  let currentDocs: StyleDocument[] = [];
  if (member.styleDocuments) {
    try {
      currentDocs = JSON.parse(member.styleDocuments);
    } catch {
      currentDocs = [];
    }
  }

  let stylesUpdated = false;
  let docsUpdated = false;
  let updatedDocs = [...currentDocs];

  const updatedStyles = memberStyles.map(style => {
    const styleLower = style.name.toLowerCase();
    const shouldBeActive = coveredStyleNames.includes(styleLower);
    const styleConfig = coveredStyles.find(s => s.name.toLowerCase() === styleLower);

    if (shouldBeActive && style.active === false) {
      // Style should be active but is inactive - activate it and add rank documents
      stylesUpdated = true;

      // Add rank documents for this style
      if (style.rank && styleConfig?.beltConfig) {
        const result = addRankPdfsToDocuments(styleConfig.beltConfig, style.rank, updatedDocs);
        if (result.hasChanges) {
          updatedDocs = result.docs;
          docsUpdated = true;
        }
      }

      return { ...style, active: true };
    } else if (!shouldBeActive && style.active !== false) {
      // Style should be inactive but is active - deactivate it
      // Rank documents will be removed in the loop below
      stylesUpdated = true;
      return { ...style, active: false };
    }
    return style;
  });

  // Remove rank documents for styles that became inactive
  // Fetch all styles once for efficient lookup
  const allStyles = await prisma.style.findMany({
    select: { name: true, beltConfig: true },
  });

  for (const style of memberStyles) {
    const styleLower = style.name.toLowerCase();
    const shouldBeActive = coveredStyleNames.includes(styleLower);
    const wasActive = style.active !== false;

    if (!shouldBeActive && wasActive) {
      // This style is becoming inactive - remove its rank documents
      const styleData = allStyles.find(s => s.name.toLowerCase() === styleLower);

      if (styleData?.beltConfig) {
        const pdfNamesToRemove = getPdfNamesFromBeltConfig(styleData.beltConfig);
        if (pdfNamesToRemove.length > 0) {
          const beforeCount = updatedDocs.length;
          updatedDocs = updatedDocs.filter(doc => !pdfNamesToRemove.includes(doc.name));
          if (updatedDocs.length < beforeCount) {
            docsUpdated = true;
          }
        }
      }
    }
  }

  // Update member if styles or documents changed
  if (stylesUpdated || docsUpdated) {
    const updateData: { stylesNotes?: string; styleDocuments?: string } = {};

    if (stylesUpdated) {
      updateData.stylesNotes = JSON.stringify(updatedStyles);
    }
    if (docsUpdated) {
      updateData.styleDocuments = JSON.stringify(updatedDocs);
    }

    await prisma.member.update({
      where: { id: memberId },
      data: updateData,
    });
  }
}

// Helper function to set attendance reset date for specific styles when membership expires/pauses
// This resets the attendance count toward rank requirements
async function setAttendanceResetDate(memberId: string, styleNames: string[]) {
  if (styleNames.length === 0) return;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { stylesNotes: true },
  });

  if (!member?.stylesNotes) return;

  const memberStyles: Array<{
    name: string;
    rank?: string;
    beltSize?: string;
    uniformSize?: string;
    startDate?: string;
    lastPromotionDate?: string;
    active?: boolean;
    attendanceResetDate?: string;
  }> = JSON.parse(member.stylesNotes);

  const today = new Date().toISOString().split("T")[0];
  const styleNamesLower = styleNames.map(s => s.toLowerCase());

  let updated = false;
  const updatedStyles = memberStyles.map(style => {
    if (styleNamesLower.includes(style.name.toLowerCase())) {
      updated = true;
      return { ...style, attendanceResetDate: today };
    }
    return style;
  });

  if (updated) {
    await prisma.member.update({
      where: { id: memberId },
      data: { stylesNotes: JSON.stringify(updatedStyles) },
    });
  }
}

// Helper function to get style names covered by a membership plan
async function getStyleNamesForMembership(membershipPlanId: string): Promise<string[]> {
  const plan = await prisma.membershipPlan.findUnique({
    where: { id: membershipPlanId },
    select: { allowedStyles: true },
  });

  if (!plan) return [];

  if (plan.allowedStyles) {
    const styleIds: string[] = JSON.parse(plan.allowedStyles);
    if (styleIds.length > 0) {
      const styles = await prisma.style.findMany({
        where: { id: { in: styleIds } },
        select: { name: true },
      });
      return styles.map(s => s.name);
    }
    return [];
  } else {
    // allowedStyles is null - this plan covers ALL styles
    const allStyles = await prisma.style.findMany({
      select: { name: true },
    });
    return allStyles.map(s => s.name);
  }
}

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
    const { startDate, endDate, status, customPriceCents, lastPaymentDate, nextPaymentDate, pauseEndDate, membershipPlanId, cancellationReason } = body;

    // Handle plan change (upgrade/downgrade)
    if (membershipPlanId) {
      // Get current membership with member data
      const currentMembership = await prisma.membership.findUnique({
        where: { id },
        include: {
          membershipPlan: { select: { id: true, billingCycle: true } },
          member: {
            select: {
              id: true,
              stylesNotes: true,
              styleDocuments: true,
              primaryStyle: true,
            },
          },
        },
      });

      if (!currentMembership) {
        return new NextResponse("Membership not found", { status: 404 });
      }

      // Get the new plan with allowedStyles
      const newPlan = await prisma.membershipPlan.findUnique({
        where: { id: membershipPlanId },
        select: { id: true, billingCycle: true, priceCents: true, allowedStyles: true },
      });

      if (!newPlan) {
        return new NextResponse("Membership plan not found", { status: 404 });
      }

      // Update the membership with the new plan
      const updatedMembership = await prisma.membership.update({
        where: { id },
        data: {
          membershipPlanId,
          // Set custom recurring price if provided, otherwise clear it (use new plan's standard price)
          customPriceCents: customPriceCents !== undefined ? customPriceCents : null,
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

      // Add new styles from the new plan if membership is active
      if (currentMembership.status === "ACTIVE" && newPlan.allowedStyles) {
        try {
          const includedStyleIds: string[] = JSON.parse(newPlan.allowedStyles);

          if (includedStyleIds.length > 0) {
            // Get the styles with their beltConfig
            const stylesWithConfig = await prisma.style.findMany({
              where: { id: { in: includedStyleIds } },
              select: { id: true, name: true, beltConfig: true },
            });

            // Parse member's current styles
            const memberStyles: Array<{
              name: string;
              rank?: string;
              beltSize?: string;
              uniformSize?: string;
              startDate?: string;
              lastPromotionDate?: string;
              attendanceResetDate?: string;
              active?: boolean;
            }> = currentMembership.member.stylesNotes
              ? JSON.parse(currentMembership.member.stylesNotes)
              : [];

            // Parse current style documents
            let currentDocs: StyleDocument[] = [];
            if (currentMembership.member.styleDocuments) {
              try {
                currentDocs = JSON.parse(currentMembership.member.styleDocuments);
              } catch {
                currentDocs = [];
              }
            }

            const existingStyleNames = memberStyles.map((s) => s.name.toLowerCase());
            const todayStr = new Date().toISOString().split("T")[0];
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
                  startDate: todayStr,
                  lastPromotionDate: todayStr,
                  attendanceResetDate: todayStr,
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

            if (newStyles.length > 0 || docsChanged) {
              const updatedStyles = [...memberStyles, ...newStyles];

              const updateData: {
                stylesNotes: string;
                primaryStyle?: string;
                rank?: string;
                styleDocuments?: string;
              } = {
                stylesNotes: JSON.stringify(updatedStyles),
              };

              // Set primary style if not already set
              if (!currentMembership.member.primaryStyle && newStyles.length > 0) {
                updateData.primaryStyle = newStyles[0].name;
                if (newStyles[0].rank) {
                  updateData.rank = newStyles[0].rank;
                }
              }

              if (docsChanged) {
                updateData.styleDocuments = JSON.stringify(updatedDocs);
              }

              await prisma.member.update({
                where: { id: updatedMembership.memberId },
                data: updateData,
              });
            }
          }
        } catch (styleError) {
          console.error("Error adding styles from new plan:", styleError);
        }
      }

      // Sync member styles to reflect the plan change (deactivate styles no longer covered)
      try {
        await syncMemberStyles(updatedMembership.memberId);
      } catch (syncError) {
        console.error("Error syncing member styles after plan change:", syncError);
      }

      // Fetch the updated member with all memberships to return to the client
      const updatedMember = await prisma.member.findUnique({
        where: { id: updatedMembership.memberId },
        include: {
          attendances: {
            where: { confirmed: true },
            include: {
              classSession: {
                select: {
                  id: true,
                  name: true,
                  classType: true,
                  styleName: true,
                  styleNames: true,
                  program: true,
                },
              },
            },
          },
          memberships: {
            include: {
              membershipPlan: {
                select: {
                  id: true,
                  name: true,
                  membershipId: true,
                  priceCents: true,
                  billingCycle: true,
                  allowedStyles: true,
                  color: true,
                },
              },
            },
            orderBy: { startDate: "desc" },
          },
        },
      });

      return NextResponse.json({ membership: updatedMembership, member: updatedMember });
    }

    // Contract enforcement on cancellation
    let contractInfo: { underContract: boolean; earlyTerminationFeeCents: number; effectiveDate: Date | null } | null = null;
    if (status === "CANCELED") {
      const membershipForContract = await prisma.membership.findUnique({
        where: { id },
        include: {
          membershipPlan: {
            select: { cancellationFeeCents: true, cancellationNoticeDays: true, contractLengthMonths: true },
          },
        },
      });
      if (membershipForContract) {
        const underContract = isUnderContract(membershipForContract);
        const earlyTerminationFeeCents = calculateEarlyTerminationFee(membershipForContract, membershipForContract.membershipPlan);
        const effectiveDate = calculateCancellationEffectiveDate(membershipForContract.membershipPlan);
        contractInfo = { underContract, earlyTerminationFeeCents, effectiveDate };
      }
    }

    // When canceling a membership, clear nextPaymentDate (no more payments)
    const shouldClearNextPayment = status === "CANCELED" || status === "EXPIRED";

    // When pausing, clear nextPaymentDate; when activating, clear pauseEndDate
    const shouldClearPauseEndDate = status === "ACTIVE" || status === "CANCELED" || status === "EXPIRED";

    // Check if we're reactivating from CANCELED/EXPIRED/PAUSED - need to recalculate next payment date
    let calculatedNextPaymentDate: Date | null = null;
    if (status === "ACTIVE") {
      const currentMembership = await prisma.membership.findUnique({
        where: { id },
        include: {
          membershipPlan: {
            select: { billingCycle: true },
          },
        },
      });

      if (currentMembership?.status === "CANCELED" || currentMembership?.status === "EXPIRED" || currentMembership?.status === "PAUSED") {
        // Reactivating - calculate next payment date based on last payment date + billing cycle
        const billingCycle = currentMembership.membershipPlan.billingCycle || "MONTHLY";
        const baseDate = currentMembership.lastPaymentDate
          ? new Date(currentMembership.lastPaymentDate)
          : new Date();
        baseDate.setHours(0, 0, 0, 0);

        // Calculate next payment from last payment date, advancing until we get a future date
        const addBillingCycle = (date: Date): Date => {
          const newDate = new Date(date);
          switch (billingCycle) {
            case "WEEKLY":
              newDate.setDate(newDate.getDate() + 7);
              break;
            case "BIWEEKLY":
              newDate.setDate(newDate.getDate() + 14);
              break;
            case "MONTHLY":
              newDate.setMonth(newDate.getMonth() + 1);
              break;
            case "QUARTERLY":
              newDate.setMonth(newDate.getMonth() + 3);
              break;
            case "SEMIANNUAL":
              newDate.setMonth(newDate.getMonth() + 6);
              break;
            case "ANNUAL":
              newDate.setFullYear(newDate.getFullYear() + 1);
              break;
            default:
              newDate.setMonth(newDate.getMonth() + 1);
          }
          return newDate;
        };

        // Start from last payment and advance until we get a future date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        calculatedNextPaymentDate = addBillingCycle(baseDate);

        // Keep advancing if the calculated date is in the past
        while (calculatedNextPaymentDate <= today) {
          calculatedNextPaymentDate = addBillingCycle(calculatedNextPaymentDate);
        }
      }
    }

    // If startDate is being changed (and lastPaymentDate not explicitly provided),
    // also update lastPaymentDate to match and recalculate nextPaymentDate
    let startDatePaymentUpdates: { lastPaymentDate?: Date; nextPaymentDate?: Date } = {};
    if (startDate !== undefined && lastPaymentDate === undefined) {
      const newStartDate = parseLocalDate(startDate);
      startDatePaymentUpdates.lastPaymentDate = newStartDate;

      // Get the current membership to check billing cycle
      const currentMembershipForStart = await prisma.membership.findUnique({
        where: { id },
        include: {
          membershipPlan: { select: { billingCycle: true } },
        },
      });

      if (currentMembershipForStart?.membershipPlan.billingCycle) {
        // Calculate next payment date from new start date
        const billingCycle = currentMembershipForStart.membershipPlan.billingCycle;
        const addCycle = (date: Date): Date => {
          const newDate = new Date(date);
          switch (billingCycle.toUpperCase()) {
            case "DAILY": newDate.setDate(newDate.getDate() + 1); break;
            case "WEEKLY": newDate.setDate(newDate.getDate() + 7); break;
            case "BIWEEKLY": newDate.setDate(newDate.getDate() + 14); break;
            case "MONTHLY": newDate.setMonth(newDate.getMonth() + 1); break;
            case "QUARTERLY": newDate.setMonth(newDate.getMonth() + 3); break;
            case "SEMI_ANNUALLY":
            case "SEMI-ANNUALLY":
            case "SEMIANNUALLY": newDate.setMonth(newDate.getMonth() + 6); break;
            case "YEARLY":
            case "ANNUALLY": newDate.setFullYear(newDate.getFullYear() + 1); break;
            default: newDate.setMonth(newDate.getMonth() + 1);
          }
          return newDate;
        };

        // Calculate next payment, advancing until we get a future date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let nextPmtDate = addCycle(newStartDate);
        while (nextPmtDate <= today) {
          nextPmtDate = addCycle(nextPmtDate);
        }
        startDatePaymentUpdates.nextPaymentDate = nextPmtDate;
      }
    }

    const membership = await prisma.membership.update({
      where: { id },
      data: {
        ...(startDate !== undefined && { startDate: parseLocalDate(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? parseLocalDate(endDate) : null }),
        ...(status !== undefined && { status }),
        ...(customPriceCents !== undefined && { customPriceCents }),
        // Use startDatePaymentUpdates if startDate changed, otherwise use explicit lastPaymentDate if provided
        ...(startDatePaymentUpdates.lastPaymentDate
          ? { lastPaymentDate: startDatePaymentUpdates.lastPaymentDate }
          : (lastPaymentDate !== undefined && { lastPaymentDate: lastPaymentDate ? parseLocalDate(lastPaymentDate) : null })),
        // Clear next payment if canceling/expiring/pausing, use startDate recalc, use reactivation calc, or use provided value
        ...(shouldClearNextPayment || status === "PAUSED"
          ? { nextPaymentDate: null }
          : startDatePaymentUpdates.nextPaymentDate
            ? { nextPaymentDate: startDatePaymentUpdates.nextPaymentDate }
            : calculatedNextPaymentDate
              ? { nextPaymentDate: calculatedNextPaymentDate }
              : (nextPaymentDate !== undefined && { nextPaymentDate: nextPaymentDate ? parseLocalDate(nextPaymentDate) : null })),
        // Handle pauseEndDate - clear when activating/canceling/expiring, set when pausing
        ...(shouldClearPauseEndDate
          ? { pauseEndDate: null }
          : (pauseEndDate !== undefined && { pauseEndDate: pauseEndDate ? parseLocalDate(pauseEndDate) : null })),
        // Contract enforcement fields on cancellation
        ...(status === "CANCELED" && contractInfo && {
          cancellationRequestDate: new Date(),
          cancellationEffectiveDate: contractInfo.effectiveDate,
          cancellationReason: cancellationReason || null,
        }),
        // Clear cancellation fields when reactivating
        ...(status === "ACTIVE" && {
          cancellationRequestDate: null,
          cancellationEffectiveDate: null,
          cancellationReason: null,
        }),
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
        // Membership activated - replace INACTIVE/PROSPECT/CANCELED with ACTIVE
        const filteredStatuses = currentStatuses.filter(
          (s: string) => !["INACTIVE", "PROSPECT", "CANCELED"].includes(s)
        );
        if (!filteredStatuses.includes("ACTIVE")) {
          filteredStatuses.unshift("ACTIVE");
        }
        const newStatus = filteredStatuses.join(",");

        await prisma.member.update({
          where: { id: membership.memberId },
          data: { status: newStatus },
        });
      } else if (status && status !== "ACTIVE") {
        // Membership deactivated (PAUSED, CANCELED, EXPIRED)

        if (status === "CANCELED") {
          // CANCELED: Member stays ACTIVE (membership valid until expiration), just add CANCELED tag
          // Check if member has ACTIVE status, if not add it
          if (!currentStatuses.includes("ACTIVE")) {
            currentStatuses.unshift("ACTIVE");
          }
          // Remove INACTIVE/PROSPECT if present
          const filteredStatuses = currentStatuses.filter(
            (s: string) => !["INACTIVE", "PROSPECT"].includes(s)
          );
          // Add CANCELED if not already present
          if (!filteredStatuses.includes("CANCELED")) {
            filteredStatuses.push("CANCELED");
          }
          const newStatus = filteredStatuses.join(",");

          await prisma.member.update({
            where: { id: membership.memberId },
            data: { status: newStatus },
          });
        } else {
          // PAUSED or EXPIRED - check if member has any other active/canceled memberships
          const otherActiveMemberships = await prisma.membership.findFirst({
            where: {
              memberId: membership.memberId,
              status: { in: ["ACTIVE", "CANCELED"] },
              id: { not: id },
            },
          });
          // If no other active/canceled memberships, replace ACTIVE with INACTIVE
          if (!otherActiveMemberships) {
            const filteredStatuses = currentStatuses.filter(
              (s: string) => !["ACTIVE", "PROSPECT", "CANCELED"].includes(s)
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

          // PAUSED or EXPIRED: Reset attendance for rank requirements for affected styles
          // This ensures attendance count starts fresh when membership is reinstated
          const affectedStyleNames = await getStyleNamesForMembership(membership.membershipPlanId);
          if (affectedStyleNames.length > 0) {
            await setAttendanceResetDate(membership.memberId, affectedStyleNames);
          }
        }
      }

      // Sync all member styles based on their active/canceled memberships
      try {
        await syncMemberStyles(membership.memberId);
      } catch (syncError) {
        console.error("Error syncing member styles:", syncError);
        // Don't fail the request if style sync fails
      }
    }

    // Fetch the updated member with all memberships to return to the client
    const updatedMember = await prisma.member.findUnique({
      where: { id: membership.memberId },
      include: {
        attendances: {
          where: { confirmed: true },
          include: {
            classSession: {
              select: {
                id: true,
                name: true,
                classType: true,
                styleName: true,
                styleNames: true,
                program: true,
              },
            },
          },
        },
        memberships: {
          include: {
            membershipPlan: {
              select: {
                id: true,
                name: true,
                membershipId: true,
                priceCents: true,
                billingCycle: true,
                allowedStyles: true,
                color: true,
              },
            },
          },
          orderBy: { startDate: "desc" },
        },
      },
    });

    const memberName = `${updatedMember?.firstName || ""} ${updatedMember?.lastName || ""}`.trim();
    const action = status === "CANCELED" ? "CANCEL" : "UPDATE";
    logAudit({
      entityType: "Membership",
      entityId: id,
      action,
      summary: `${action === "CANCEL" ? "Canceled" : "Updated"} membership for ${memberName}`,
    }).catch(() => {});

    return NextResponse.json({
      membership,
      member: updatedMember,
      ...(contractInfo && {
        contractInfo: {
          underContract: contractInfo.underContract,
          earlyTerminationFeeCents: contractInfo.earlyTerminationFeeCents,
          cancellationEffectiveDate: contractInfo.effectiveDate?.toISOString(),
        },
      }),
    });
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

    // Get membership info before deleting (including plan's allowed styles and member's styles)
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
    const wasActiveOrCanceled = membership.status === "ACTIVE" || membership.status === "CANCELED";
    const memberStatus = membership.member?.status;

    await prisma.membership.delete({
      where: { id },
    });

    // If deleted membership was active or canceled, check if they have any other active/canceled memberships
    // Handle multi-value statuses like "ACTIVE,COACH" or "INACTIVE,PARENT"
    if (wasActiveOrCanceled && memberStatus) {
      const otherActiveMemberships = await prisma.membership.findFirst({
        where: {
          memberId,
          status: { in: ["ACTIVE", "CANCELED"] },
        },
      });
      // If no other active/canceled memberships, replace ACTIVE with INACTIVE and remove CANCELED
      if (!otherActiveMemberships) {
        const currentStatuses = memberStatus.split(",").map((s: string) => s.trim());
        const filteredStatuses = currentStatuses.filter(
          (s: string) => !["ACTIVE", "PROSPECT", "CANCELED"].includes(s)
        );
        if (!filteredStatuses.includes("INACTIVE")) {
          filteredStatuses.unshift("INACTIVE");
        }
        const newStatus = filteredStatuses.join(",");

        await prisma.member.update({
          where: { id: memberId },
          data: { status: newStatus },
        });

        // Reset attendance for rank requirements for affected styles
        const affectedStyleNames = await getStyleNamesForMembership(membership.membershipPlanId);
        if (affectedStyleNames.length > 0) {
          await setAttendanceResetDate(memberId, affectedStyleNames);
        }
      }
    }

    // Sync all member styles based on their remaining active/canceled memberships
    try {
      await syncMemberStyles(memberId);
    } catch (syncError) {
      console.error("Error syncing member styles:", syncError);
      // Don't fail the request if style sync fails
    }

    // Fetch and return the updated member data
    const updatedMember = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        memberships: {
          include: {
            membershipPlan: true,
          },
        },
      },
    });

    return NextResponse.json({ member: updatedMember });
  } catch (error) {
    console.error("Error deleting membership:", error);
    return new NextResponse("Failed to delete membership", { status: 500 });
  }
}
