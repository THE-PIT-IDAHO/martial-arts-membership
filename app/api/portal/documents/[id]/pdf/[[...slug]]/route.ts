import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import jsPDF from "jspdf";
import { fetchContractPdf } from "@/lib/contract-storage";
import { isMinor, isMinorChildOf } from "@/lib/minor";

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

// GET /api/portal/documents/[id]/pdf  OR  /api/portal/documents/[id]/pdf/<anything>.pdf
//
// Streams a PDF for the authenticated member. Handles ID formats:
//   rank-pdf-<rankName>   → Rank.pdfDocument for one of the member's enrolled styles
//   waiver-<id>           → SignedWaiver.pdfData
//   contract-<id>         → SignedContract.pdfData (member-owned, private Blob)
//   <uuid>                → entry in member.styleDocuments by id
//
// The optional [[...slug]] trailing segment lets callers append a friendly
// filename to the URL (e.g. ".../pdf/Hawaiian-Kempo-Yellow-Belt.pdf").
// Browsers use that as the tab title. The route itself ignores it.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slug?: string[] }> },
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
    const tail = id.slice("rank-pdf-".length);
    // Look up directly by Rank ID first (current format). Falls back to the
    // legacy name-based format for any old cached URLs.
    const rankById = await prisma.rank.findUnique({
      where: { id: tail },
      select: {
        id: true, name: true, pdfDocument: true, styleId: true,
        style: { select: { clientId: true } },
      },
    }).catch(() => null);

    // Verify the member is enrolled in this rank's style (and tenant) before serving.
    if (rankById?.pdfDocument && rankById.style?.clientId) {
      let enrolledStyles: Array<{ name?: string; rank?: string; active?: boolean }> = [];
      if (member.stylesNotes) {
        try { enrolledStyles = JSON.parse(member.stylesNotes); } catch { /* ignore */ }
      }
      const ownerStyle = await prisma.style.findUnique({
        where: { id: rankById.styleId },
        select: { name: true, clientId: true },
      });
      if (ownerStyle && enrolledStyles.some((es) =>
        es.name && es.active !== false && es.name.toLowerCase() === ownerStyle.name.toLowerCase()
      )) {
        dataUri = rankById.pdfDocument;
        displayName = rankById.name;
      }
    }

    // Legacy fallback: tail is a rank name.
    if (!dataUri) {
      const rankName = tail;
      let enrolledStyles: Array<{ name?: string; rank?: string; active?: boolean }> = [];
      if (member.stylesNotes) {
        try { enrolledStyles = JSON.parse(member.stylesNotes); } catch { /* ignore */ }
      }

      for (const es of enrolledStyles) {
        if (!es.name || es.active === false || !es.rank) continue;
        const style = await prisma.style.findFirst({
          where: { name: { equals: es.name, mode: "insensitive" } },
          select: {
            name: true,
            ranks: {
              orderBy: { order: "asc" },
              select: { name: true, order: true, pdfDocument: true },
            },
          },
        });
        if (!style) continue;
        const currentRank = style.ranks.find((r) => r.name.toLowerCase() === es.rank!.toLowerCase());
        if (!currentRank) continue;
        const target = style.ranks.find(
          (r) => r.name.toLowerCase() === rankName.toLowerCase() && r.order <= currentRank.order
        );
        if (target?.pdfDocument) {
          dataUri = target.pdfDocument;
          displayName = rankName;
          break;
        }
      }
    }
  } else if (id === "waiver-legacy") {
    // Minor's own legacy waiver is surfaced on the parent's tab as
    // child-<id>-waiver-legacy, not here.
    if (await isMinor(auth.memberId)) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (member.waiverSigned) {
      generatedPdf = generateWaiverPdf({
        gymName,
        memberName,
        templateName: "Signed Waiver",
        signedAt: member.waiverSignedAt,
      });
      displayName = "Signed Waiver";
    }
  } else if (id.startsWith("child-")) {
    // Parent/guardian fetching a minor child's document. ID format:
    //   child-<childId>-contract-<contractId>
    //   child-<childId>-waiver-<waiverId>
    //   child-<childId>-waiver-legacy
    const rest = id.slice("child-".length);
    // Split on first '-' after the cuid (cuids don't contain dashes). The
    // child id is a cuid, so we can find the next "-contract-" or "-waiver-"
    // marker to split safely.
    const contractIdx = rest.indexOf("-contract-");
    const waiverIdx = rest.indexOf("-waiver-");
    if (contractIdx > 0) {
      const childId = rest.slice(0, contractIdx);
      const contractId = rest.slice(contractIdx + "-contract-".length);
      const allowed = await isMinorChildOf(auth.memberId, childId);
      if (allowed) {
        const contract = await prisma.signedContract.findFirst({
          where: { id: contractId, memberId: childId },
          select: { planName: true, fileName: true, pdfData: true, member: { select: { firstName: true } } },
        });
        if (contract?.pdfData) {
          if (contract.pdfData.startsWith("http")) {
            try {
              generatedPdf = await fetchContractPdf(contract.pdfData);
            } catch (err) {
              console.error("Failed to fetch contract PDF from Blob:", err);
            }
          } else {
            dataUri = contract.pdfData.startsWith("data:")
              ? contract.pdfData
              : `data:application/pdf;base64,${contract.pdfData}`;
          }
          const baseName = contract.fileName?.replace(/\.pdf$/i, "") || contract.planName || "Contract";
          displayName = `${contract.member.firstName} - ${baseName}`;
        }
      }
    } else if (waiverIdx > 0) {
      const childId = rest.slice(0, waiverIdx);
      const waiverTail = rest.slice(waiverIdx + "-waiver-".length);
      const allowed = await isMinorChildOf(auth.memberId, childId);
      if (allowed) {
        const childInfo = await prisma.member.findUnique({
          where: { id: childId },
          select: { firstName: true, lastName: true, waiverSigned: true, waiverSignedAt: true },
        });
        if (waiverTail === "legacy" && childInfo?.waiverSigned) {
          generatedPdf = generateWaiverPdf({
            gymName,
            memberName: `${childInfo.firstName} ${childInfo.lastName}`.trim(),
            templateName: "Signed Waiver",
            signedAt: childInfo.waiverSignedAt,
          });
          displayName = `${childInfo.firstName} - Signed Waiver`;
        } else if (waiverTail !== "legacy") {
          const waiver = await prisma.signedWaiver.findFirst({
            where: { id: waiverTail, memberId: childId },
            select: { templateName: true, pdfData: true, waiverContent: true, signatureData: true, signedAt: true },
          });
          if (waiver?.pdfData) {
            dataUri = waiver.pdfData;
            displayName = `${childInfo?.firstName || "Child"} - ${waiver.templateName || "Signed Waiver"}`;
          } else if (waiver) {
            generatedPdf = generateWaiverPdf({
              gymName,
              memberName: `${childInfo?.firstName || ""} ${childInfo?.lastName || ""}`.trim() || "Member",
              templateName: waiver.templateName || "Signed Waiver",
              signedAt: waiver.signedAt,
              waiverContent: waiver.waiverContent,
              signatureData: waiver.signatureData,
            });
            displayName = `${childInfo?.firstName || "Child"} - ${waiver.templateName || "Signed Waiver"}`;
          }
        }
      }
    }
  } else if (id.startsWith("contract-")) {
    // Member's own signed contracts. Minors cannot view their own contracts
    // through the portal — those move to the parent's account.
    if (await isMinor(auth.memberId)) {
      return new NextResponse("Not found", { status: 404 });
    }
    const contractId = id.slice("contract-".length);
    const contract = await prisma.signedContract.findFirst({
      where: { id: contractId, memberId: auth.memberId },
      select: { planName: true, fileName: true, pdfData: true },
    });
    if (contract?.pdfData) {
      if (contract.pdfData.startsWith("http")) {
        try {
          generatedPdf = await fetchContractPdf(contract.pdfData);
        } catch (err) {
          console.error("Failed to fetch contract PDF from Blob:", err);
        }
      } else {
        dataUri = contract.pdfData.startsWith("data:")
          ? contract.pdfData
          : `data:application/pdf;base64,${contract.pdfData}`;
      }
      displayName = contract.fileName?.replace(/\.pdf$/i, "") || contract.planName || "Contract";
    }
  } else if (id.startsWith("waiver-")) {
    // Same minor block — kids cannot view their own waivers through portal.
    if (await isMinor(auth.memberId)) {
      return new NextResponse("Not found", { status: 404 });
    }
    const waiverId = id.slice("waiver-".length);
    const waiver = await prisma.signedWaiver.findFirst({
      where: { id: waiverId, memberId: auth.memberId },
      select: { templateName: true, pdfData: true, waiverContent: true, signatureData: true, signedAt: true },
    });
    if (waiver?.pdfData) {
      dataUri = waiver.pdfData;
      displayName = waiver.templateName || "Signed Waiver";
    } else if (waiver) {
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
  } else if (dataUri && dataUri.startsWith("http")) {
    const res = await fetch(dataUri);
    if (!res.ok) return new NextResponse("Failed to load PDF", { status: 502 });
    const ct = res.headers.get("content-type");
    if (ct) mime = ct;
    buffer = Buffer.from(await res.arrayBuffer());
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
