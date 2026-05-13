import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import jsPDF from "jspdf";

function generateWaiverPdf(opts: {
  gymName: string;
  memberName: string;
  templateName: string;
  signedAt: Date | null;
  waiverContent?: string;
  signatureData?: string;
}): Buffer {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = 22;

  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.text(opts.gymName, pageWidth / 2, y, { align: "center" });
  y += 9;
  pdf.setFontSize(13);
  pdf.text(opts.templateName, pageWidth / 2, y, { align: "center" });
  y += 12;

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Participant: ${opts.memberName}`, margin, y);
  y += 6;
  if (opts.signedAt) {
    pdf.text(`Signed: ${opts.signedAt.toLocaleString()}`, margin, y);
    y += 6;
  }
  y += 4;

  if (opts.waiverContent) {
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(opts.waiverContent, maxWidth);
    for (const line of lines) {
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, margin, y);
      y += 4.5;
    }
    y += 6;
  } else {
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    const note = pdf.splitTextToSize(
      "The original waiver document is on file at the gym. Please contact the front desk for a copy of the signed waiver.",
      maxWidth,
    );
    for (const line of note) {
      pdf.text(line, margin, y);
      y += 4.5;
    }
    pdf.setTextColor(0);
    y += 6;
  }

  if (opts.signatureData && opts.signatureData.startsWith("data:image")) {
    if (y > 230) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.text("Signature:", margin, y);
    y += 4;
    try {
      pdf.addImage(opts.signatureData, "PNG", margin, y, 70, 30);
      y += 32;
    } catch { /* ignore bad signature data */ }
  }

  return Buffer.from(pdf.output("arraybuffer"));
}

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
    select: {
      firstName: true,
      lastName: true,
      styleDocuments: true,
      stylesNotes: true,
      waiverSigned: true,
      waiverSignedAt: true,
      client: { select: { name: true } },
    },
  });
  if (!member) return new NextResponse("Not found", { status: 404 });

  let dataUri: string | null = null;
  let generatedPdf: Buffer | null = null;
  let displayName = "Document";
  const memberName = `${member.firstName} ${member.lastName}`.trim() || "Member";
  const gymName = member.client?.name || "Gym";

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
  } else if (id === "waiver-legacy") {
    if (member.waiverSigned) {
      generatedPdf = generateWaiverPdf({
        gymName,
        memberName,
        templateName: "Signed Waiver",
        signedAt: member.waiverSignedAt,
      });
      displayName = "Signed Waiver";
    }
  } else if (id.startsWith("waiver-")) {
    const waiverId = id.slice("waiver-".length);
    const waiver = await prisma.signedWaiver.findFirst({
      where: { id: waiverId, memberId: auth.memberId },
      select: { templateName: true, pdfData: true, waiverContent: true, signatureData: true, signedAt: true },
    });
    if (waiver?.pdfData) {
      dataUri = waiver.pdfData;
      displayName = waiver.templateName || "Signed Waiver";
    } else if (waiver) {
      // No stored PDF — render one on the fly from the saved content + signature
      generatedPdf = generateWaiverPdf({
        gymName,
        memberName,
        templateName: waiver.templateName || "Signed Waiver",
        signedAt: waiver.signedAt,
        waiverContent: waiver.waiverContent,
        signatureData: waiver.signatureData,
      });
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

  let buffer: Buffer;
  let mime = "application/pdf";

  if (generatedPdf) {
    buffer = generatedPdf;
  } else if (dataUri && dataUri.startsWith("data:")) {
    const commaIdx = dataUri.indexOf(",");
    const header = dataUri.slice(0, commaIdx);
    const b64 = dataUri.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:(.*?);/);
    mime = mimeMatch ? mimeMatch[1] : "application/pdf";
    buffer = Buffer.from(b64, "base64");
  } else {
    return new NextResponse("Document not found", { status: 404 });
  }

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
