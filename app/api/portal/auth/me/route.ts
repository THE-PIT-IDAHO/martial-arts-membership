import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import {
  getStyleProgress,
  attendanceCountsForStyle,
  type AttendanceRow,
} from "@/lib/rank-progress";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      id: true,
      clientId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      photoUrl: true,
      rank: true,
      primaryStyle: true,
      stylesNotes: true,
      status: true,
      dateOfBirth: true,
      memberNumber: true,
      waiverSigned: true,
      emailOptIn: true,
      accountCreditCents: true,
      portalPasswordHash: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          membershipPlan: {
            select: { name: true, billingCycle: true },
          },
        },
        take: 1,
      },
      attendances: {
        where: { confirmed: true },
        select: {
          id: true,
          attendanceDate: true,
          checkedInAt: true,
          source: true,
          classSession: {
            select: {
              classType: true,
              classTypes: true,
              styleName: true,
              styleNames: true,
            },
          },
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Parse enrolled styles
  let enrolledStyles: Array<{
    name: string;
    rank?: string;
    attendanceResetDate?: string;
    active?: boolean;
  }> = [];
  if (member.stylesNotes) {
    try {
      enrolledStyles = JSON.parse(member.stylesNotes);
    } catch { /* ignore */ }
  }
  if (enrolledStyles.length === 0 && member.primaryStyle && member.rank) {
    enrolledStyles = [{ name: member.primaryStyle, rank: member.rank }];
  }

  // Build rank info with belt layers and attendance progress per style
  const rankInfo: Array<{
    styleName: string;
    rankName: string;
    beltLayers: Record<string, unknown> | null;
    nextRankName: string | null;
    classRequirements: Array<{
      label: string;
      attended: number;
      required: number;
      met: boolean;
    }>;
    allRanks: string[];
  }> = [];

  for (const enrolled of enrolledStyles) {
    if (!enrolled.name || !enrolled.rank) continue;
    if (enrolled.active === false) continue;

    const style = await prisma.style.findFirst({
      where: { name: enrolled.name, clientId: member.clientId },
      select: { beltConfig: true, showProgressInPortal: true },
    });

    // Portal-progress visibility: per-member override on stylesNotes
    // wins over the per-style default; both fall back to hidden.
    const enrolledOverride = (enrolled as { showProgressInPortal?: boolean }).showProgressInPortal;
    const styleDefault = style?.showProgressInPortal ?? false;
    const progressVisibleToMember =
      typeof enrolledOverride === "boolean" ? enrolledOverride : styleDefault;

    let beltLayers: Record<string, unknown> | null = null;
    let nextRankName: string | null = null;
    let classRequirements: Array<{
      label: string;
      attended: number;
      required: number;
      met: boolean;
    }> = [];

    if (style?.beltConfig) {
      try {
        const config = JSON.parse(style.beltConfig);
        const ranks: Array<{
          name: string;
          order: number;
          layers?: Record<string, unknown>;
          classRequirements?: Array<{ label: string; minCount: number }>;
        }> = config.ranks || [];

        const sortedRanks = [...ranks].sort((a, b) => a.order - b.order);

        // Find current rank
        const currentRankIndex = sortedRanks.findIndex(
          (r) => r.name.toLowerCase() === enrolled.rank!.toLowerCase()
        );

        // Get belt layers for current rank
        const defaultStyleLayers = config.layers || {};
        if (currentRankIndex >= 0) {
          const currentRank = sortedRanks[currentRankIndex];
          beltLayers = { ...defaultStyleLayers, ...(currentRank.layers || {}), fabric: true };

          // Single-source rank-progress computation lives in
          // lib/rank-progress so every view agrees on the numbers.
          const progress = getStyleProgress(
            (member.attendances || []) as AttendanceRow[],
            enrolled,
            style.beltConfig,
          );
          nextRankName = progress.nextRankName;
          classRequirements = progress.requirements;

          // Legacy fallback: numeric total requirement on the Rank
          // row when beltConfig has no per-type requirements.
          if (classRequirements.length === 0) {
            const rankModel = await prisma.rank.findFirst({
              where: { name: currentRank.name, style: { clientId: member.clientId } },
              select: { classRequirement: true },
            });
            if (rankModel?.classRequirement) {
              const totalAttended = ((member.attendances || []) as AttendanceRow[]).filter(
                (att) => attendanceCountsForStyle(att, enrolled),
              ).length;
              classRequirements = [{
                label: "Classes",
                attended: totalAttended,
                required: rankModel.classRequirement,
                met: totalAttended >= rankModel.classRequirement,
              }];
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Build rank progression list for belt bar
    let allRanks: string[] = [];
    if (style?.beltConfig) {
      try {
        const c = JSON.parse(style.beltConfig);
        allRanks = (c.ranks || [])
          .sort((a: any, b: any) => a.order - b.order)
          .map((r: any) => r.name);
      } catch {}
    }

    rankInfo.push({
      styleName: enrolled.name,
      rankName: enrolled.rank,
      beltLayers,
      nextRankName,
      classRequirements: progressVisibleToMember ? classRequirements : [],
      allRanks,
    });
  }

  // Check for pending (unconfirmed) waivers
  const pendingWaiverCount = await prisma.signedWaiver.count({
    where: { memberId: member.id, confirmed: false },
  });

  // Don't send raw attendances/stylesNotes/passwordHash to the client
  const { attendances: _a, stylesNotes: _s, portalPasswordHash, ...memberData } = member;

  return NextResponse.json({
    ...memberData,
    mustSetPassword: !portalPasswordHash,
    hasPendingWaiver: pendingWaiverCount > 0,
    rankInfo,
  });
}
