// /api/promotion-events/[id] — single-event read/update/delete.
// All ops are tenant-scoped via clientId; previously this was a multi-tenant
// data leak (any authenticated user could read/modify any gym's events).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { parseLocalDate } from "@/lib/dates";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const event = await prisma.promotionEvent.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { memberName: "asc" } },
      },
    });

    if (!event || event.clientId !== clientId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (err) {
    console.error("GET /api/promotion-events/[id] error:", err);
    return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();
    const { name, date, time, location, notes, status, costCents, styleIds, applyAttendanceWindow } = body;

    const existing = await prisma.promotionEvent.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (date !== undefined) updateData.date = parseLocalDate(date);
    if (time !== undefined) updateData.time = time || null;
    if (location !== undefined) updateData.location = location || null;
    if (notes !== undefined) updateData.notes = notes || null;
    if (status !== undefined) updateData.status = status;
    if (costCents !== undefined) updateData.costCents = costCents ? parseInt(costCents, 10) : null;
    if (typeof applyAttendanceWindow === "boolean") updateData.applyAttendanceWindow = applyAttendanceWindow;

    if (styleIds !== undefined) {
      const ids: string[] = Array.isArray(styleIds)
        ? styleIds.filter((s): s is string => typeof s === "string")
        : [];
      if (ids.length > 0) {
        // Validate all styles belong to this tenant.
        const styles = await prisma.style.findMany({
          where: { id: { in: ids }, clientId },
          select: { id: true, name: true },
        });
        if (styles.length !== ids.length) {
          return NextResponse.json({ error: "One or more styles not found" }, { status: 400 });
        }
        updateData.styleIds = JSON.stringify(ids);
        if (ids.length === 1) {
          updateData.styleId = ids[0];
          updateData.styleName = styles[0].name;
        } else {
          updateData.styleId = null;
          updateData.styleName = null;
        }
      } else {
        updateData.styleIds = null;
        updateData.styleId = null;
        updateData.styleName = null;
      }
    }

    const event = await prisma.promotionEvent.update({
      where: { id },
      data: updateData,
      include: {
        participants: { orderBy: { memberName: "asc" } },
      },
    });

    return NextResponse.json({ event });
  } catch (err) {
    console.error("PATCH /api/promotion-events/[id] error:", err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const existing = await prisma.promotionEvent.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    await prisma.promotionEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/promotion-events/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
