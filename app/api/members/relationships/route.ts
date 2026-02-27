import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function POST(request: Request) {
  try {
    const clientId = await getClientId(request);
    const body = await request.json();
    const { fromMemberId, toMemberId, relationship } = body;

    if (!fromMemberId || !toMemberId || !relationship) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify both members belong to this tenant
    const members = await prisma.member.findMany({
      where: { id: { in: [fromMemberId, toMemberId] }, clientId },
      select: { id: true },
    });
    if (members.length !== 2) {
      return NextResponse.json(
        { error: "One or both members not found" },
        { status: 404 }
      );
    }

    // Check if relationship already exists
    const existing = await prisma.memberRelationship.findFirst({
      where: {
        fromMemberId,
        toMemberId,
      },
    });

    if (existing) {
      // Update existing relationship
      const updated = await prisma.memberRelationship.update({
        where: { id: existing.id },
        data: { relationship },
      });
      return NextResponse.json({ relationship: updated });
    }

    // Create new relationship
    const memberRelationship = await prisma.memberRelationship.create({
      data: {
        fromMemberId,
        toMemberId,
        relationship,
      },
    });

    return NextResponse.json({ relationship: memberRelationship });
  } catch (error) {
    console.error("Failed to create relationship:", error);
    return NextResponse.json(
      { error: "Failed to create relationship" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const clientId = await getClientId(request);
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("memberId");

    if (!memberId) {
      return NextResponse.json(
        { error: "Missing memberId parameter" },
        { status: 400 }
      );
    }

    // Verify member belongs to this tenant
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { clientId: true },
    });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Get all relationships where this member is either from or to
    const relationships = await prisma.memberRelationship.findMany({
      where: {
        OR: [
          { fromMemberId: memberId },
          { toMemberId: memberId },
        ],
      },
      include: {
        fromMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
        toMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({ relationships });
  } catch (error) {
    console.error("Failed to fetch relationships:", error);
    return NextResponse.json(
      { error: "Failed to fetch relationships" },
      { status: 500 }
    );
  }
}
