import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, locationId, isActive, sortOrder } = body;

    // Verify space belongs to tenant
    const existing = await prisma.space.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Space not found" }, { status: 404 });

    const space = await prisma.space.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(locationId !== undefined && { locationId: locationId || null }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    logAudit({
      entityType: "Space",
      entityId: space.id,
      action: "UPDATE",
      summary: `Updated space "${space.name}"`,
    }).catch(() => {});

    return NextResponse.json({ space });
  } catch (err) {
    console.error("PATCH /api/spaces/[id] error:", err);
    return NextResponse.json({ error: "Failed to update space" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const clientId = await getClientId(_req);

    // Verify space belongs to tenant
    const existing = await prisma.space.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Space not found" }, { status: 404 });

    const space = await prisma.space.findUnique({
      where: { id },
      select: { name: true },
    });

    await prisma.space.delete({ where: { id } });

    logAudit({
      entityType: "Space",
      entityId: id,
      action: "DELETE",
      summary: `Deleted space "${space?.name || id}"`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/spaces/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete space" }, { status: 500 });
  }
}
