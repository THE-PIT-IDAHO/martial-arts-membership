import jsPDF from "jspdf";

/**
 * Render a members-report as a printable PDF that matches the standard
 * page format used elsewhere in the app: letter, PORTRAIT, 0.5 in
 * margins. Column widths adapt to cell content and scale so the table
 * spans the full page width; column headers wrap to multiple lines so
 * a long label doesn't force the whole column wider than the data
 * needs. Rows in `primaryColumns` render in the app's primary red to
 * match the Link-style names shown on-screen.
 *
 * jsPDF ships only text/line/rect primitives, so table layout is
 * hand-rolled here. Two passes: draw content (adding pages as needed),
 * then walk every page with setPage() to stamp "Page X of Y" in the
 * bottom margin.
 */
export type ReportPdfInput = {
  title: string;
  gymName?: string;
  headers: string[];
  rows: Array<Array<string>>;
  // Column indexes (0-based) that should render in primary red.
  // Matches the on-screen table's Link-styled first/last name cells.
  primaryColumns?: number[];
};

const PT_PER_IN = 72;
// Matches Tailwind theme "primary" (#c41111).
const PRIMARY_RGB: [number, number, number] = [196, 17, 17];

export function generateReportPdf(data: ReportPdfInput): jsPDF {
  const pdf = new jsPDF({ format: "letter", orientation: "portrait", unit: "pt" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 0.5 * PT_PER_IN;
  const contentW = pw - margin * 2;
  const primarySet = new Set(data.primaryColumns || []);

  const TITLE_FONT = 14;
  const SUBTITLE_FONT = 8;
  const HEADER_FONT = 9;
  const BODY_FONT = 8;
  const ROW_PAD_X = 3;
  const ROW_PAD_Y = 3;
  const LINE_H = BODY_FONT * 1.25;
  const HEADER_LINE_H = HEADER_FONT * 1.25;
  const FOOTER_RESERVE = 24; // room at the bottom for "Page X of Y"

  // --- Column widths ------------------------------------------------------
  // Measure the widest CELL per column (not header -- headers wrap to
  // whatever width falls out). Then scale proportionally so the total
  // exactly fills the printable width -- fills the page whether cells
  // came out narrow or wide.
  pdf.setFontSize(BODY_FONT);
  const naturalCellWidths = data.headers.map((_, colIdx) => {
    let widest = 0;
    for (const row of data.rows) {
      const w = pdf.getTextWidth(row[colIdx] || "");
      if (w > widest) widest = w;
    }
    // Minimum width so an empty column still shows -- otherwise a
    // fully empty column would compute to 0 and the scale math would
    // ignore it entirely.
    return Math.max(widest + ROW_PAD_X * 2, 20);
  });
  const totalNatural = naturalCellWidths.reduce((a, b) => a + b, 0) || 1;
  const scale = contentW / totalNatural;
  const colWidths = naturalCellWidths.map((w) => w * scale);
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  // --- Wrapped header lines ----------------------------------------------
  // Headers can be multi-word (e.g. "Membership Plan", "Last Promotion");
  // wrap to fit whatever width came out for their column so the column
  // width isn't dictated by the header instead of the data.
  pdf.setFontSize(HEADER_FONT);
  const wrappedHeaders = data.headers.map((h, i) =>
    wrapText(pdf, h, colWidths[i] - ROW_PAD_X * 2),
  );
  const headerLineCount = Math.max(1, ...wrappedHeaders.map((l) => l.length));
  const headerBlockH = headerLineCount * HEADER_LINE_H + ROW_PAD_Y * 2;

  const rowH = LINE_H + ROW_PAD_Y * 2;
  const bottomLimit = ph - margin - FOOTER_RESERVE;

  // --- Draw functions -----------------------------------------------------
  function drawTitleBlock(): number {
    let y = margin;
    if (data.gymName) {
      pdf.setFontSize(SUBTITLE_FONT);
      pdf.setTextColor(120, 120, 120);
      pdf.text(data.gymName.toUpperCase(), margin, y + SUBTITLE_FONT);
      y += SUBTITLE_FONT + 4;
    }
    pdf.setFontSize(TITLE_FONT);
    pdf.setTextColor(20, 20, 20);
    pdf.text(data.title, margin, y + TITLE_FONT);
    return y + TITLE_FONT + 10;
  }
  function drawTableHeader(y: number): number {
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margin, y, totalW, headerBlockH, "F");
    pdf.setFontSize(HEADER_FONT);
    pdf.setTextColor(50, 50, 50);
    let x = margin;
    for (let c = 0; c < data.headers.length; c++) {
      const lines = wrappedHeaders[c];
      for (let li = 0; li < lines.length; li++) {
        pdf.text(
          lines[li],
          x + ROW_PAD_X,
          y + ROW_PAD_Y + HEADER_FONT + li * HEADER_LINE_H,
        );
      }
      x += colWidths[c];
    }
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y + headerBlockH, margin + totalW, y + headerBlockH);
    return y + headerBlockH;
  }

  // --- Draw content -------------------------------------------------------
  let y = drawTitleBlock();
  y = drawTableHeader(y);
  pdf.setFontSize(BODY_FONT);

  for (let r = 0; r < data.rows.length; r++) {
    if (y + rowH > bottomLimit) {
      pdf.addPage();
      y = drawTitleBlock();
      y = drawTableHeader(y);
      pdf.setFontSize(BODY_FONT);
    }
    // Zebra stripe odd rows (very light) for scannability.
    if (r % 2 === 1) {
      pdf.setFillColor(249, 249, 249);
      pdf.rect(margin, y, totalW, rowH, "F");
    }
    let x = margin;
    for (let c = 0; c < data.headers.length; c++) {
      const cell = data.rows[r][c] || "";
      const text = truncateToWidth(pdf, cell, colWidths[c] - ROW_PAD_X * 2);
      if (primarySet.has(c)) {
        pdf.setTextColor(PRIMARY_RGB[0], PRIMARY_RGB[1], PRIMARY_RGB[2]);
      } else {
        pdf.setTextColor(30, 30, 30);
      }
      pdf.text(text, x + ROW_PAD_X, y + ROW_PAD_Y + BODY_FONT);
      x += colWidths[c];
    }
    pdf.setDrawColor(230, 230, 230);
    pdf.line(margin, y + rowH, margin + totalW, y + rowH);
    y += rowH;
  }

  // --- Footer: "Page X of Y" on every page --------------------------------
  // jsPDF supports setPage() to jump back and add content, so this
  // runs after all pages exist and stamps the final Y count on each.
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(SUBTITLE_FONT);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Page ${p} of ${totalPages}`, pw / 2, ph - margin / 2, { align: "center" });
  }

  return pdf;
}

/**
 * Greedy word-wrap: fit as many words per line as `maxW` allows. If a
 * single word is wider than maxW (rare -- long header labels shouldn't
 * be), break it character-by-character so we don't render off-canvas.
 */
function wrapText(pdf: jsPDF, text: string, maxW: number): string[] {
  if (!text) return [""];
  if (pdf.getTextWidth(text) <= maxW) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (pdf.getTextWidth(test) <= maxW) {
      cur = test;
      continue;
    }
    if (cur) lines.push(cur);
    if (pdf.getTextWidth(word) > maxW) {
      // Force-break an oversized single word by character.
      let piece = "";
      for (const ch of word) {
        const t = piece + ch;
        if (pdf.getTextWidth(t) > maxW) {
          if (piece) lines.push(piece);
          piece = ch;
        } else {
          piece = t;
        }
      }
      cur = piece;
    } else {
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Trim `text` with a trailing ellipsis until it fits `maxW`. Binary
 * search on prefix length so this stays cheap even on large tables.
 */
function truncateToWidth(pdf: jsPDF, text: string, maxW: number): string {
  if (!text) return "";
  if (pdf.getTextWidth(text) <= maxW) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (pdf.getTextWidth(candidate) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}
