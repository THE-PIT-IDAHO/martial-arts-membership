import jsPDF from "jspdf";
import { parseHtmlForPdf } from "@/components/rich-text-input";

export type PdfRankTestItem = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  required?: boolean;
  sortOrder: number;
  reps?: number | null;
  sets?: number | null;
  rounds?: number | null;
  roundDuration?: string | null;
  duration?: string | null;
  distance?: string | null;
  timeLimit?: string | null;
  timeLimitOperator?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  showTitleInPdf?: boolean;
};

export type PdfRankTestCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  items: PdfRankTestItem[];
};

export type PdfRankTest = {
  id: string;
  name: string;
  categories: PdfRankTestCategory[];
};

export type GymSettings = {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [200, 200, 200];
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

function lightenColor(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * amount),
    Math.round(rgb[1] + (255 - rgb[1]) * amount),
    Math.round(rgb[2] + (255 - rgb[2]) * amount),
  ];
}

function isLightColor(rgb: [number, number, number]): boolean {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.5;
}

export function generateCurriculumPdf(
  styleName: string,
  rankName: string,
  tests: PdfRankTest[],
  beltColor: string,
  gymSettings: GymSettings,
  logoImg?: HTMLImageElement,
  disclaimer?: string | null
): string {
  const rawRgb = hexToRgb(beltColor);

  // Detect near-white and near-black belts for special treatment
  const isWhiteBelt = rawRgb[0] > 240 && rawRgb[1] > 240 && rawRgb[2] > 240;
  const isBlackBelt = rawRgb[0] < 30 && rawRgb[1] < 30 && rawRgb[2] < 30;

  // Color scheme: rank color for title bars, tint for alternating content rows, white for the rest
  let rgb: [number, number, number];
  let veryLightTint: [number, number, number];
  let useWhiteText: boolean;

  if (isWhiteBelt) {
    rgb = [180, 180, 180];
    veryLightTint = [228, 228, 228];
    useWhiteText = false;
  } else if (isBlackBelt) {
    rgb = [25, 25, 25];
    veryLightTint = [220, 220, 220];
    useWhiteText = true;
  } else {
    rgb = rawRgb;
    veryLightTint = lightenColor(rgb, 0.78);
    useWhiteText = !isLightColor(rgb);
  }

  const pdf = new jsPDF({ orientation: "landscape", format: "letter" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 5;
  const cw = pw - margin * 2;
  const footerY = ph - 7;
  const disclaimerH = disclaimer ? 8 : 0;
  const disclaimerY = footerY - disclaimerH;
  const rowH = 5.5;

  // Gather all categories sorted
  const allCategories = tests.flatMap(t => t.categories).sort((a, b) => a.sortOrder - b.sortOrder);

  console.log("PDF categories:", allCategories.map(c => `${c.sortOrder}: ${c.name} (${c.items.length} items, types: ${[...new Set(c.items.map(i => i.type))].join(",")})`));

  // Separate: knowledge categories (Q&A text) vs table categories
  const knowledgeCategories = allCategories.filter(c =>
    c.items.length > 0 && c.items.every(i => i.type === "knowledge")
  );
  const tableCategories = allCategories.filter(c =>
    c.items.length > 0 && !c.items.every(i => i.type === "knowledge")
  );

  console.log("Knowledge cats:", knowledgeCategories.map(c => c.name));
  console.log("Table cats:", tableCategories.map(c => c.name));

  // Helper: draw a filled+bordered cell
  function drawCell(x: number, cy: number, w: number, h: number, fillRgb: [number, number, number]) {
    pdf.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
    pdf.rect(x, cy, w, h, "F");
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.rect(x, cy, w, h, "S");
  }

  function setBeltTextColor() {
    pdf.setTextColor(useWhiteText ? 255 : 0, useWhiteText ? 255 : 0, useWhiteText ? 255 : 0);
  }

  // ============================================================
  // PAGE RENDERING
  // ============================================================
  let y = margin;

  // === HEADER BOX ===
  function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === "1") {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  }

  const cityStateZip = [gymSettings.city, gymSettings.state, gymSettings.zipCode].filter(Boolean).join(", ");
  const infoTitle = `${styleName} / ${gymSettings.name}`;
  const infoLines: { text: string; bold?: boolean }[] = [{ text: infoTitle, bold: true }];
  if (gymSettings.address) infoLines.push({ text: gymSettings.address });
  if (cityStateZip) infoLines.push({ text: cityStateZip });
  if (gymSettings.phone) infoLines.push({ text: formatPhone(gymSettings.phone) });

  const lineH = 3;
  const infoBlockH = infoLines.length * lineH;
  const logoH = 16;
  const headerBoxH = Math.max(logoH + 2, infoBlockH + 2);

  pdf.setFontSize(8);
  let maxInfoW = 0;
  for (const line of infoLines) {
    pdf.setFont("helvetica", line.bold ? "bold" : "normal");
    const w = pdf.getTextWidth(line.text);
    if (w > maxInfoW) maxInfoW = w;
  }
  const infoLeftX = pw - margin - maxInfoW;

  // Logo (top-left, fixed 16mm height)
  if (logoImg) {
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    const logoW = logoH * aspect;
    pdf.addImage(logoImg, margin, y + (headerBoxH - logoH) / 2, logoW, logoH);
  }

  // Rank title (centered, large)
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${rankName} Techniques`, pw / 2, y + headerBoxH / 2 + 1, { align: "center" });

  // Gym info (left-aligned text block on the right side)
  pdf.setFontSize(8);
  pdf.setTextColor(0, 0, 0);
  let hry = y + (headerBoxH - infoBlockH) / 2 + 2.5;
  for (const line of infoLines) {
    pdf.setFont("helvetica", line.bold ? "bold" : "normal");
    pdf.text(line.text, infoLeftX, hry);
    hry += lineH;
  }
  y += headerBoxH + 0.5;

  // === KNOWLEDGE SECTION ===
  type KnowledgeBlock = { catName: string; items: Array<{ name: string; desc: string; videoUrl?: string; showTitle: boolean }> };
  const knowledgeBlocks: KnowledgeBlock[] = [];
  for (const cat of knowledgeCategories) {
    const block: KnowledgeBlock = {
      catName: cat.name,
      items: cat.items.map(item => ({
        name: getItemDisplayText(item),
        desc: item.description || "",
        videoUrl: item.videoUrl || undefined,
        showTitle: item.showTitleInPdf !== false,
      })),
    };
    knowledgeBlocks.push(block);
  }

  if (knowledgeBlocks.length > 0) {
    const knowledgeStartY = y;
    let measY = y;
    for (const block of knowledgeBlocks) {
      measY += 6;
      for (const item of block.items) {
        measY += 4;
        if (item.showTitle) {
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          const nameLines = pdf.splitTextToSize(item.name, cw - 6);
          measY += nameLines.length * 3.5;
        }
        if (item.desc) {
          pdf.setFontSize(9);
          const segments = parseHtmlForPdf(item.desc);
          let fullDescText = "";
          const boldRanges: Array<{ start: number; end: number }> = [];
          let pos = 0;
          for (const seg of segments) {
            if (seg.bold) boldRanges.push({ start: pos, end: pos + seg.text.length });
            fullDescText += seg.text;
            pos += seg.text.length;
          }
          const descLinesRaw2 = fullDescText.split("\n");
          while (descLinesRaw2.length > 0 && !descLinesRaw2[descLinesRaw2.length - 1].trim()) descLinesRaw2.pop();
          const descLines = descLinesRaw2;
          let charPos = 0;
          for (const line of descLines) {
            const lineStart = charPos;
            const lineEnd = charPos + line.length;
            charPos = lineEnd + 1;
            if (!line.trim()) { measY += 3.5; continue; }
            const isBold = boldRanges.some(r => r.start < lineEnd && r.end > lineStart);
            pdf.setFont("helvetica", isBold ? "bold" : "normal");
            const wrapped = pdf.splitTextToSize(line, cw - 6);
            measY += wrapped.length * 3.5;
          }
        }
        if (item.videoUrl) measY += 3.5;
      }
    }
    const knowledgeH = measY - knowledgeStartY;

    y = knowledgeStartY;
    for (const block of knowledgeBlocks) {
      drawCell(margin, y, cw, 6, rgb);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      setBeltTextColor();
      pdf.text(block.catName, pw / 2, y + 4.2, { align: "center" });
      pdf.setTextColor(0, 0, 0);
      y += 6;

      for (let ii = 0; ii < block.items.length; ii++) {
        const item = block.items[ii];

        let itemH = 4;
        if (item.showTitle) {
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          const nameLinesMeas = pdf.splitTextToSize(item.name, cw - 6);
          itemH += nameLinesMeas.length * 3.5;
        }
        if (item.desc) {
          pdf.setFontSize(9);
          const segments = parseHtmlForPdf(item.desc);
          let fullDescText = "";
          const boldRanges2: Array<{ start: number; end: number }> = [];
          let pos2 = 0;
          for (const seg of segments) {
            if (seg.bold) boldRanges2.push({ start: pos2, end: pos2 + seg.text.length });
            fullDescText += seg.text;
            pos2 += seg.text.length;
          }
          const descLinesRaw = fullDescText.split("\n");
          while (descLinesRaw.length > 0 && !descLinesRaw[descLinesRaw.length - 1].trim()) descLinesRaw.pop();
          const descLines = descLinesRaw;
          let charPos2 = 0;
          for (const line of descLines) {
            const lineStart = charPos2;
            const lineEnd = charPos2 + line.length;
            charPos2 = lineEnd + 1;
            if (!line.trim()) { itemH += 3.5; continue; }
            const isBold = boldRanges2.some(r => r.start < lineEnd && r.end > lineStart);
            pdf.setFont("helvetica", isBold ? "bold" : "normal");
            const wrapped = pdf.splitTextToSize(line, cw - 6);
            itemH += wrapped.length * 3.5;
          }
        }
        if (item.videoUrl) itemH += 3.5;

        const itemBg: [number, number, number] = ii % 2 === 0 ? veryLightTint : [255, 255, 255];
        drawCell(margin, y, cw, itemH, itemBg);

        y += 4;
        if (item.showTitle) {
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(0, 0, 0);
          const nameLines = pdf.splitTextToSize(item.name, cw - 6);
          for (const nl of nameLines) {
            pdf.text(nl, margin + 3, y);
            y += 3.5;
          }
        }

        if (item.desc) {
          const segments = parseHtmlForPdf(item.desc);
          let fullDescText = "";
          const boldRanges3: Array<{ start: number; end: number }> = [];
          let pos3 = 0;
          for (const seg of segments) {
            if (seg.bold) boldRanges3.push({ start: pos3, end: pos3 + seg.text.length });
            fullDescText += seg.text;
            pos3 += seg.text.length;
          }
          const descLines = fullDescText.split("\n");
          let charPos3 = 0;
          for (const textLine of descLines) {
            const lineStart = charPos3;
            const lineEnd = charPos3 + textLine.length;
            charPos3 = lineEnd + 1;
            if (!textLine.trim()) { y += 3.5; continue; }
            const isBold = boldRanges3.some(r => r.start < lineEnd && r.end > lineStart);
            pdf.setFont("helvetica", isBold ? "bold" : "normal");
            pdf.setFontSize(9);
            const wrapped = pdf.splitTextToSize(textLine, cw - 6);
            for (const wl of wrapped) {
              pdf.text(wl, margin + 3, y);
              y += 3.5;
            }
          }
        }

        if (item.videoUrl) {
          pdf.setFontSize(9);
          pdf.setTextColor(0, 0, 200);
          pdf.text("Link", margin + 3, y);
          const linkW = pdf.getTextWidth("Link");
          pdf.setDrawColor(0, 0, 200);
          pdf.setLineWidth(0.15);
          pdf.line(margin + 3, y + 0.5, margin + 3 + linkW, y + 0.5);
          pdf.link(margin + 3, y - 3, linkW + 1, 4, { url: item.videoUrl });
          pdf.setFontSize(9);
          pdf.setTextColor(0, 0, 0);
          pdf.setDrawColor(0, 0, 0);
          y += 3.5;
        }

        y += 1;
      }
    }
    y = knowledgeStartY + knowledgeH;
  }

  // === FOOTER HELPER ===
  function drawFooter() {
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(80, 80, 80);
    if (gymSettings.website) pdf.text(gymSettings.website, margin, footerY);
    if (gymSettings.email) pdf.text(gymSettings.email, pw / 2, footerY, { align: "center" });
    pdf.text(new Date().toLocaleDateString(), pw - margin, footerY, { align: "right" });
    pdf.setTextColor(0, 0, 0);
  }

  function newPage(): number {
    drawFooter();
    pdf.addPage();
    return margin;
  }

  // Helper: build full item text as plain string
  // Build fields in column order: Reps, Sets, Min/Rd, Rnds, Duration, Distance, Time Limit
  function buildReqParts(item: PdfRankTestItem): string[] {
    const parts: string[] = [];
    if (item.reps) parts.push(`${item.reps} reps`);
    if (item.sets) parts.push(`${item.sets} sets`);
    if (item.roundDuration) parts.push(`${item.roundDuration}/rd`);
    if (item.rounds) parts.push(`${item.rounds} rnds`);
    if (item.duration) parts.push(item.duration);
    if (item.distance) parts.push(item.distance);
    return parts;
  }

  function buildTimeLimitText(item: PdfRankTestItem): string {
    if (!item.timeLimit) return "";
    const tlOp = item.timeLimitOperator || "lte";
    const op = tlOp === "lte" ? "<=" : tlOp === "lt" ? "<" : tlOp === "gte" ? ">=" : tlOp === "gt" ? ">" : "<=";
    return `${op} ${item.timeLimit}`;
  }

  // Get display text: use description (preserves leading spaces) if available, fall back to name
  function getItemDisplayText(item: PdfRankTestItem): string {
    if (item.description) {
      // Strip HTML tags, take first line, preserve leading spaces
      return item.description.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").split("\n")[0];
    }
    return item.name || "";
  }

  function buildItemText(item: PdfRankTestItem): string {
    let text = getItemDisplayText(item);
    const parts = buildReqParts(item);
    const rText = parts.join(" / ");
    const timePart = buildTimeLimitText(item);
    if (rText || timePart) {
      if (text) text += " - ";
      if (rText) text += rText;
      if (timePart) { if (rText) text += " "; text += timePart; }
    }
    if (item.videoUrl) text += " - Link";
    return text;
  }

  // Helper: how many rowH lines an item needs
  function getItemRowCount(item: PdfRankTestItem, colW: number): number {
    const cellMaxW = colW - 4;
    const indent = 8;
    const hasLink = !!item.videoUrl;
    const baseText = hasLink ? buildItemText({ ...item, videoUrl: null } as PdfRankTestItem) : buildItemText(item);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const firstLines = pdf.splitTextToSize(baseText, cellMaxW);
    const renderLines: string[] = [firstLines[0]];
    if (firstLines.length > 1) {
      const remaining = firstLines.slice(1).join(" ");
      const contLines = pdf.splitTextToSize(remaining, cellMaxW - indent);
      renderLines.push(...contLines);
    }
    if (hasLink) {
      const lastIdx = renderLines.length - 1;
      const maxW = lastIdx === 0 ? cellMaxW : cellMaxW - indent;
      const withLink = renderLines[lastIdx] + " - Link";
      if (pdf.getTextWidth(withLink) <= maxW) {
        renderLines[lastIdx] = withLink;
      } else {
        renderLines.push("- Link");
      }
    }
    return renderLines.length;
  }

  // Helper: render a single table item cell
  function renderItemCell(item: PdfRankTestItem, colX: number, colWidth: number, cellY: number) {
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(0, 0, 0);

    const cellLeft = colX + 2;
    const cellMaxW = colWidth - 4;

    const reqs = buildReqParts(item);
    const reqText = reqs.join(" / ");
    let timeLimitOp = "";
    let timeLimitUnderline = false;
    let timeLimitVal = "";
    if (item.timeLimit) {
      const tlOp = item.timeLimitOperator || "lte";
      if (tlOp === "lte") { timeLimitOp = "<"; timeLimitUnderline = true; }
      else if (tlOp === "lt") { timeLimitOp = "<"; }
      else if (tlOp === "gte") { timeLimitOp = ">"; timeLimitUnderline = true; }
      else if (tlOp === "gt") { timeLimitOp = ">"; }
      else { timeLimitOp = "<"; timeLimitUnderline = true; }
      timeLimitVal = item.timeLimit;
    }

    let cursorX = cellLeft;
    const displayText = getItemDisplayText(item);

    if (displayText) {
      pdf.setFontSize(9);
      let reqsNeededW = 0;
      if (reqText || timeLimitVal) {
        reqsNeededW += pdf.getTextWidth("- ");
        if (reqText) reqsNeededW += pdf.getTextWidth(reqText);
        if (timeLimitVal) {
          if (reqText) reqsNeededW += pdf.getTextWidth(" ");
          reqsNeededW += pdf.getTextWidth((timeLimitOp || "<") + " " + timeLimitVal);
        }
      }
      if (item.videoUrl) reqsNeededW += pdf.getTextWidth(" - Link");
      pdf.setFontSize(10);
      const nameMaxW = Math.max(cellMaxW - reqsNeededW - 2, cellMaxW * 0.3);

      // Render with bold/italic from HTML if present
      if (item.description && (item.description.includes("<b>") || item.description.includes("<i>") || item.description.includes("<u>"))) {
        const segments = parseHtmlForPdf(item.description.replace(/<br\s*\/?>/gi, " ").replace(/<\/?div[^>]*>/gi, " "));
        // Render segments inline, clipping to nameMaxW
        let usedW = 0;
        for (const seg of segments) {
          if (usedW >= nameMaxW) break;
          const text = seg.text.replace(/\n/g, " ");
          if (!text) continue;
          pdf.setFont("helvetica", seg.bold ? "bold" : "normal");
          const availW = nameMaxW - usedW;
          const clipped = pdf.splitTextToSize(text, availW)[0] || "";
          if (!clipped) continue;
          pdf.text(clipped, cursorX + usedW, cellY + 3.8);
          usedW += pdf.getTextWidth(clipped);
        }
        pdf.setFont("helvetica", "normal");
        cursorX += usedW + 1;
      } else {
        const nameClipped = pdf.splitTextToSize(displayText, nameMaxW)[0] || displayText;
        pdf.text(nameClipped, cursorX, cellY + 3.8);
        cursorX += pdf.getTextWidth(nameClipped) + 1;
      }
    }

    const hasReqs = reqText || timeLimitVal;
    if (hasReqs) {
      pdf.setFontSize(9);
      const remainingW = (cellLeft + cellMaxW) - cursorX - 1;
      if (remainingW > 5) {
        if (displayText) {
          pdf.text("- ", cursorX, cellY + 3.8);
          cursorX += pdf.getTextWidth("- ");
        }
        if (reqText) {
          const reqClipped = pdf.splitTextToSize(reqText, (cellLeft + cellMaxW) - cursorX)[0] || "";
          if (reqClipped) {
            pdf.text(reqClipped, cursorX, cellY + 3.8);
            cursorX += pdf.getTextWidth(reqClipped);
          }
        }
        if (timeLimitVal) {
          if (reqText) {
            pdf.text(" ", cursorX, cellY + 3.8);
            cursorX += pdf.getTextWidth(" ");
          }
          if (timeLimitOp) {
            pdf.text(timeLimitOp, cursorX, cellY + 3.8);
            const opW = pdf.getTextWidth(timeLimitOp);
            if (timeLimitUnderline) {
              pdf.setDrawColor(0, 0, 0);
              pdf.setLineWidth(0.15);
              pdf.line(cursorX, cellY + 4.3, cursorX + opW, cellY + 4.3);
            }
            cursorX += opW + pdf.getTextWidth(" ");
          }
          pdf.text(timeLimitVal, cursorX, cellY + 3.8);
          cursorX += pdf.getTextWidth(timeLimitVal) + 1;
        } else {
          cursorX += 1;
        }
      }
    }

    if (item.videoUrl && cursorX + 12 < cellLeft + cellMaxW) {
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.text("- ", cursorX, cellY + 3.8);
      cursorX += pdf.getTextWidth("- ");
      pdf.setTextColor(0, 0, 200);
      pdf.text("Link", cursorX, cellY + 3.8);
      const linkW = pdf.getTextWidth("Link");
      pdf.setDrawColor(0, 0, 200);
      pdf.setLineWidth(0.1);
      pdf.line(cursorX, cellY + 4.2, cursorX + linkW, cellY + 4.2);
      pdf.link(cursorX, cellY + 0.8, linkW + 1, 4, { url: item.videoUrl });
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.setDrawColor(0, 0, 0);
    }
  }

  // === TABLE SECTIONS (masonry layout with aligned rows) ===
  const sectionHeaderH = rowH;
  const tableCats = tableCategories.slice(0, 9);
  const numCols = Math.min(3, tableCats.length);

  if (tableCats.length > 0 && numCols > 0) {
    const colWidth = cw / numCols;
    const tableStartY = y; // baseline for row color alignment

    // Calculate height needed for each section
    type SectionInfo = { cat: typeof tableCats[0]; height: number; itemRows: number };
    const sections: SectionInfo[] = tableCats.map(cat => {
      const itemRows = cat.items.reduce((sum, item) => sum + getItemRowCount(item, colWidth), 0);
      return { cat, height: sectionHeaderH + Math.max(itemRows, 1) * rowH, itemRows };
    });

    // Determine tint color based on absolute Y position (aligned across columns)
    function getTintAtY(cellY: number): [number, number, number] {
      const rowFromTop = Math.floor((cellY - tableStartY) / rowH);
      return rowFromTop % 2 === 0 ? veryLightTint : [255, 255, 255];
    }

    // Simple grid: rows of numCols, left to right, in order
    // Render sections row by row, immediately (no separate placement phase)
    let currentY = y;

    // Helper: render one section at a position
    function renderSection(sec: SectionInfo, colIdx: number, startY: number) {
      const colX = margin + colIdx * colWidth;

      // Header
      drawCell(colX, startY, colWidth, sectionHeaderH, rgb);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      setBeltTextColor();
      pdf.text(sec.cat.name, colX + colWidth / 2, startY + 4.2, { align: "center" });
      pdf.setTextColor(0, 0, 0);

      let cellY = startY + sectionHeaderH;

      for (const item of sec.cat.items) {
        const itemLines = getItemRowCount(item, colWidth);
        const itemH = itemLines * rowH;

        for (let li = 0; li < itemLines; li++) {
          const tint = getTintAtY(cellY + li * rowH);
          pdf.setFillColor(tint[0], tint[1], tint[2]);
          pdf.rect(colX, cellY + li * rowH, colWidth, rowH, "F");
        }

        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.2);
        pdf.rect(colX, cellY, colWidth, itemH, "S");

        if (itemLines === 1) {
          renderItemCell(item, colX, colWidth, cellY);
        } else {
          const hasLink = !!item.videoUrl;
          const baseText = hasLink ? buildItemText({ ...item, videoUrl: null } as PdfRankTestItem) : buildItemText(item);
          const indent = 8;
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(0, 0, 0);
          const cellMaxW = colWidth - 4;
          const firstLines = pdf.splitTextToSize(baseText, cellMaxW);
          const renderLines: string[] = [firstLines[0]];
          if (firstLines.length > 1) {
            const remaining = firstLines.slice(1).join(" ");
            const contLines = pdf.splitTextToSize(remaining, cellMaxW - indent);
            renderLines.push(...contLines);
          }
          if (hasLink) {
            const lastIdx = renderLines.length - 1;
            const maxW = lastIdx === 0 ? cellMaxW : cellMaxW - indent;
            const withLink = renderLines[lastIdx] + " - Link";
            if (pdf.getTextWidth(withLink) <= maxW) renderLines[lastIdx] = withLink;
            else renderLines.push("- Link");
          }
          for (let li = 0; li < renderLines.length; li++) {
            const xOff = li === 0 ? 2 : 2 + indent;
            const lineText = renderLines[li];
            const linkIdx = hasLink ? lineText.lastIndexOf("- Link") : -1;
            if (linkIdx >= 0 && item.videoUrl) {
              const before = lineText.substring(0, linkIdx);
              if (before) { pdf.setTextColor(0, 0, 0); pdf.text(before, colX + xOff, cellY + li * rowH + 3.8); }
              const beforeW = before ? pdf.getTextWidth(before) : 0;
              pdf.setTextColor(0, 0, 0);
              pdf.text("- ", colX + xOff + beforeW, cellY + li * rowH + 3.8);
              const dashW = pdf.getTextWidth("- ");
              const linkX = colX + xOff + beforeW + dashW;
              const linkY2 = cellY + li * rowH + 3.8;
              pdf.setTextColor(0, 0, 200);
              pdf.text("Link", linkX, linkY2);
              const linkW = pdf.getTextWidth("Link");
              pdf.setDrawColor(0, 0, 200); pdf.setLineWidth(0.1);
              pdf.line(linkX, linkY2 + 0.4, linkX + linkW, linkY2 + 0.4);
              pdf.link(linkX, linkY2 - 3, linkW + 1, 4, { url: item.videoUrl });
              pdf.setTextColor(0, 0, 0); pdf.setDrawColor(0, 0, 0);
            } else {
              pdf.text(lineText, colX + xOff, cellY + li * rowH + 3.8);
            }
          }
        }

        cellY += itemH;
      }

      return cellY;
    }

    // Process rows of sections
    for (let rowStart = 0; rowStart < sections.length; rowStart += numCols) {
      const rowSections = sections.slice(rowStart, rowStart + numCols);
      const tallestInRow = Math.max(...rowSections.map(s => s.height));
      const isLastRow = rowStart + numCols >= sections.length;
      // Last row needs disclaimer space, other rows can use space up to footer
      const pageLimit = isLastRow ? disclaimerY - 1 : footerY - 2;

      // Page break if this row doesn't fit
      if (currentY + tallestInRow > pageLimit && currentY > margin + 10) {
        drawFooter();
        pdf.addPage();
        currentY = margin;
      }

      // Render each section in this row and pad short ones
      for (let i = 0; i < rowSections.length; i++) {
        const endY = renderSection(rowSections[i], i, currentY);
        // Pad to match tallest
        const padTo = currentY + tallestInRow;
        const colX = margin + i * colWidth;
        let padY = endY;
        while (padY + rowH <= padTo) {
          drawCell(colX, padY, colWidth, rowH, getTintAtY(padY));
          padY += rowH;
        }
      }

      currentY += tallestInRow;
    }

    y = currentY;
  }

  // Disclaimer (above footer, centered)
  if (disclaimer) {
    const lines = disclaimer.split("\n").filter(l => l.trim());
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(80, 80, 80);
    const startY = disclaimerY + 4;
    for (let i = 0; i < lines.length; i++) {
      pdf.text(lines[i].trim(), pw / 2, startY + i * 3.5, { align: "center" });
    }
    pdf.setTextColor(0, 0, 0);
  }

  // Footer on last page
  drawFooter();

  return pdf.output("datauristring");
}
