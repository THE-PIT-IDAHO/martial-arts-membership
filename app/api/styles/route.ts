import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // adjust path if needed
import { getClientId } from "@/lib/tenant";
import { canAddStyle } from "@/lib/trial";

// GET /api/styles
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    // Note: we deliberately do NOT pull pdfDocument here — those are
    // base64-encoded PDFs that can be 100KB–2MB each. Shipping every
    // rank's PDF on every styles list call was making the app feel slow
    // app-wide (this endpoint is hit by ~16 pages). We expose a boolean
    // `hasPdf` instead; consumers that actually need the PDF data fetch
    // it on demand from /api/ranks/[id]/pdf.
    const stylesRaw = await prisma.style.findMany({
      where: { clientId },
      include: {
        ranks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            styleId: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Lightweight second query to know which ranks have a PDF. Selects only
    // the id (no large column transferred).
    const ranksWithPdfRaw = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Rank"
      WHERE "styleId" IN (
        SELECT "id" FROM "Style" WHERE "clientId" = ${clientId}
      ) AND "pdfDocument" IS NOT NULL
    `;
    const hasPdfSet = new Set(ranksWithPdfRaw.map((r) => r.id));

    const styles = stylesRaw.map((s) => ({
      ...s,
      ranks: s.ranks.map((r) => ({ ...r, hasPdf: hasPdfSet.has(r.id) })),
    }));

    return NextResponse.json({ styles });
  } catch (error) {
    console.error("Error fetching styles:", error);
    return new NextResponse("Failed to load styles", { status: 500 });
  }
}

// POST /api/styles
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, shortName, description, beltSystemEnabled, testNamingConvention, showProgressInPortal } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    const styleCheck = await canAddStyle(clientId);
    if (!styleCheck.allowed) {
      return NextResponse.json({ error: styleCheck.reason }, { status: 403 });
    }

    const style = await prisma.style.create({
      data: {
        name: name.trim(),
        shortName: shortName?.trim() || null,
        description: description?.trim() || null,
        beltSystemEnabled: beltSystemEnabled ?? false,
        testNamingConvention: testNamingConvention || "INTO_RANK",
        showProgressInPortal: showProgressInPortal ?? false,
        clientId,
      },
    });

    return NextResponse.json({ style }, { status: 201 });
  } catch (error) {
    console.error("Error creating style:", error);
    return new NextResponse("Failed to create style", { status: 500 });
  }
}
