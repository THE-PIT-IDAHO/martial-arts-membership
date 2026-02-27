import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/rank-tests/[id]/items - Add an item to a category
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const { categoryId, name, description, type, required, reps, sets, duration, distance, timeLimit, timeLimitOperator, videoUrl, imageUrl, showTitleInPdf } = body;

    if (!categoryId) {
      return new NextResponse("categoryId is required", { status: 400 });
    }

    // Get count for sort order
    const count = await prisma.rankTestItem.count({ where: { categoryId } });

    const item = await prisma.rankTestItem.create({
      data: {
        name: name?.trim() || "",
        description: description?.trim() || null,
        type: type || "skill",
        required: required ?? true,
        reps: reps || null,
        sets: sets || null,
        duration: duration?.trim() || null,
        distance: distance?.trim() || null,
        timeLimit: timeLimit?.trim() || null,
        timeLimitOperator: timeLimitOperator || null,
        videoUrl: videoUrl?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        showTitleInPdf: showTitleInPdf ?? true,
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json();
    const { itemId, name, description, type, required, reps, sets, duration, distance, timeLimit, timeLimitOperator, videoUrl, imageUrl, sortOrder, showTitleInPdf } = body;

    if (!itemId) {
      return new NextResponse("itemId is required", { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (type !== undefined) updateData.type = type;
    if (required !== undefined) updateData.required = required;
    if (reps !== undefined) updateData.reps = reps || null;
    if (sets !== undefined) updateData.sets = sets || null;
    if (duration !== undefined) updateData.duration = duration?.trim() || null;
    if (distance !== undefined) updateData.distance = distance?.trim() || null;
    if (timeLimit !== undefined) updateData.timeLimit = timeLimit?.trim() || null;
    if (timeLimitOperator !== undefined) updateData.timeLimitOperator = timeLimitOperator || null;
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl?.trim() || null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;
    if (showTitleInPdf !== undefined) updateData.showTitleInPdf = showTitleInPdf;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return new NextResponse("itemId is required", { status: 400 });
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
