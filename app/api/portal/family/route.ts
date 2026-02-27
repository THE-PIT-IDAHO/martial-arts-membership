import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/family — returns linked children for the authenticated parent
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find children via MemberRelationship where this member is the parent/guardian
  const relationships = await prisma.memberRelationship.findMany({
    where: {
      fromMemberId: auth.memberId,
      relationship: { in: ["PARENT", "GUARDIAN"] },
    },
    include: {
      toMember: {
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
              membershipPlan: { select: { name: true } },
            },
            take: 1,
          },
          trialPasses: {
            where: { status: "ACTIVE" },
            select: { id: true, classesUsed: true, maxClasses: true, expiresAt: true },
            take: 1,
          },
        },
      },
    },
  });

  const children = relationships.map((rel) => ({
    id: rel.toMember.id,
    firstName: rel.toMember.firstName,
    lastName: rel.toMember.lastName,
    photoUrl: rel.toMember.photoUrl,
    rank: rel.toMember.rank,
    primaryStyle: rel.toMember.primaryStyle,
    status: rel.toMember.status,
    dateOfBirth: rel.toMember.dateOfBirth,
    relationship: rel.relationship,
    activePlan: rel.toMember.memberships[0]?.membershipPlan.name || null,
    activeTrial: rel.toMember.trialPasses[0] || null,
  }));

  return NextResponse.json({ children });
}
