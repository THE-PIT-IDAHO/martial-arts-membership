import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/family — returns linked children for the SIGNED-IN member.
// (Uses sessionMemberId — not the effective/viewing-as id — so the switcher
// always lists what the real signed-in parent can switch into, even when
// they're currently viewing as a child.)
//
// Relationship matching is loose: stored values vary historically between
// "PARENT" / "Parent of" / "GUARDIAN" / "Guardian of", so we just return
// every outgoing relationship from the signed-in member.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const relationships = await prisma.memberRelationship.findMany({
    where: {
      fromMemberId: auth.sessionMemberId,
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

  // Dedupe by child id -- with the guardian-waiver auto-attach that
  // now spawns BOTH a kinship row (PARENT / "Parent of" / etc.) AND
  // a PAYS_FOR row per parent-child pair, the raw list has two rows
  // per child and the portal was rendering duplicates. When both
  // exist, prefer the kinship label over "PAYS_FOR" for display --
  // PAYS_FOR is billing metadata, not what the parent thinks of as
  // their relationship to the kid.
  const byChildId = new Map<string, typeof relationships[number]>();
  for (const rel of relationships) {
    const existing = byChildId.get(rel.toMember.id);
    if (!existing) {
      byChildId.set(rel.toMember.id, rel);
    } else if (existing.relationship === "PAYS_FOR" && rel.relationship !== "PAYS_FOR") {
      byChildId.set(rel.toMember.id, rel);
    }
  }
  const children = Array.from(byChildId.values()).map((rel) => ({
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

  // Self (the signed-in parent) — used by the switcher dropdown to render
  // their own row alongside the kids.
  const self = await prisma.member.findUnique({
    where: { id: auth.sessionMemberId },
    select: { id: true, firstName: true, lastName: true, photoUrl: true },
  });

  return NextResponse.json({
    children,
    self,
    sessionMemberId: auth.sessionMemberId,
    viewingAsMemberId: auth.memberId, // equals sessionMemberId when not switched
  });
}
