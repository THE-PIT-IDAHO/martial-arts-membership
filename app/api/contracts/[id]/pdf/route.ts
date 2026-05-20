// GET /api/contracts/:id/pdf — secure server proxy for signed contract PDFs.
//
// Why a proxy (and not a redirect to the Blob URL)? Contracts contain PII
// (signatures, terms, financials). We store them in a PRIVATE Blob store,
// then re-check tenant + identity on every request and fetch the bytes
// server-side. The underlying Blob URL is never sent to the browser, and
// even if it leaked, it's unusable without the private token.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { fetchContractPdf } from "@/lib/contract-storage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const contract = await prisma.signedContract.findUnique({
      where: { id },
      select: {
        clientId: true,
        pdfData: true,
        fileName: true,
        planName: true,
        member: { select: { firstName: true, lastName: true } },
      },
    });

    if (!contract || contract.clientId !== clientId) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (!contract.pdfData) {
      return new NextResponse("No PDF on file for this contract", { status: 404 });
    }

    let buffer: Buffer;

    if (contract.pdfData.startsWith("http")) {
      // New path: PDF lives in private Blob. Fetch with the contract token.
      buffer = await fetchContractPdf(contract.pdfData);
    } else {
      // Legacy path: PDF still stored as base64 in the DB. Works until the
      // migration script moves it to Blob.
      const cleanB64 = contract.pdfData.startsWith("data:")
        ? contract.pdfData.split(",")[1]
        : contract.pdfData;
      buffer = Buffer.from(cleanB64, "base64");
    }

    const memberName = `${contract.member.firstName} ${contract.member.lastName}`.trim();
    const displayName = contract.fileName
      || `${memberName} - ${contract.planName || "Contract"}.pdf`;
    const safeName = displayName.replace(/[\r\n"\\]/g, "").trim() || "Contract.pdf";
    const asciiFallback = safeName.replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(safeName);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
        "Content-Length": String(buffer.length),
        // private = don't let shared caches keep a copy.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Contract PDF proxy error:", err);
    return new NextResponse("Failed to load contract", { status: 500 });
  }
}
