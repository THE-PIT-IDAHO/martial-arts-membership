import jsPDF from "jspdf";

export type ReceiptData = {
  transactionNumber: string;
  date: string;
  memberName?: string;
  lineItems: Array<{
    itemName: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }>;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  gymName: string;
  gymAddress?: string;
  gymCity?: string;
  gymState?: string;
  gymZipCode?: string;
  gymPhone?: string;
  gymEmail?: string;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Generate a receipt PDF and return as base64 string (without data URI prefix).
 */
export function generateReceiptPdf(data: ReceiptData): string {
  const pdf = new jsPDF({ format: "letter" });
  const pw = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const cw = pw - margin * 2;
  let y = margin;

  // Header — Gym name
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text(data.gymName, pw / 2, y, { align: "center" });
  y += 6;

  // Address line
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  const addressParts: string[] = [];
  if (data.gymAddress) addressParts.push(data.gymAddress);
  const cityStateZip = [data.gymCity, data.gymState, data.gymZipCode].filter(Boolean).join(", ");
  if (cityStateZip) addressParts.push(cityStateZip);
  if (addressParts.length > 0) {
    pdf.text(addressParts.join(" | "), pw / 2, y, { align: "center" });
    y += 4;
  }
  if (data.gymPhone) {
    pdf.text(formatPhone(data.gymPhone), pw / 2, y, { align: "center" });
    y += 4;
  }
  if (data.gymEmail) {
    pdf.text(data.gymEmail, pw / 2, y, { align: "center" });
    y += 4;
  }
  y += 4;

  // Divider
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pw - margin, y);
  y += 8;

  // Receipt title
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text("RECEIPT", pw / 2, y, { align: "center" });
  y += 8;

  // Transaction info
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Transaction #: ${data.transactionNumber}`, margin, y);
  pdf.text(`Date: ${data.date}`, pw - margin, y, { align: "right" });
  y += 5;
  if (data.memberName) {
    pdf.text(`Member: ${data.memberName}`, margin, y);
    y += 5;
  }
  pdf.text(`Payment: ${data.paymentMethod}`, margin, y);
  y += 8;

  // Divider
  pdf.line(margin, y, pw - margin, y);
  y += 6;

  // Column headers
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Item", margin, y);
  pdf.text("Qty", margin + cw * 0.55, y, { align: "center" });
  pdf.text("Price", margin + cw * 0.72, y, { align: "right" });
  pdf.text("Total", pw - margin, y, { align: "right" });
  y += 3;
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pw - margin, y);
  y += 5;

  // Line items
  pdf.setFont("helvetica", "normal");
  for (const item of data.lineItems) {
    const name = item.itemName.length > 40 ? item.itemName.substring(0, 37) + "..." : item.itemName;
    pdf.text(name, margin, y);
    pdf.text(String(item.quantity), margin + cw * 0.55, y, { align: "center" });
    pdf.text(formatCents(item.unitPriceCents), margin + cw * 0.72, y, { align: "right" });
    pdf.text(formatCents(item.subtotalCents), pw - margin, y, { align: "right" });
    y += 5;
  }

  y += 3;
  pdf.line(margin, y, pw - margin, y);
  y += 6;

  // Totals
  pdf.setFontSize(9);
  const labelX = margin + cw * 0.55;

  pdf.text("Subtotal:", labelX, y);
  pdf.text(formatCents(data.subtotalCents), pw - margin, y, { align: "right" });
  y += 5;

  if (data.discountCents > 0) {
    pdf.text("Discount:", labelX, y);
    pdf.text(`-${formatCents(data.discountCents)}`, pw - margin, y, { align: "right" });
    y += 5;
  }

  if (data.taxCents > 0) {
    pdf.text("Tax:", labelX, y);
    pdf.text(formatCents(data.taxCents), pw - margin, y, { align: "right" });
    y += 5;
  }

  y += 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("TOTAL:", labelX, y);
  pdf.text(formatCents(data.totalCents), pw - margin, y, { align: "right" });
  y += 10;

  // Footer
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pw - margin, y);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text("Thank you for your business!", pw / 2, y, { align: "center" });

  // Return raw base64 (no data URI prefix)
  const dataUri = pdf.output("datauristring");
  return dataUri.split(",")[1];
}
