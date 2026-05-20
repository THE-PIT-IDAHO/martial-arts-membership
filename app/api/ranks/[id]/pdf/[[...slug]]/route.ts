import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/ranks/[id]/pdf  OR  /api/ranks/[id]/pdf/<anything>.pdf
//
// The optional trailing segment is purely cosmetic — browsers use the
// URL's last path segment as the tab/window title when the PDF has no
// embedded Title metadata. By letting callers append a friendly filename
// like "Hawaiian Kempo - Yellow Belt.pdf", we get a readable tab title
// without changing how the route resolves.
//
// This route always proxies the bytes through us (vs. redirecting to the
// underlying Blob URL) so we can set Content-Disposition with the same
// friendly filename and the user never sees the Blob URL.
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string; slug?: string[] }> },
) {
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

    // Get the bytes from wherever the PDF lives.
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

    // Filename for the Content-Disposition header (powers the download
    // filename and many browsers' tab title fallback).
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
