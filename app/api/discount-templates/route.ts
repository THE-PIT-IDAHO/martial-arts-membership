import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/discount-templates -- list every template for this tenant,
// active + inactive. Ordered by sortOrder then name so the admin
// list + the member-profile picker render in a stable, admin-
// controllable order.
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const rows = await prisma.discountTemplate.findMany({
      where: { clientId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ templates: rows });
  } catch (err) {
    console.error("GET /api/discount-templates error:", err);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
}

// POST /api/discount-templates -- create a template.
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, description, appliesTo, percentOff, flatCents, oneTime, active, sortOrder } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const scope = typeof appliesTo === "string" ? appliesTo : "ALL";
    if (!["POS", "MEMBERSHIP", "PROMOTION", "ALL"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    // A discount without either a percent or a flat is nonsense.
    if ((percentOff == null || Number(percentOff) === 0) && (flatCents == null || Number(flatCents) === 0)) {
      return NextResponse.json({ error: "Enter a percent or flat amount" }, { status: 400 });
    }

    const created = await prisma.discountTemplate.create({
      data: {
        clientId,
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
    return NextResponse.json({ template: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/discount-templates error:", err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
