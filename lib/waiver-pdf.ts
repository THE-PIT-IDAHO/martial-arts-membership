// Client-side PDF generator shared by the adult + guardian waiver pages.
//
// Goal: a single layout where the header (logo, gym name, waiver title) sits
// on its own band at the top of every page, the body never collides with it,
// and multi-page documents are numbered "Page X of Y".
//
// The generator is layout-only — callers assemble the data blocks (info
// sections, body text, signatures) and pass them in.
import { jsPDF } from "jspdf";

export type GymInfo = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type InfoBlock = {
  title: string;
  // Optional paragraph rendered between the title and the rows — used for
  // things like a plan description so it sits inside the same visual
  // grouping as the rows beneath it.
  description?: string;
  rows: Array<{ label: string; value?: string | null }>;
};

export type BodySection = {
  title: string;
  content: string;
};

export type SignatureBlock = {
  title: string;
  signaturePng?: string;
  name: string;
  date: string;
};

export type WaiverPdfOptions = {
  gym: GymInfo;
  logoImage?: HTMLImageElement | null;
  waiverTitle: string;
  infoBlocks: InfoBlock[];
  sections: BodySection[];
  replacePlaceholders?: (text: string) => string;
  signatures: SignatureBlock[];
  electronicallySignedAt: string;
};

// Fixed header band reserved on every page. Body layout uses this so it can
// never run under the header — and the header is drawn last so the count of
// pages is known and "Page X of Y" comes out right.
const HEADER_BAND = 44;
const FOOTER_BAND = 12;

