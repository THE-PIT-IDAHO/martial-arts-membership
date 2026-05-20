import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/ranks/[id]/pdf — stream the rank's curriculum PDF.
//
// Exists so /api/styles can stop shipping every rank's base64 PDF on
// every page load. Admin pages that need to display/download a rank PDF
// fetch it from here on demand, and only for the specific rank the user
// is looking at.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const clientId = await getClientId(request);

    const rank = await prisma.rank.findUnique({
      where: { id },
      select: {
        name: true,
        pdfDocument: true,
        style: { select: { clientId: true, name: true } },
      },
    });

    if (!rank || !rank.style || rank.style.clientId !== clientId) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (!rank.pdfDocument) {
      return new NextResponse("No PDF for this rank", { status: 404 });
    }

    const dataUri = rank.pdfDocument;
    if (!dataUri.startsWith("data:")) {
      return new NextResponse("Stored data is not a data URI", { status: 500 });
    }

    const commaIdx = dataUri.indexOf(",");
    const header = dataUri.slice(0, commaIdx);
    const b64 = dataUri.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
    const buffer = Buffer.from(b64, "base64");

    const safeName = `${rank.style.name} - ${rank.name}`.replace(/[\r\n"\\]/g, "").trim() || "rank";
    const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(safeName);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${asciiFallback}.pdf"; filename*=UTF-8''${encoded}.pdf`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("Rank PDF fetch error:", err);
    return new NextResponse("Failed to load PDF", { status: 500 });
  }
}
