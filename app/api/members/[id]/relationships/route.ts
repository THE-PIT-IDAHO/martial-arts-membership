// app/api/members/[id]/relationships/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// Directed relationships: PARENT, GUARDIAN, PAYS_FOR
async function ensureDirectedRelationship(
  fromMemberId: string,
  toMemberId: string,
  relationship: string
) {
  if (fromMemberId === toMemberId) return;

  const existing = await prisma.memberRelationship.findFirst({
    where: { fromMemberId, toMemberId, relationship }
  });

  if (!existing) {
    await prisma.memberRelationship.create({
      data: { fromMemberId, toMemberId, relationship }
    });
  }
}

// Symmetric relationships: SIBLING, SPOUSE, SIGNIFICANT_OTHER
async function ensureSymmetricRelationship(
  memberAId: string,
  memberBId: string,
  relationship: string
) {
  if (memberAId === memberBId) return;

  // Canonical ordering so we only ever store one row per pair
  const [fromMemberId, toMemberId] =
    memberAId < memberBId
      ? [memberAId, memberBId]
      : [memberBId, memberAId];

  const existing = await prisma.memberRelationship.findFirst({
    where: { fromMemberId, toMemberId, relationship }
  });

  if (!existing) {
    await prisma.memberRelationship.create({
      data: { fromMemberId, toMemberId, relationship }
    });
  }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: memberId } = await params;

  const relationships = await prisma.memberRelationship.findMany({
    where: {
      OR: [{ fromMemberId: memberId }, { toMemberId: memberId }]
    },
    include: {
      fromMember: true,
      toMember: true
    },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ relationships });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: currentMemberId } = await params;
  const body = await req.json();

  const targetMemberId: string = body.targetMemberId;
  const relationship: string = body.relationship;

  if (!targetMemberId || !relationship) {
    return NextResponse.json(
      { error: "targetMemberId and relationship are required" },
      { status: 400 }
    );
  }

  if (targetMemberId === currentMemberId) {
    return NextResponse.json(
      { error: "Cannot link a member to themselves." },
      { status: 400 }
    );
  }

  // Determine canonical relationship + direction
  let rel = relationship as string;

  if (rel === "PARENT" || rel === "CHILD") {
    // Parent/child logic
    let parentId: string;
    let childId: string;

    if (rel === "PARENT") {
      // "Parent of X" – current member is parent
      parentId = currentMemberId;
      childId = targetMemberId;
    } else {
      // "Child of X" – current member is child
      parentId = targetMemberId;
      childId = currentMemberId;
      rel = "PARENT";
    }

    // Store single directed relationship: PARENT from parent -> child
    await ensureDirectedRelationship(parentId, childId, "PARENT");

    // Auto-create sibling links between all children of this parent
    const existingChildren = await prisma.memberRelationship.findMany({
      where: {
        relationship: "PARENT",
        fromMemberId: parentId
      }
    });

    const childIds = existingChildren.map((r) => r.toMemberId);

    // For every pair of children, ensure a SIBLING relationship exists
    for (let i = 0; i < childIds.length; i++) {
      for (let j = i + 1; j < childIds.length; j++) {
        await ensureSymmetricRelationship(childIds[i], childIds[j], "SIBLING");
      }
    }
  } else if (rel === "GUARDIAN") {
    // Guardian is directional, similar to parent
    // UI is "Guardian of X" – current member is guardian
    await ensureDirectedRelationship(currentMemberId, targetMemberId, "GUARDIAN");
  } else if (rel === "SPOUSE" || rel === "SIGNIFICANT_OTHER" || rel === "SIBLING") {
    // Symmetric: store one canonical record with sorted IDs
    await ensureSymmetricRelationship(currentMemberId, targetMemberId, rel);
  } else if (rel === "PAYS_FOR" || rel === "PAID_FOR_BY") {
    // Payment relationships are directional, but we store only PAYS_FOR
    let payerId: string;
    let payeeId: string;

    if (rel === "PAYS_FOR") {
      // "Pays for X" – current member pays for target
      payerId = currentMemberId;
      payeeId = targetMemberId;
    } else {
      // "Paid for by X" – current member is payee; target pays
      payerId = targetMemberId;
      payeeId = currentMemberId;
    }

    await ensureDirectedRelationship(payerId, payeeId, "PAYS_FOR");
  } else {
    // Fallback: just store as directed, current -> target
    await ensureDirectedRelationship(currentMemberId, targetMemberId, rel);
  }

  // Return fresh relationship list for this member
  const relationships = await prisma.memberRelationship.findMany({
    where: {
      OR: [
        { fromMemberId: currentMemberId },
        { toMemberId: currentMemberId }
      ]
    },
    include: {
      fromMember: true,
      toMember: true
    },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ relationships });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id: memberId } = await params;
  const body = await req.json();
  const id = body.id as string;

  if (!id) {
    return NextResponse.json(
      { error: "Relationship id is required" },
      { status: 400 }
    );
  }

  const rel = await prisma.memberRelationship.findUnique({
    where: { id }
  });

  if (!rel) {
    return NextResponse.json(
      { error: "Relationship not found" },
      { status: 404 }
    );
  }

  await prisma.memberRelationship.delete({ where: { id } });

  const relationships = await prisma.memberRelationship.findMany({
    where: {
      OR: [{ fromMemberId: memberId }, { toMemberId: memberId }]
    },
    include: { fromMember: true, toMember: true },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({ relationships });
}
