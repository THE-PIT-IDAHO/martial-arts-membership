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

    // Get the bytes from wherever the PDF lives. Stored as a base64 data URI
    // is the legacy format; an http(s) URL means it's been migrated to Blob.
    let buffer: Buffer;
    let mime = "application/pdf";

    if (rank.pdfDocument.startsWith("http")) {
      const res = await fetch(rank.pdfDocument);
      if (!res.ok) return new NextResponse("Failed to load PDF", { status: 502 });
      const ct = res.headers.get("content-type");
      if (ct) mime = ct;
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (rank.pdfDocument.startsWith("data:")) {
      const commaIdx = rank.pdfDocument.indexOf(",");
      const header = rank.pdfDocument.slice(0, commaIdx);
      const b64 = rank.pdfDocument.slice(commaIdx + 1);
      const mimeMatch = header.match(/data:(.*?);/);
      if (mimeMatch) mime = mimeMatch[1];
      buffer = Buffer.from(b64, "base64");
    } else {
      return new NextResponse("Stored PDF format not recognized", { status: 500 });
    }

    // Filename is what shows up in the browser tab and the download dialog.
    // Use "<Style> - <Rank>.pdf" so members see a meaningful title instead
    // of the Blob cuid.
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
