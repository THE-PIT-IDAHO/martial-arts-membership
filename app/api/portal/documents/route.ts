import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// GET /api/portal/documents
// Returns account documents (contracts, waivers, uploaded docs) — excludes rank/belt PDFs
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      styleDocuments: true,
      stylesNotes: true,
      signedWaivers: {
        select: { id: true, templateName: true, signedAt: true },
        orderBy: { signedAt: "desc" },
      },
      signedContracts: {
        select: { id: true, planName: true, signedAt: true },
        orderBy: { signedAt: "desc" },
      },
    },
  });

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect rank doc IDs from all enrolled styles' beltConfigs so we can exclude them
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

  // Filter styleDocuments to exclude rank PDFs
  const documents: Array<{ id: string; name: string; url: string; type: string; date: string }> = [];

  if (member.styleDocuments) {
    try {
      const docs: Array<{ id: string; name: string; url: string; uploadedAt?: string; fromRank?: string }> =
        JSON.parse(member.styleDocuments);
      for (const doc of docs) {
        if (rankDocIds.has(doc.id)) continue;
        if (doc.fromRank) continue; // explicitly tagged as rank doc
        documents.push({
          id: doc.id,
          name: doc.name,
          url: doc.url,
          type: "document",
          date: doc.uploadedAt || "",
        });
      }
    } catch { /* ignore */ }
  }

  // Add signed waivers
  for (const w of member.signedWaivers) {
    documents.push({
      id: `waiver-${w.id}`,
      name: w.templateName || "Signed Waiver",
      url: "", // no direct URL — viewed via dedicated endpoint
      type: "waiver",
      date: new Date(w.signedAt).toISOString(),
    });
  }

  // Add signed contracts
  for (const c of member.signedContracts) {
    documents.push({
      id: `contract-${c.id}`,
      name: `Contract: ${c.planName}`,
      url: "",
      type: "contract",
      date: new Date(c.signedAt).toISOString(),
    });
  }

  // Sort by date descending
  documents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return NextResponse.json({ documents });
}
