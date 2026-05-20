import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { isMinor, getMinorChildren } from "@/lib/minor";

// GET /api/portal/documents
// Returns the member's documents for the portal. Behavior depends on age/role:
//   - Adult / non-minor: own waivers + contracts + uploaded docs
//   - Minor (linked to a parent/guardian, under 18): waivers + contracts
//     are HIDDEN — they appear on the parent's tab instead. Uploaded docs
//     stay (they may be personal records the gym uploaded for them).
//   - Parent / guardian: own docs + each minor child's contracts + waivers,
//     labeled with the child's first name.
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      firstName: true,
      styleDocuments: true,
      stylesNotes: true,
      waiverSigned: true,
      waiverSignedAt: true,
      signedWaivers: {
        select: { id: true, templateName: true, signedAt: true, pdfData: true },
        orderBy: { signedAt: "desc" },
      },
      signedContracts: {
        select: { id: true, planName: true, fileName: true, signedAt: true, pdfData: true },
        orderBy: { signedAt: "desc" },
      },
    },
  });

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewerIsMinor = await isMinor(auth.memberId);

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

  // Build a portal-PDF URL with the friendly filename as the final path
  // segment — that's what most browsers show in the tab title.
  function portalPdfUrl(docId: string, friendlyName: string) {
    const fname = encodeURIComponent(`${friendlyName}.pdf`);
    return `/api/portal/documents/${encodeURIComponent(docId)}/pdf/${fname}`;
  }

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
          url: portalPdfUrl(doc.id, doc.name),
          type: "document",
          date: doc.uploadedAt || "",
        });
      }
    } catch { /* ignore */ }
  }

  // OWN waivers + contracts — but only if the viewer is NOT a minor.
  // Minors' legal documents are surfaced on the parent's tab instead.
  if (!viewerIsMinor) {
    // Use "{FirstName}'s Waiver" so the doc tab clearly says whose this is
    // (matters mostly for the parent view that also shows their kids'
    // waivers — both end up consistent: "Cruz's Waiver", "Nico's Waiver").
    const ownWaiverLabel = `${member.firstName}'s Waiver`;

    for (const w of member.signedWaivers) {
      const docId = `waiver-${w.id}`;
      documents.push({
        id: docId,
        name: ownWaiverLabel,
        url: portalPdfUrl(docId, ownWaiverLabel),
        type: "waiver",
        date: new Date(w.signedAt).toISOString(),
      });
    }

    // Legacy: member marked waiverSigned but no SignedWaiver row — endpoint generates a stub PDF
    if (member.waiverSigned && member.signedWaivers.length === 0) {
      documents.push({
        id: "waiver-legacy",
        name: ownWaiverLabel,
        url: portalPdfUrl("waiver-legacy", ownWaiverLabel),
        type: "waiver",
        date: member.waiverSignedAt ? new Date(member.waiverSignedAt).toISOString() : "",
      });
    }

    for (const c of member.signedContracts) {
      const docId = `contract-${c.id}`;
      const friendly = c.fileName?.replace(/\.pdf$/i, "") || c.planName || "Contract";
      documents.push({
        id: docId,
        name: friendly,
        url: portalPdfUrl(docId, friendly),
        type: "contract",
        date: new Date(c.signedAt).toISOString(),
      });
    }
  }

  // PARENT/GUARDIAN view: also include each minor child's contracts +
  // waivers, with the child's first name prefixed for clarity.
  const children = await getMinorChildren(auth.memberId);
  for (const child of children) {
    const childDocs = await prisma.member.findUnique({
      where: { id: child.id },
      select: {
        waiverSigned: true,
        waiverSignedAt: true,
        signedWaivers: {
          select: { id: true, templateName: true, signedAt: true },
          orderBy: { signedAt: "desc" },
        },
        signedContracts: {
          select: { id: true, planName: true, fileName: true, signedAt: true },
          orderBy: { signedAt: "desc" },
        },
      },
    });
    if (!childDocs) continue;

    const childWaiverLabel = `${child.firstName}'s Waiver`;

    for (const w of childDocs.signedWaivers) {
      const docId = `child-${child.id}-waiver-${w.id}`;
      documents.push({
        id: docId,
        name: childWaiverLabel,
        url: portalPdfUrl(docId, childWaiverLabel),
        type: "waiver",
        date: new Date(w.signedAt).toISOString(),
      });
    }

    if (childDocs.waiverSigned && childDocs.signedWaivers.length === 0) {
      const docId = `child-${child.id}-waiver-legacy`;
      documents.push({
        id: docId,
        name: childWaiverLabel,
        url: portalPdfUrl(docId, childWaiverLabel),
        type: "waiver",
        date: childDocs.waiverSignedAt ? new Date(childDocs.waiverSignedAt).toISOString() : "",
      });
    }

    for (const c of childDocs.signedContracts) {
      const docId = `child-${child.id}-contract-${c.id}`;
      const friendly = `${child.firstName} — ${c.fileName?.replace(/\.pdf$/i, "") || c.planName || "Contract"}`;
      documents.push({
        id: docId,
        name: friendly,
        url: portalPdfUrl(docId, friendly),
        type: "contract",
        date: new Date(c.signedAt).toISOString(),
      });
    }
  }

  documents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return NextResponse.json(
    { documents },
    { headers: { "Cache-Control": "no-store" } },
  );
}
