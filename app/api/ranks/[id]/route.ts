import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { uploadRankPdf } from "@/lib/photo-upload";

type RouteParams = {
  params: Promise<{ id: string }>;
};

// PATCH /api/ranks/:id — update rank fields. The main path used by the
// curriculum publisher: jsPDF generates a base64 PDF data URI client-side,
// posts it here, and we push it to Vercel Blob so the DB only holds a URL.
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const clientId = await getClientId(req);

    // Tenant verify — the rank must belong to a style in the requester's
    // tenant. Without this, an authenticated admin from any gym could
    // overwrite another gym's curriculum.
    const existing = await prisma.rank.findUnique({
      where: { id },
      select: { style: { select: { clientId: true } } },
    });
    if (!existing || existing.style.clientId !== clientId) {
      return NextResponse.json({ error: "Rank not found" }, { status: 404 });
    }

    const body = await req.json();
    const { pdfDocument } = body;

    const data: Record<string, unknown> = {};

    if (pdfDocument !== undefined) {
      if (pdfDocument === null || pdfDocument === "") {
        // Explicit clear.
        data.pdfDocument = null;
      } else if (typeof pdfDocument === "string" && pdfDocument.startsWith("data:")) {
        // Newly generated PDF from the curriculum publisher — push it to
        // Blob and store the URL, not the base64 bytes.
        const { url } = await uploadRankPdf(
          { kind: "dataUri", dataUri: pdfDocument },
          { rankId: id, clientId },
        );
        data.pdfDocument = url;
      } else {
        // Already a URL (idempotent re-save) or some other non-base64 string.
        data.pdfDocument = pdfDocument;
      }
    }

    const rank = await prisma.rank.update({
      where: { id },
      data,
    });

    return NextResponse.json({ rank });
  } catch (error) {
    console.error("Error updating rank:", error);
    return new NextResponse("Failed to update rank", { status: 500 });
  }
}