export function generateWaiverPdf(opts: WaiverPdfOptions): string {
  // compress: true cuts output ~40-60% by deflating internal streams; that
  // matters because the parent + child PDFs are both POSTed in one JSON
  // body and Vercel's function payload limit is 4.5MB.
  const pdf = new jsPDF({ compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Pre-rasterize the logo to a small JPEG so a high-res upload (gyms often
  // upload a 1–5MB PNG) doesn't blow up the PDF. We only render it ~13mm
  // tall, so anything over ~200px is wasted bytes.
  const logoDataUrl = downsampleLogo(opts.logoImage);
  const margin = 18;
  const maxWidth = pageWidth - margin * 2;

  const contentTop = HEADER_BAND + 4;
  const contentBottom = pageHeight - FOOTER_BAND - 4;
  let yPos = contentTop;

  function ensureSpace(needed: number) {
    if (yPos + needed > contentBottom) {
      pdf.addPage();
      yPos = contentTop;
    }
  }

  for (const block of opts.infoBlocks) {
    const visibleRows = block.rows.filter(
      (r) => r.value != null && String(r.value).trim() !== "",
    );
    const hasDescription = !!(block.description && block.description.trim());
    if (visibleRows.length === 0 && !hasDescription) continue;

    ensureSpace(8);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(block.title, margin, yPos);
    yPos += 6;

    // Description paragraph sits between the title and the rows, in the
    // same normal-weight body font as the rows so it reads cleanly.
    if (hasDescription) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const descLines: string[] = pdf.splitTextToSize(block.description!.trim(), maxWidth);
      for (const line of descLines) {
        ensureSpace(5);
        pdf.text(line, margin, yPos);
        yPos += 5;
      }
      if (visibleRows.length > 0) yPos += 2;
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    for (const row of visibleRows) {
      // Wrap long row text (e.g. comma-separated style lists) so it
      // never overflows the page width.
      const rowLines: string[] = pdf.splitTextToSize(`${row.label}: ${row.value}`, maxWidth);
      for (const line of rowLines) {
        ensureSpace(5);
        pdf.text(line, margin, yPos);
        yPos += 5;
      }
    }
    yPos += 5;
  }

  // Keep each section together on one page when possible. Compute the full
  // height (title + every wrapped line + bottom padding) up front; if it
  // doesn't fit in the space remaining on the current page, page-break
  // before drawing so the title doesn't get orphaned from its content.
  // A section taller than a full page falls back to line-by-line breaking
  // (no other choice).
  const pageContentHeight = contentBottom - contentTop;
  for (const section of opts.sections) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const text = opts.replacePlaceholders
      ? opts.replacePlaceholders(section.content)
      : section.content;
    const lines: string[] = pdf.splitTextToSize(text, maxWidth);

    const titleHeight = section.title ? 6 : 0;
    const sectionHeight = titleHeight + lines.length * 4 + 5;

    if (sectionHeight <= pageContentHeight && yPos + sectionHeight > contentBottom) {
      pdf.addPage();
      yPos = contentTop;
    }

    if (section.title) {
      ensureSpace(8);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      const titleText = opts.replacePlaceholders
        ? opts.replacePlaceholders(section.title)
        : section.title;
      pdf.text(titleText, margin, yPos);
      yPos += 6;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const line of lines) {
      ensureSpace(4);
      pdf.text(line, margin, yPos);
      yPos += 4;
    }
    yPos += 5;
  }

  for (const sig of opts.signatures) {
    // Keep each signature block together: if it won't fit, start a new page.
    const needed = 6 + (sig.signaturePng ? 23 : 0) + 5 + 5 + 4;
    if (yPos + needed > contentBottom) {
      pdf.addPage();
      yPos = contentTop;
    }
    yPos += 5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(sig.title, margin, yPos);
    yPos += 7;
    if (sig.signaturePng) {
      pdf.addImage(sig.signaturePng, "PNG", margin, yPos, 60, 20);
      yPos += 23;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(sig.name, margin, yPos);
    yPos += 5;
    pdf.text(`Date: ${sig.date}`, margin, yPos);
    yPos += 6;
  }

  ensureSpace(5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Signed electronically on ${opts.electronicallySignedAt}`, margin, yPos);

  // Header + footer pass — runs after content is laid out so the total page
  // count is known.
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawHeader(pdf, opts, pageWidth, margin, logoDataUrl);
    if (totalPages > 1) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        `Page ${i} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 6,
        { align: "right" },
      );
      pdf.setTextColor(0);
    }
  }

  return pdf.output("datauristring");
}

// Letterhead-style header: logo on the left, gym name + contact info
// right-aligned to the right margin, both sitting on the same row. Waiver
// title sits centered below, with a thin rule under it.
function drawHeader(
  pdf: jsPDF,
  opts: WaiverPdfOptions,
  pageWidth: number,
  margin: number,
  logoDataUrl: { dataUrl: string; width: number; height: number } | null,
) {
  const startY = 10;
  const blockH = 22; // shared height of the logo / contact-info row

  if (logoDataUrl) {
    const targetH = 16;
    const aspect = logoDataUrl.width / logoDataUrl.height;
    const targetW = targetH * aspect;
    const logoY = startY + (blockH - targetH) / 2;
    pdf.addImage(logoDataUrl.dataUrl, "JPEG", margin, logoY, targetW, targetH);
  }

  // Gym info, right-aligned to the right margin.
  const rightX = pageWidth - margin;
  let infoY = startY + 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(opts.gym.name || "Martial Arts School", rightX, infoY, { align: "right" });
  infoY += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  if (opts.gym.address) {
    pdf.text(opts.gym.address, rightX, infoY, { align: "right" });
    infoY += 4;
  }
  if (opts.gym.phone) {
    pdf.text(opts.gym.phone, rightX, infoY, { align: "right" });
    infoY += 4;
  }
  if (opts.gym.email) {
    pdf.text(opts.gym.email, rightX, infoY, { align: "right" });
    infoY += 4;
  }

  // Title + rule below the row.
  const titleY = startY + blockH + 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(opts.waiverTitle, pageWidth / 2, titleY, { align: "center" });
  const ruleY = titleY + 3;
  pdf.setDrawColor(180);
  pdf.line(margin, ruleY, pageWidth - margin, ruleY);
  pdf.setDrawColor(0);
}

// Re-render the gym logo at ~200px wide as a JPEG so the PDF doesn't embed
// a multi-megabyte source PNG. Returns null when no logo is provided or
// when the canvas API isn't available (e.g. during SSR).
function downsampleLogo(
  img?: HTMLImageElement | null,
): { dataUrl: string; width: number; height: number } | null {
  if (!img) return null;
  if (typeof document === "undefined") return null;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null;

  const maxDim = 220;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // White background so JPEG doesn't turn transparency black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(img, 0, 0, dstW, dstH);
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { dataUrl, width: dstW, height: dstH };
  } catch {
    return null;
  }
}
