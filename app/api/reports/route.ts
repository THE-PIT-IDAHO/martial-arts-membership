import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

/**
 * GET /api/reports -- list every saved report config for this tenant.
 * Shared across all staff at the gym: no per-user filter today
 * (SavedReportConfig.createdByUserId is tracked but not enforced).
 */
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    // Order by createdAt so the tab order is stable. Was updatedAt,
    // which reshuffled the list every time the operator opened a
    // report (opening a report auto-writes column-order state,
    // bumping updatedAt).
    const rows = await prisma.savedReportConfig.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, configJson: true, updatedAt: true, createdAt: true },
    });
    // Parse the JSON blob so the client doesn't have to. Falls back to
    // an empty object if a row's blob is malformed -- prevents a
    // single bad row from breaking the whole list.
    const reports = rows.map((r) => {
      let config: unknown = {};
      try { config = JSON.parse(r.configJson); } catch { /* keep empty */ }
      return { id: r.id, name: r.name, config, updatedAt: r.updatedAt, createdAt: r.createdAt };
    });
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("GET /api/reports error:", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

/**
 * POST /api/reports -- upsert a report config. The client owns the id
 * (it's generated up front so localStorage can migrate cleanly), so
 * this is idempotent per (clientId, id). Body: { id, name, config }.
 */
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const id: string | undefined = body?.id;
    const name: string | undefined = body?.name;
    const config = body?.config;
    if (!id || !name || config === undefined) {
      return NextResponse.json({ error: "id, name, and config are required" }, { status: 400 });
    }
    const configJson = typeof config === "string" ? config : JSON.stringify(config);

    // Guard: refuse to write to an id that belongs to another tenant.
    // Prisma's default upsert wouldn't stop the write; we check first.
    const existing = await prisma.savedReportConfig.findUnique({ where: { id }, select: { clientId: true } });
    if (existing && existing.clientId !== clientId) {
      return NextResponse.json({ error: "Report id belongs to another tenant" }, { status: 403 });
    }

    const saved = await prisma.savedReportConfig.upsert({
      where: { id },
      update: { name, configJson },
      create: { id, clientId, name, configJson },
    });
    return NextResponse.json({ id: saved.id, updatedAt: saved.updatedAt });
  } catch (err) {
    console.error("POST /api/reports error:", err);
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}
