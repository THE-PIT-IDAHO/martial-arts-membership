import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    const spaces = await prisma.space.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ spaces });
  } catch (err) {
    console.error("GET /api/spaces error:", err);
    return NextResponse.json({ error: "Failed to load spaces" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, locationId, sortOrder } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const space = await prisma.space.create({
      data: {
        name: name.trim(),
        locationId: locationId || null,
        sortOrder: sortOrder ?? 0,
        clientId: "default-client",
      },
    });

    logAudit({
      entityType: "Space",
      entityId: space.id,
      action: "CREATE",
      summary: `Created space "${space.name}"`,
    }).catch(() => {});

    return NextResponse.json({ space }, { status: 201 });
  } catch (err) {
    console.error("POST /api/spaces error:", err);
    return NextResponse.json({ error: "Failed to create space" }, { status: 500 });
  }
}
