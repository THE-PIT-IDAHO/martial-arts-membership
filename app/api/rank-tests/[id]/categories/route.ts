import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET /api/rank-tests/[id]/categories - Get all categories for a rank test
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const categories = await prisma.rankTestCategory.findMany({
      where: { rankTestId: id },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return new NextResponse("Failed to load categories", { status: 500 });
  }
}

// POST /api/rank-tests/[id]/categories - Add a category to the rank test
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, sortOrder } = body;

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // Check for duplicate — skip if category with same name already exists on this test.
    // This check is best-effort: under concurrent requests, two callers can both
    // pass it before either inserts. The DB-level @@unique([rankTestId, name])
    // is the real safety net; the catch below handles that case.
    const trimmedName = name.trim();
    const allCats = await prisma.rankTestCategory.findMany({
      where: { rankTestId: id },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const existing = allCats.find(c => c.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      return NextResponse.json({ category: existing }, { status: 200 });
    }

    // Use provided sortOrder or default to count
    const order = sortOrder !== undefined ? sortOrder : await prisma.rankTestCategory.count({ where: { rankTestId: id } });

    try {
      const category = await prisma.rankTestCategory.create({
        data: {
          name: trimmedName,
          description: description?.trim() || null,
          rankTestId: id,
          sortOrder: order,
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      return NextResponse.json({ category }, { status: 201 });
    } catch (err) {
      // P2002 = unique constraint violation. Another request inserted the
      // same (rankTestId, name) between our check and our create. Return
      // whatever is there instead of erroring.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await prisma.rankTestCategory.findFirst({
          where: { rankTestId: id, name: trimmedName },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        });
        if (winner) return NextResponse.json({ category: winner }, { status: 200 });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error creating category:", error);
    return new NextResponse("Failed to create category", { status: 500 });
  }
}

// PATCH /api/rank-tests/[id]/categories - Update a category
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const { categoryId, name, description, sortOrder, visibleOnTest } = body;

    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (typeof visibleOnTest === "boolean") updateData.visibleOnTest = visibleOnTest;

    const category = await prisma.rankTestCategory.update({
      where: { id: categoryId },
      data: updateData,
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error("Error updating category:", error);
    return new NextResponse("Failed to update category", { status: 500 });
  }
}

// DELETE /api/rank-tests/[id]/categories - Delete a category
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }

    await prisma.rankTestCategory.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return new NextResponse("Failed to delete category", { status: 500 });
  }
}
