import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/pos/items/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const item = await prisma.pOSItem.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!item) {
      return new NextResponse("Item not found", { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error fetching POS item:", error);
    return new NextResponse("Failed to load item", { status: 500 });
  }
}

// PATCH /api/pos/items/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, sku, priceCents, quantity, category, sizes, colors, variantLabel1, variantLabel2, itemType, isActive, availableOnline, variants, reorderThreshold } = body;

    const item = await prisma.pOSItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(sku !== undefined && { sku }),
        ...(priceCents !== undefined && { priceCents }),
        ...(quantity !== undefined && { quantity }),
        ...(category !== undefined && { category }),
        ...(sizes !== undefined && { sizes }),
        ...(colors !== undefined && { colors }),
        ...(variantLabel1 !== undefined && { variantLabel1: variantLabel1 || null }),
        ...(variantLabel2 !== undefined && { variantLabel2: variantLabel2 || null }),
        ...(itemType !== undefined && { itemType }),
        ...(isActive !== undefined && { isActive }),
        ...(availableOnline !== undefined && { availableOnline }),
        ...(reorderThreshold !== undefined && { reorderThreshold }),
        updatedAt: new Date(),
      },
    });

    // Sync variants if provided
    if (variants !== undefined && Array.isArray(variants)) {
      // Delete all existing variants and recreate
      await prisma.pOSItemVariant.deleteMany({ where: { itemId: id } });
      if (variants.length > 0) {
        await prisma.pOSItemVariant.createMany({
          data: variants.map((v: { size?: string; color?: string; quantity: number; sku?: string }) => ({
            itemId: id,
            size: v.size || null,
            color: v.color || null,
            quantity: v.quantity || 0,
            sku: v.sku || null,
          })),
        });
      }
    }

    // Re-fetch with variants
    const updated = await prisma.pOSItem.findUnique({
      where: { id },
      include: { variants: true },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("Error updating POS item:", error);
    return new NextResponse("Failed to update item", { status: 500 });
  }
}

// DELETE /api/pos/items/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.pOSItem.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting POS item:", error);
    return new NextResponse("Failed to delete item", { status: 500 });
  }
}
