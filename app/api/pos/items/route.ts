import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/pos/items
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const items = await prisma.pOSItem.findMany({
      where: { clientId },
      orderBy: { name: "asc" },
      include: { variants: true },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching POS items:", error);
    return new NextResponse("Failed to load items", { status: 500 });
  }
}

// POST /api/pos/items
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, description, sku, priceCents, quantity, category, sizes, colors, variantLabel1, variantLabel2, itemType, isActive, availableOnline, variants, reorderThreshold } = body;

    if (!name || priceCents === undefined) {
      return new NextResponse("Name and price are required", { status: 400 });
    }

    // Parse sizes/colors arrays to auto-generate variant rows
    const sizesArr: string[] = sizes ? (typeof sizes === "string" ? JSON.parse(sizes) : sizes) : [];
    const colorsArr: string[] = colors ? (typeof colors === "string" ? JSON.parse(colors) : colors) : [];
    const hasVariants = sizesArr.length > 0 || colorsArr.length > 0;

    // Build variant create data
    let variantData: Array<{ size: string | null; color: string | null; quantity: number; sku: string | null }> = [];
    if (variants && Array.isArray(variants)) {
      // Explicit variants provided
      variantData = variants;
    } else if (hasVariants) {
      // Auto-generate from sizes × colors
      if (sizesArr.length > 0 && colorsArr.length > 0) {
        for (const s of sizesArr) {
          for (const c of colorsArr) {
            variantData.push({ size: s, color: c, quantity: 0, sku: null });
          }
        }
      } else if (sizesArr.length > 0) {
        for (const s of sizesArr) {
          variantData.push({ size: s, color: null, quantity: 0, sku: null });
        }
      } else {
        for (const c of colorsArr) {
          variantData.push({ size: null, color: c, quantity: 0, sku: null });
        }
      }
    }

    const item = await prisma.pOSItem.create({
      data: {
        id: crypto.randomUUID(),
        name,
        clientId,
        description: description || null,
        sku: sku || null,
        priceCents,
        quantity: quantity || 0,
        category: category || null,
        sizes: sizes || null,
        colors: colors || null,
        variantLabel1: variantLabel1 || null,
        variantLabel2: variantLabel2 || null,
        itemType: itemType || null,
        isActive: isActive !== false,
        availableOnline: availableOnline || false,
        reorderThreshold: reorderThreshold !== undefined ? reorderThreshold : null,
        updatedAt: new Date(),
        ...(variantData.length > 0 && {
          variants: {
            create: variantData.map((v) => ({
              size: v.size,
              color: v.color,
              quantity: v.quantity,
              sku: v.sku || null,
            })),
          },
        }),
      },
      include: { variants: true },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Error creating POS item:", error);
    return new NextResponse("Failed to create item", { status: 500 });
  }
}
