import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// All handlers verify the parent RankTest belongs to the caller's
// tenant. RankTest has no clientId of its own -- reach it via
// rank.style.clientId. Before this fix, all four methods let any
// authenticated admin read / add / edit / delete categories on any
// gym's rank test just by passing the ids.
async function assertRankTestTenant(id: string, clientId: string) {
  const rt = await prisma.rankTest.findUnique({
    where: { id },
    select: { rank: { select: { style: { select: { clientId: true } } } } },
  });
  return !!rt && rt.rank?.style?.clientId === clientId;
}
async function assertCategoryTenant(categoryId: string, clientId: string) {
  const cat = await prisma.rankTestCategory.findUnique({
    where: { id: categoryId },
    select: { rankTest: { select: { rank: { select: { style: { select: { clientId: true } } } } } } },
  });
  return !!cat && cat.rankTest?.rank?.style?.clientId === clientId;
}

// GET /api/rank-tests/[id]/categories - Get all categories for a rank test
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    if (!(await assertRankTestTenant(id, clientId))) {
      return new NextResponse("Rank test not found", { status: 404 });
    }

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
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();
    const { name, description, sortOrder, type } = body;

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    // Whitelist of category types. Anything else silently falls back
    // to the default so a bad client can't poison the display logic
    // downstream.
    const CATEGORY_TYPES = new Set(["demonstration", "workout", "information"]);
    const safeType: string = typeof type === "string" && CATEGORY_TYPES.has(type)
      ? type
      : "demonstration";

    if (!(await assertRankTestTenant(id, clientId))) {
      return new NextResponse("Rank test not found", { status: 404 });
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
          type: safeType,
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
    const clientId = await getClientId(req);
    const body = await req.json();
    const { categoryId, name, description, sortOrder, visibleOnTest, type } = body;

    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }

    if (!(await assertCategoryTenant(categoryId, clientId))) {
      return new NextResponse("Category not found", { status: 404 });
    }

    const CATEGORY_TYPES = new Set(["demonstration", "workout", "information"]);

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (typeof visibleOnTest === "boolean") updateData.visibleOnTest = visibleOnTest;
    if (typeof type === "string" && CATEGORY_TYPES.has(type)) updateData.type = type;

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
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId");

    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }

    if (!(await assertCategoryTenant(categoryId, clientId))) {
      return new NextResponse("Category not found", { status: 404 });
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
