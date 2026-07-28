import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// All handlers verify the target category / item belongs to the
// caller's tenant. RankTestItem reaches clientId via
// category.rankTest.rank.style.clientId. Before this fix all three
// methods let any admin add / edit / delete items on any gym's
// curriculum.
async function assertCategoryTenant(categoryId: string, clientId: string) {
  const cat = await prisma.rankTestCategory.findUnique({
    where: { id: categoryId },
    select: { rankTest: { select: { rank: { select: { style: { select: { clientId: true } } } } } } },
  });
  return !!cat && cat.rankTest?.rank?.style?.clientId === clientId;
}
async function assertItemTenant(itemId: string, clientId: string) {
  const item = await prisma.rankTestItem.findUnique({
    where: { id: itemId },
    select: {
      category: {
        select: {
          rankTest: { select: { rank: { select: { style: { select: { clientId: true } } } } } },
        },
      },
    },
  });
  return !!item && item.category?.rankTest?.rank?.style?.clientId === clientId;
}

// POST /api/rank-tests/[id]/items - Add an item to a category
export async function POST(
  req: Request,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { categoryId, name, description, type, required, reps, sets, rounds, roundDuration, duration, distance, timeLimit, timeLimitOperator, videoUrl, imageUrl, showTitleInPdf, subExercises } = body;

    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }

    if (!(await assertCategoryTenant(categoryId, clientId))) {
      return new NextResponse("Category not found", { status: 404 });
    }

    // Get count for sort order
    const count = await prisma.rankTestItem.count({ where: { categoryId } });

    // Serialize subExercises to JSON string. Accept either an array
    // (normal editor form submit) or a pre-encoded string (bulk
    // imports). Empty arrays store as null so old-shape rows are
    // indistinguishable from "no sub-exercises".
    let subExercisesJson: string | null = null;
    if (Array.isArray(subExercises) && subExercises.length > 0) {
      subExercisesJson = JSON.stringify(subExercises);
    } else if (typeof subExercises === "string" && subExercises.trim()) {
      subExercisesJson = subExercises;
    }

    const item = await prisma.rankTestItem.create({
      data: {
        name: name || "",
        description: description?.trimEnd() || null,
        type: type || "skill",
        required: required ?? true,
        reps: reps || null,
        sets: sets || null,
        rounds: rounds || null,
        roundDuration: roundDuration?.trim() || null,
        duration: duration?.trim() || null,
        distance: distance?.trim() || null,
        timeLimit: timeLimit?.trim() || null,
        timeLimitOperator: timeLimitOperator || null,
        videoUrl: videoUrl?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        showTitleInPdf: showTitleInPdf ?? true,
        subExercises: subExercisesJson,
        categoryId,
        sortOrder: count,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Error creating item:", error);
    return new NextResponse("Failed to create item", { status: 500 });
  }
}

// PATCH /api/rank-tests/[id]/items - Update an item
export async function PATCH(
  req: Request,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { itemId, name, description, type, required, reps, sets, rounds, roundDuration, duration, distance, timeLimit, timeLimitOperator, videoUrl, imageUrl, sortOrder, showTitleInPdf, subExercises } = body;

    if (!itemId) {
      return new NextResponse("itemId is required", { status: 400 });
    }

    if (!(await assertItemTenant(itemId, clientId))) {
      return new NextResponse("Item not found", { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description?.trimEnd() || null;
    if (type !== undefined) updateData.type = type;
    if (required !== undefined) updateData.required = required;
    if (reps !== undefined) updateData.reps = reps || null;
    if (sets !== undefined) updateData.sets = sets || null;
    if (rounds !== undefined) updateData.rounds = rounds || null;
    if (roundDuration !== undefined) updateData.roundDuration = roundDuration?.trim() || null;
    if (duration !== undefined) updateData.duration = duration?.trim() || null;
    if (distance !== undefined) updateData.distance = distance?.trim() || null;
    if (timeLimit !== undefined) updateData.timeLimit = timeLimit?.trim() || null;
    if (timeLimitOperator !== undefined) updateData.timeLimitOperator = timeLimitOperator || null;
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl?.trim() || null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;
    if (showTitleInPdf !== undefined) updateData.showTitleInPdf = showTitleInPdf;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    // Empty array or empty string clears the field (back to a plain
    // single-exercise item). Any other array is serialized to JSON.
    if (subExercises !== undefined) {
      if (Array.isArray(subExercises)) {
        updateData.subExercises = subExercises.length > 0 ? JSON.stringify(subExercises) : null;
      } else if (typeof subExercises === "string") {
        updateData.subExercises = subExercises.trim() || null;
      } else {
        updateData.subExercises = null;
      }
    }

    const item = await prisma.rankTestItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error updating item:", error);
    return new NextResponse("Failed to update item", { status: 500 });
  }
}

// DELETE /api/rank-tests/[id]/items - Delete an item
export async function DELETE(
  req: Request,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return new NextResponse("itemId is required", { status: 400 });
    }

    if (!(await assertItemTenant(itemId, clientId))) {
      return new NextResponse("Item not found", { status: 404 });
    }

    await prisma.rankTestItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting item:", error);
    return new NextResponse("Failed to delete item", { status: 500 });
  }
}
