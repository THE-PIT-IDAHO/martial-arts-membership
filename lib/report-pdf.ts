import jsPDF from "jspdf";

/**
 * Render a members-report as a printable PDF that matches the standard
 * page format used elsewhere in the app (letter, landscape, 0.5 in
 * margins, header block + paginated data table).
 *
 * jsPDF only ships primitives (text / line / rect), no table helper,
 * so we lay the table out by hand: measure the widest cell per column
 * once, size the columns proportionally against the printable width,
 * then flow rows with page breaks (repeating the column-header row on
 * every page). Column widths are capped so a single very long cell
 * can't crush the rest of the table; over-width cells wrap.
 */
export type ReportPdfInput = {
  title: string;
  dateRangeLabel: string;
  gymName?: string;
  headers: string[];
  rows: Array<Array<string>>;
};

const PT_PER_IN = 72;

export function generateReportPdf(data: ReportPdfInput): jsPDF {
  const pdf = new jsPDF({ format: "letter", orientation: "landscape", unit: "pt" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 0.5 * PT_PER_IN;
  const contentW = pw - margin * 2;

  const HEADER_FONT = 11;
  const BODY_FONT = 9;
  const TITLE_FONT = 16;
  const SUBTITLE_FONT = 10;
  const ROW_PAD_X = 4;
  const ROW_PAD_Y = 4;
  const LINE_H = BODY_FONT * 1.25;
  const HEADER_LINE_H = HEADER_FONT * 1.25;

  // --- Compute column widths ------------------------------------------------
  // Measure the widest string per column in the current body font so the
  // proportional split respects actual content. Cap any single column at
  // 25% of contentW so one giant cell (e.g. a long email + notes combo)
  // can't starve the rest.
  pdf.setFontSize(BODY_FONT);
  const naturalWidths = data.headers.map((h, colIdx) => {
    let widest = pdf.getTextWidth(h);
    for (const row of data.rows) {
      const w = pdf.getTextWidth(row[colIdx] || "");
      if (w > widest) widest = w;
    }
    // + padding
    return widest + ROW_PAD_X * 2;
  });
  const maxCol = contentW * 0.25;
  const capped = naturalWidths.map((w) => Math.min(w, maxCol));
  // Scale to fit the page. If capped sum < contentW we DON'T stretch,
  // so a small table doesn't look ridiculous across the full page.
  const totalCapped = capped.reduce((a, b) => a + b, 0);
  const scale = totalCapped > contentW ? contentW / totalCapped : 1;
  const colWidths = capped.map((w) => w * scale);
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  // --- Helpers -------------------------------------------------------------
  function drawHeader(pageNumber: number) {
    let y = margin;
    // Gym name in small caps if present
    if (data.gymName) {
      pdf.setFontSize(SUBTITLE_FONT);
      pdf.setTextColor(120);
      pdf.text(data.gymName.toUpperCase(), margin, y);
      y += SUBTITLE_FONT * 1.2;
    }
    // Report title
    pdf.setFontSize(TITLE_FONT);
    pdf.setTextColor(20);
    pdf.text(data.title, margin, y + TITLE_FONT * 0.9);
    // Page X / date range on the right side, one line
    pdf.setFontSize(SUBTITLE_FONT);
    pdf.setTextColor(120);
    const right = `${data.dateRangeLabel}   ·   Page ${pageNumber}`;
    pdf.text(right, pw - margin, y + TITLE_FONT * 0.9, { align: "right" });
    return y + TITLE_FONT * 0.9 + 12; // return the y-cursor below the header
  }
  function drawTableHeaderRow(y: number): number {
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margin, y, totalW, HEADER_LINE_H + ROW_PAD_Y * 2, "F");
    pdf.setFontSize(HEADER_FONT);
    pdf.setTextColor(50);
    let x = margin;
    for (let i = 0; i < data.headers.length; i++) {
      const w = colWidths[i];
      const text = truncateToWidth(pdf, data.headers[i], w - ROW_PAD_X * 2);
      pdf.text(text, x + ROW_PAD_X, y + ROW_PAD_Y + HEADER_FONT);
      x += w;
    }
    // Underline
    pdf.setDrawColor(200);
    const yBottom = y + HEADER_LINE_H + ROW_PAD_Y * 2;
    pdf.line(margin, yBottom, margin + totalW, yBottom);
    return yBottom;
  }

  // --- Draw pages ----------------------------------------------------------
  let page = 1;
  let y = drawHeader(page);
  y = drawTableHeaderRow(y);
  pdf.setFontSize(BODY_FONT);
  pdf.setTextColor(30);

  const rowH = LINE_H + ROW_PAD_Y * 2;
  const bottomLimit = ph - margin;

  for (let r = 0; r < data.rows.length; r++) {
    if (y + rowH > bottomLimit) {
      pdf.addPage();
      page += 1;
      y = drawHeader(page);
      y = drawTableHeaderRow(y);
      pdf.setFontSize(BODY_FONT);
      pdf.setTextColor(30);
    }
    // Zebra striping (very light) for readability -- odd rows fill.
    if (r % 2 === 1) {
      pdf.setFillColor(249, 249, 249);
      pdf.rect(margin, y, totalW, rowH, "F");
    }
    let x = margin;
    for (let c = 0; c < data.headers.length; c++) {
      const w = colWidths[c];
      const cell = data.rows[r][c] || "";
      const text = truncateToWidth(pdf, cell, w - ROW_PAD_X * 2);
      pdf.text(text, x + ROW_PAD_X, y + ROW_PAD_Y + BODY_FONT);
      x += w;
    }
    // Row separator (subtle)
    pdf.setDrawColor(230);
    pdf.line(margin, y + rowH, margin + totalW, y + rowH);
    y += rowH;
  }

  return pdf;
}

/**
 * Trim a string with an ellipsis until it fits `maxW` at the current
 * jsPDF font. Cheap linear-shrink -- rows we render are already tightly
 * bounded by the column-width computation, so this only kicks in on
 * outlier long cells (bio blurbs, giant note fields).
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
