import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/documents/[id]/pdf
// Streams a PDF for the authenticated member. Handles ID formats:
//   rank-pdf-<rankName>   → Rank.pdfDocument for one of the member's enrolled styles
//   waiver-<id>           → SignedWaiver.pdfData
//   <uuid>                → entry in member.styleDocuments by id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { styleDocuments: true, stylesNotes: true },
  });
  if (!member) return new NextResponse("Not found", { status: 404 });

  let dataUri: string | null = null;
  let displayName = "Document";

  if (id.startsWith("rank-pdf-")) {
    const rankName = id.slice("rank-pdf-".length);
    let enrolledStyles: Array<{ name?: string; rank?: string; active?: boolean }> = [];
    if (member.stylesNotes) {
      try { enrolledStyles = JSON.parse(member.stylesNotes); } catch { /* ignore */ }
    }

    for (const es of enrolledStyles) {
      if (!es.name || es.active === false || !es.rank) continue;
      const style = await prisma.style.findFirst({
        where: { name: es.name },
        select: {
          ranks: {
            orderBy: { order: "asc" },
            select: { name: true, order: true, pdfDocument: true },
          },
        },
      });
      if (!style) continue;
      const currentRank = style.ranks.find((r) => r.name === es.rank);
      if (!currentRank) continue;
      const target = style.ranks.find(
        (r) => r.name === rankName && r.order <= currentRank.order
      );
      if (target?.pdfDocument) {
        dataUri = target.pdfDocument;
        displayName = rankName;
        break;
      }
    }
  } else if (id.startsWith("waiver-")) {
    const waiverId = id.slice("waiver-".length);
    const waiver = await prisma.signedWaiver.findFirst({
      where: { id: waiverId, memberId: auth.memberId },
      select: { templateName: true, pdfData: true },
    });
    if (waiver?.pdfData) {
      dataUri = waiver.pdfData;
      displayName = waiver.templateName || "Signed Waiver";
    }
  } else if (member.styleDocuments) {
    try {
      const docs: Array<{ id: string; name?: string; url?: string }> = JSON.parse(member.styleDocuments);
      const found = docs.find((d) => d.id === id);
      if (found?.url) {
        dataUri = found.url;
        displayName = found.name || displayName;
      }
    } catch { /* ignore */ }
  }

  if (!dataUri || !dataUri.startsWith("data:")) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const commaIdx = dataUri.indexOf(",");
  const header = dataUri.slice(0, commaIdx);
  const b64 = dataUri.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "application/pdf";

  const buffer = Buffer.from(b64, "base64");

  const safeName = displayName.replace(/[\r\n"\\]/g, "").trim() || "Document";
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
}
