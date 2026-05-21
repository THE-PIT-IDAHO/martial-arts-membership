// GET /api/public/waiver-templates
//
// Public list of templates that should appear on the Blank Waivers page
// (/waivers/new). Returns only active, non-archived templates with the
// minimum info needed to render the cards. Content/options stay private —
// /api/public/waiver-template/[slug] returns those at sign time.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { ensureSeedTemplates } from "@/lib/waiver-templates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const clientId = await getClientId(req);
    await ensureSeedTemplates(clientId);

    const templates = await prisma.waiverTemplate.findMany({
      where: {
        clientId,
        isActive: true,
        archivedAt: null,
        slug: { not: null },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        audience: true,
        type: true,
      },
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("Error listing public waiver templates:", err);
    return new NextResponse("Failed to load templates", { status: 500 });
  }
}
