// /api/promotion-events
//   GET  → list scheduled events (most recent first)
//   POST → create a new event { name, date, styleIds[], time?, location?, notes? }
//
// Replaces the old single-style flow: events now accept any combination of
// styles via styleIds. Legacy styleId/styleName are still populated for
// single-style events so older history pages still render correctly.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { parseLocalDate } from "@/lib/dates";

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const events = await prisma.promotionEvent.findMany({
      where: {
        clientId,
        ...(status ? { status } : {}),
      },
      include: {
        participants: { orderBy: { memberName: "asc" } },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ events });
  } catch (err) {
    console.error("GET /api/promotion-events error:", err);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, date, time, location, notes, costCents } = body || {};

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    // Accept styleIds (preferred) or fall back to the legacy single styleId.
    const styleIdsRaw: unknown = body.styleIds;
    const legacyStyleId: string | undefined = body.styleId;
    let ids: string[] = [];
    if (Array.isArray(styleIdsRaw)) {
      ids = styleIdsRaw.filter((s): s is string => typeof s === "string");
    } else if (legacyStyleId && typeof legacyStyleId === "string") {
      ids = [legacyStyleId];
    }

    // Validate every style belongs to this tenant. Capture name for the
    // single-style case (so legacy fields stay populated).
    let primaryStyleName: string | null = null;
    if (ids.length > 0) {
      const styles = await prisma.style.findMany({
        where: { id: { in: ids }, clientId },
        select: { id: true, name: true },
      });
      if (styles.length !== ids.length) {
        return NextResponse.json({ error: "One or more styles not found" }, { status: 400 });
      }
      if (ids.length === 1) primaryStyleName = styles[0].name;
    }

    const event = await prisma.promotionEvent.create({
      data: {
        name: name.trim(),
        date: parseLocalDate(typeof date === "string" ? date : date.toString()),
        time: time || null,
        styleId: ids.length === 1 ? ids[0] : null,
        styleName: primaryStyleName,
        styleIds: ids.length > 0 ? JSON.stringify(ids) : null,
        location: location || null,
        notes: notes || null,
        costCents: costCents ? parseInt(costCents, 10) : null,
        status: "SCHEDULED",
        clientId,
      },
      include: { participants: true },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error("POST /api/promotion-events error:", err);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
