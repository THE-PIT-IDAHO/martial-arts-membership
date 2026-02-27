import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/rank-tests/[id] - Get a single rank test with all categories and items
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rankTest = await prisma.rankTest.findUnique({
      where: { id },
      include: {
        rank: {
          select: {
            id: true,
            name: true,
            order: true,
          },
        },
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    if (!rankTest) {
      return new NextResponse("Rank test not found", { status: 404 });
    }

    return NextResponse.json({ rankTest });
  } catch (error) {
    console.error("Error fetching rank test:", error);
    return new NextResponse("Failed to load rank test", { status: 500 });
  }
}

// PATCH /api/rank-tests/[id] - Update a rank test
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, isActive, sortOrder } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const rankTest = await prisma.rankTest.update({
      where: { id },
      data: updateData,
      include: {
        rank: {
          select: {
            id: true,
            name: true,
            order: true,
          },
        },
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    return NextResponse.json({ rankTest });
  } catch (error) {
    console.error("Error updating rank test:", error);
    return new NextResponse("Failed to update rank test", { status: 500 });
  }
}

// DELETE /api/rank-tests/[id] - Delete a rank test
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.rankTest.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting rank test:", error);
    return new NextResponse("Failed to delete rank test", { status: 500 });
  }
}
