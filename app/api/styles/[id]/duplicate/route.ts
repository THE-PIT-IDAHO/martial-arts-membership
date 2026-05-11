import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/styles/:id/duplicate — Duplicate a style with a new name
// Creates a clean copy: same belt config (rank names, colors, layers) but no PDFs,
// no test data, no curriculum items. Just the style structure + ranks.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "New style name is required" }, { status: 400 });
    }

    // Check for duplicate name
    const existing = await prisma.style.findFirst({
      where: { clientId, name: name.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "A style with this name already exists" }, { status: 400 });
    }

    // Get source style
    const source = await prisma.style.findUnique({
      where: { id },
      include: { ranks: { orderBy: { order: "asc" } } },
    });

    if (!source || source.clientId !== clientId) {
      return NextResponse.json({ error: "Style not found" }, { status: 404 });
    }

    // Parse belt config and strip PDFs/attachments
    let cleanBeltConfig: string | null = null;
    if (source.beltConfig) {
      try {
        const config = typeof source.beltConfig === "string" ? JSON.parse(source.beltConfig) : source.beltConfig;
        if (config.ranks && Array.isArray(config.ranks)) {
          config.ranks = config.ranks.map((r: Record<string, unknown>) => ({
            ...r,
            id: `rank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            pdfDocuments: undefined, // Strip PDFs
          }));
        }
        cleanBeltConfig = JSON.stringify(config);
      } catch {
        cleanBeltConfig = null;
      }
    }

    // Create the new style
    const newStyle = await prisma.style.create({
      data: {
        name: name.trim(),
        shortName: source.shortName ? `${source.shortName} Copy` : null,
        description: source.description,
        beltSystemEnabled: source.beltSystemEnabled,
        beltConfig: cleanBeltConfig,
        testNamingConvention: source.testNamingConvention,
        curriculumDisclaimer: source.curriculumDisclaimer,
        clientId,
      },
    });

    // Create ranks (clean copies — no PDFs, no thumbnails)
    for (const rank of source.ranks) {
      await prisma.rank.create({
        data: {
          name: rank.name,
          order: rank.order,
          styleId: newStyle.id,
          classRequirement: rank.classRequirement,
          // No pdfDocument, no thumbnail — clean slate
        },
      });
    }

    return NextResponse.json({ style: newStyle }, { status: 201 });
  } catch (error) {
    console.error("Error duplicating style:", error);
    return NextResponse.json({ error: "Failed to duplicate style" }, { status: 500 });
  }
}
