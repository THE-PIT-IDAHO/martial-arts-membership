import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

async function assertOwnership(id: string, clientId: string) {
  const row = await prisma.discountTemplate.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!row) return { status: 404 as const, error: "Template not found" };
  if (row.clientId !== clientId) return { status: 403 as const, error: "Forbidden" };
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const template = await prisma.discountTemplate.findFirst({
      where: { id, clientId },
    });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    console.error("GET /api/discount-templates/[id] error:", err);
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 });
  }
}

// PUT is a full replace of the fields the operator can edit. Does NOT
// touch any MemberDiscount rows previously spawned from this template
// -- the decoupling is intentional.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const guard = await assertOwnership(id, clientId);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const body = await req.json();
    const { name, description, appliesTo, percentOff, flatCents, oneTime, active, sortOrder } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const scope = typeof appliesTo === "string" ? appliesTo : "ALL";
    if (!["POS", "MEMBERSHIP", "PROMOTION", "ALL"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    if ((percentOff == null || Number(percentOff) === 0) && (flatCents == null || Number(flatCents) === 0)) {
      return NextResponse.json({ error: "Enter a percent or flat amount" }, { status: 400 });
    }

    const updated = await prisma.discountTemplate.update({
      where: { id },
      data: {
        name: name.trim(),
        description: (description || "").toString().trim() || null,
        appliesTo: scope,
        percentOff: percentOff != null && Number(percentOff) !== 0 ? Number(percentOff) : null,
        flatCents: flatCents != null && Number(flatCents) !== 0 ? Math.round(Number(flatCents)) : null,
        oneTime: !!oneTime,
        active: active !== false,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      },
    });
    return NextResponse.json({ template: updated });
  } catch (err) {
    console.error("PUT /api/discount-templates/[id] error:", err);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const guard = await assertOwnership(id, clientId);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    await prisma.discountTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/discount-templates/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
