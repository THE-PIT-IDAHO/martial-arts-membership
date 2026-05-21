// GET /api/waivers/[id]/pdf  OR  /api/waivers/[id]/pdf/<filename>.pdf
//
// Admin-side stream for a SignedWaiver's PDF (the same data the portal
// streams for members, but tenant-scoped so admin can view from a member
// profile). The optional trailing filename segment is cosmetic — browsers
// use it as the tab title. The route ignores it.
//
// If pdfData starts with http(s) we proxy from Vercel Blob; otherwise it's
// a base64 string we decode and stream directly.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; slug?: string[] }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const waiver = await prisma.signedWaiver.findUnique({
      where: { id },
      select: {
        templateName: true,
        pdfData: true,
        clientId: true,
        member: { select: { firstName: true, lastName: true } },
      },
    });

    if (!waiver || waiver.clientId !== clientId) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (!waiver.pdfData) {
      return new NextResponse("No PDF on file for this waiver", { status: 404 });
    }

    let buffer: Buffer;
    let mime = "application/pdf";

    if (waiver.pdfData.startsWith("http")) {
      const res = await fetch(waiver.pdfData);
      if (!res.ok) return new NextResponse("Failed to load PDF", { status: 502 });
      const ct = res.headers.get("content-type");
      if (ct) mime = ct;
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      const cleanB64 = waiver.pdfData.startsWith("data:")
        ? waiver.pdfData.split(",")[1]
        : waiver.pdfData;
      buffer = Buffer.from(cleanB64, "base64");
    }

    const memberName = `${waiver.member.firstName} ${waiver.member.lastName}`.trim();
    const displayName = `${memberName} - ${waiver.templateName || "Waiver"}`;
    const safe = displayName.replace(/[\r\n"\\]/g, "").trim() || "Waiver";
    const ascii = safe.replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(safe);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${ascii}.pdf"; filename*=UTF-8''${encoded}.pdf`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Admin waiver PDF stream error:", err);
    return new NextResponse("Failed to load waiver", { status: 500 });
  }
}
