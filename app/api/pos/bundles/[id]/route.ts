import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

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

// Kept in sync with the copy in ../route.ts: cross-checks every ref
// id against its own table under this tenant. Duplicated on purpose
// so the API endpoints don't grow a shared internal module for a
// helper this small.
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

// GET /api/pos/bundles/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const bundle = await prisma.bundle.findFirst({
      where: { id, clientId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!bundle) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    return NextResponse.json({ bundle });
  } catch (err) {
    console.error("GET /api/pos/bundles/[id] error:", err);
    return NextResponse.json({ error: "Failed to load bundle" }, { status: 500 });
  }
}

// PUT /api/pos/bundles/[id] -- full replacement of the bundle and its
// items. Simpler than a partial diff and matches how the admin form
// posts back the full item list on each save.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    // Tenant guard: block writes to a bundle that belongs to another
    // gym, and give a proper 404 for a bogus id.
    const existing = await prisma.bundle.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    if (existing.clientId !== clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    // Wipe + recreate items (cheaper mentally than diffing quantities /
    // kinds and matching cids across a full form re-submit).
    const [, bundle] = await prisma.$transaction([
      prisma.bundleItem.deleteMany({ where: { bundleId: id } }),
      prisma.bundle.update({
        where: { id },
        data: {
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
      }),
    ]);

    return NextResponse.json({ bundle });
  } catch (err) {
    console.error("PUT /api/pos/bundles/[id] error:", err);
    return NextResponse.json({ error: "Failed to update bundle" }, { status: 500 });
  }
}

// DELETE /api/pos/bundles/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const existing = await prisma.bundle.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    if (existing.clientId !== clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // BundleItem rows cascade-delete via the FK.
    await prisma.bundle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/pos/bundles/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete bundle" }, { status: 500 });
  }
}
