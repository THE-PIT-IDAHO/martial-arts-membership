import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Cart-side shape of an item slotted into a bundle. Matches the admin
// form and, once persisted, the BundleItem row minus its DB-managed
// fields (id, sortOrder).
type IncomingBundleItem = {
  kind?: string;
  productId?: string | null;
  nameCached?: string;
  quantity?: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
};

// GET /api/pos/bundles -- list every bundle for this tenant with its
// items. Ordered by sortOrder then name so the POS grid renders in a
// predictable, admin-controllable order.
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const bundles = await prisma.bundle.findMany({
      where: { clientId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ bundles });
  } catch (err) {
    console.error("GET /api/pos/bundles error:", err);
    return NextResponse.json({ error: "Failed to load bundles" }, { status: 500 });
  }
}

// POST /api/pos/bundles -- create a new bundle. Verifies every
// referenced productId belongs to this tenant before writing (so a
// hand-crafted POST can't smuggle another gym's POSItem into a bundle
// and later decrement their inventory).
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const {
      name,
      description,
      priceCents,
      active,
      sortOrder,
      items,
    }: {
      name?: string;
      description?: string | null;
      priceCents?: number;
      active?: boolean;
      sortOrder?: number;
      items?: IncomingBundleItem[];
    } = body || {};

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Bundle name is required" }, { status: 400 });
    }
    if (typeof priceCents !== "number" || priceCents < 0) {
      return NextResponse.json({ error: "Bundle price is required" }, { status: 400 });
    }
    const cleanItems = Array.isArray(items) ? items : [];
    if (cleanItems.length === 0) {
      return NextResponse.json({ error: "A bundle needs at least one item" }, { status: 400 });
    }

    const productIds = cleanItems
      .filter((it) => (it.kind || "product") === "product" && it.productId)
      .map((it) => it.productId!) as string[];
    if (productIds.length > 0) {
      const rows = await prisma.pOSItem.findMany({
        where: { id: { in: productIds } },
        select: { id: true, clientId: true, name: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const pid of productIds) {
        const row = byId.get(pid);
        if (!row || row.clientId !== clientId) {
          return NextResponse.json({ error: "One or more products are not available" }, { status: 400 });
        }
      }
    }

    const bundle = await prisma.bundle.create({
      data: {
        clientId,
        name: name.trim(),
        description: description?.trim() || null,
        priceCents,
        active: active !== false,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        items: {
          create: cleanItems.map((it, idx) => ({
            kind: it.kind || "product",
            productId: it.productId || null,
            nameCached: (it.nameCached || "").trim() || "Unnamed item",
            quantity: typeof it.quantity === "number" && it.quantity > 0 ? it.quantity : 1,
            selectedSize: it.selectedSize || null,
            selectedColor: it.selectedColor || null,
            sortOrder: idx,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({ bundle }, { status: 201 });
  } catch (err) {
    console.error("POST /api/pos/bundles error:", err);
    return NextResponse.json({ error: "Failed to create bundle" }, { status: 500 });
  }
}
