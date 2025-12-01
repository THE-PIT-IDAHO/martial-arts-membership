import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/membership-types/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const membershipType = await prisma.membershipType.findUnique({
      where: { id },
      include: {
        membershipPlans: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (!membershipType) {
      return new NextResponse("Membership type not found", { status: 404 });
    }

    return NextResponse.json({ membershipType });
  } catch (error) {
    console.error("Error fetching membership type:", error);
    return new NextResponse("Failed to load membership type", { status: 500 });
  }
}

// PATCH /api/membership-types/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, color, sortOrder, isActive } = body;

    const membershipType = await prisma.membershipType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(color !== undefined && { color: color || null }),
        ...(sortOrder !== undefined && { sortOrder: sortOrder ? Number(sortOrder) : 0 }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ membershipType });
  } catch (error) {
    console.error("Error updating membership type:", error);
    return new NextResponse("Failed to update membership type", { status: 500 });
  }
}

// DELETE /api/membership-types/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if any membership plans are using this type
    const plansUsingType = await prisma.membershipPlan.count({
      where: { membershipTypeId: id },
    });

    if (plansUsingType > 0) {
      return new NextResponse(
        `Cannot delete type with ${plansUsingType} membership plan(s) using it. Please reassign them first.`,
        { status: 400 }
      );
    }

    await prisma.membershipType.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting membership type:", error);
    return new NextResponse("Failed to delete membership type", { status: 500 });
  }
}
