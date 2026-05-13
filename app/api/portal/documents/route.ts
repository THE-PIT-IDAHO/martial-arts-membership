import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/documents
// Returns the member's waivers and manually-uploaded documents only.
// Curriculum PDFs live under /portal/styles; contracts have their own admin space.
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      styleDocuments: true,
      stylesNotes: true,
      waiverSigned: true,
      waiverSignedAt: true,
      signedWaivers: {
        select: { id: true, templateName: true, signedAt: true, pdfData: true },
        orderBy: { signedAt: "desc" },
      },
    },
  });

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect rank doc IDs from enrolled styles' beltConfigs so we can exclude them
  const rankDocIds = new Set<string>();

  let enrolledStyles: Array<{ name: string }> = [];
  if (member.stylesNotes) {
    try { enrolledStyles = JSON.parse(member.stylesNotes); } catch { /* ignore */ }
  }

  for (const es of enrolledStyles) {
    if (!es.name) continue;
    const style = await prisma.style.findFirst({
      where: { name: es.name },
      select: { beltConfig: true },
    });
    if (style?.beltConfig) {
      try {
        const config = JSON.parse(style.beltConfig);
        const ranks: Array<{ pdfDocuments?: Array<{ id: string }> }> = config.ranks || [];
        for (const r of ranks) {
          if (r.pdfDocuments) {
            for (const doc of r.pdfDocuments) rankDocIds.add(doc.id);
          }
        }
      } catch { /* ignore */ }
    }
  }

  const documents: Array<{ id: string; name: string; url: string; type: string; date: string }> = [];

  // Manually uploaded docs in member.styleDocuments (excluding anything tagged as a rank/curriculum doc)
  if (member.styleDocuments) {
    try {
      const docs: Array<{ id: string; name: string; url: string; uploadedAt?: string; fromRank?: string }> =
        JSON.parse(member.styleDocuments);
      for (const doc of docs) {
        if (rankDocIds.has(doc.id)) continue;
        if (doc.fromRank) continue;
        documents.push({
          id: doc.id,
          name: doc.name,
          url: `/api/portal/documents/${encodeURIComponent(doc.id)}/pdf`,
          type: "document",
          date: doc.uploadedAt || "",
        });
      }
    } catch { /* ignore */ }
  }

  // Signed waivers — endpoint renders the PDF on the fly when pdfData is missing
  for (const w of member.signedWaivers) {
    const docId = `waiver-${w.id}`;
    documents.push({
      id: docId,
      name: w.templateName || "Signed Waiver",
      url: `/api/portal/documents/${encodeURIComponent(docId)}/pdf`,
      type: "waiver",
      date: new Date(w.signedAt).toISOString(),
    });
  }

  // Legacy: member marked waiverSigned but no SignedWaiver row — endpoint generates a stub PDF
  if (member.waiverSigned && member.signedWaivers.length === 0) {
    documents.push({
      id: "waiver-legacy",
      name: "Signed Waiver",
      url: "/api/portal/documents/waiver-legacy/pdf",
      type: "waiver",
      date: member.waiverSignedAt ? new Date(member.waiverSignedAt).toISOString() : "",
    });
  }

  documents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return NextResponse.json(
    { documents },
    { headers: { "Cache-Control": "no-store" } },
  );
}
