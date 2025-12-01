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
    const { startDate, endDate, status } = body;

    const membership = await prisma.membership.update({
      where: { id },
      data: {
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status !== undefined && { status }),
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

    await prisma.membership.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting membership:", error);
    return new NextResponse("Failed to delete membership", { status: 500 });
  }
}
