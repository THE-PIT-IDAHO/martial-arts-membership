import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

/**
 * DELETE /api/reports/[id] -- remove a saved report. Refuses to touch
 * a row owned by another tenant so a stale id from a different gym's
 * clipboard can't wipe someone else's report.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const existing = await prisma.savedReportConfig.findUnique({ where: { id }, select: { clientId: true } });
    if (!existing) return NextResponse.json({ ok: true }); // idempotent
    if (existing.clientId !== clientId) {
      return NextResponse.json({ error: "Report belongs to another tenant" }, { status: 403 });
    }
    await prisma.savedReportConfig.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
