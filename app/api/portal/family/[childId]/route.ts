import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/family/[childId] — returns full child profile for parent
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ childId: string }> }
) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { childId } = await params;

  // Verify parent-child relationship
  const relationship = await prisma.memberRelationship.findFirst({
    where: {
      fromMemberId: auth.memberId,
      toMemberId: childId,
      relationship: { in: ["PARENT", "GUARDIAN"] },
    },
  });

  if (!relationship) {
    return NextResponse.json({ error: "Not authorized to view this member" }, { status: 403 });
  }

  const child = await prisma.member.findUnique({
    where: { id: childId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      rank: true,
      primaryStyle: true,
      status: true,
      dateOfBirth: true,
      stylesNotes: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          status: true,
          membershipPlan: { select: { name: true, billingCycle: true } },
        },
        take: 1,
      },
      trialPasses: {
        where: { status: "ACTIVE" },
        select: { id: true, classesUsed: true, maxClasses: true, expiresAt: true },
        take: 1,
      },
      attendances: {
        where: { confirmed: true },
        orderBy: { attendanceDate: "desc" },
        take: 20,
        select: {
          id: true,
          attendanceDate: true,
          checkedInAt: true,
          source: true,
          classSession: {
            select: {
              name: true,
              classType: true,
              classTypes: true,
              styleName: true,
              styleNames: true,
              startsAt: true,
            },
          },
        },
      },
      bookings: {
        where: {
          status: { in: ["CONFIRMED", "WAITLISTED"] },
          bookingDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        orderBy: { bookingDate: "asc" },
        take: 5,
        select: {
          id: true,
          bookingDate: true,
          status: true,
          classSession: {
            select: { name: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });

  if (!child) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Parse enrolled styles and build rank info
  let enrolledStyles: Array<{ name: string; rank?: string; attendanceResetDate?: string; active?: boolean }> = [];
  if (child.stylesNotes) {
    try { enrolledStyles = JSON.parse(child.stylesNotes); } catch {}
  }
  if (enrolledStyles.length === 0 && child.primaryStyle && child.rank) {
    enrolledStyles = [{ name: child.primaryStyle, rank: child.rank }];
  }

  const rankInfo: Array<{
    styleName: string;
    rankName: string;
    nextRankName: string | null;
    allRanks: string[];
  }> = [];

  for (const enrolled of enrolledStyles) {
    if (!enrolled.name || !enrolled.rank || enrolled.active === false) continue;

    const style = await prisma.style.findFirst({
      where: { name: enrolled.name },
      select: { beltConfig: true },
    });

    let allRanks: string[] = [];
    let nextRankName: string | null = null;

    if (style?.beltConfig) {
      try {
        const config = JSON.parse(style.beltConfig);
        const ranks = (config.ranks || []).sort((a: { order: number }, b: { order: number }) => a.order - b.order);
        allRanks = ranks.map((r: { name: string }) => r.name);
        const ci = ranks.findIndex((r: { name: string }) => r.name.toLowerCase() === enrolled.rank!.toLowerCase());
        if (ci >= 0 && ci < ranks.length - 1) {
          nextRankName = ranks[ci + 1].name;
        }
      } catch {}
    }

    rankInfo.push({ styleName: enrolled.name, rankName: enrolled.rank, nextRankName, allRanks });
  }

  const { stylesNotes: _, ...childData } = child;

  return NextResponse.json({
    ...childData,
    relationship: relationship.relationship,
    rankInfo,
  });
}
