import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Cart-side shape of an item slotted into a bundle. Matches the admin
// form and, once persisted, the BundleItem row minus its DB-managed
// fields (id, sortOrder). Exactly one of productId /
// membershipPlanId / servicePackageId is set, matching `kind`.
type IncomingBundleItem = {
  kind?: string;
  productId?: string | null;
  membershipPlanId?: string | null;
  servicePackageId?: string | null;
  nameCached?: string;
  quantity?: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
};

// Cross-check every ref id in the incoming items against its own
// table, all scoped to this tenant. Returns null if everything's
// clean; returns an error string if any id is missing or belongs to
// another gym. Shared by POST + PUT so both entry points reject bad
// payloads with the same rules.
async function validateBundleItemsForTenant(
  items: IncomingBundleItem[],
  clientId: string,
): Promise<string | null> {
  const productIds = items.filter((it) => it.kind === "product" && it.productId).map((it) => it.productId!) as string[];
  const planIds = items.filter((it) => it.kind === "membership" && it.membershipPlanId).map((it) => it.membershipPlanId!) as string[];
  const svcIds = items.filter((it) => it.kind === "service" && it.servicePackageId).map((it) => it.servicePackageId!) as string[];

  if (productIds.length > 0) {
    const rows = await prisma.pOSItem.findMany({ where: { id: { in: productIds } }, select: { id: true, clientId: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of productIds) {
      const row = byId.get(id);
      if (!row || row.clientId !== clientId) return "One or more products are not available";
    }
  }
  if (planIds.length > 0) {
    const rows = await prisma.membershipPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, clientId: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of planIds) {
      const row = byId.get(id);
      if (!row || row.clientId !== clientId) return "One or more membership plans are not available";
    }
  }
  if (svcIds.length > 0) {
    const rows = await prisma.servicePackage.findMany({ where: { id: { in: svcIds } }, select: { id: true, clientId: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of svcIds) {
      const row = byId.get(id);
      if (!row || row.clientId !== clientId) return "One or more services are not available";
    }
  }
  return null;
}

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

    const validationError = await validateBundleItemsForTenant(cleanItems, clientId);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

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
            productId: it.kind === "product" ? (it.productId || null) : null,
            membershipPlanId: it.kind === "membership" ? (it.membershipPlanId || null) : null,
            servicePackageId: it.kind === "service" ? (it.servicePackageId || null) : null,
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
