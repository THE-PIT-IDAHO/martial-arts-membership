import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { parseLocalDate } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      photoUrl: true,
      rank: true,
      primaryStyle: true,
      stylesNotes: true,
      styleDocuments: true,
      status: true,
      attendances: {
        where: { confirmed: true },
        select: {
          id: true,
          attendanceDate: true,
          checkedInAt: true,
          source: true,
          classSession: {
            select: {
              classType: true,
              classTypes: true,
              styleName: true,
              styleNames: true,
            },
          },
        },
      },
      dateOfBirth: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      memberNumber: true,
      waiverSigned: true,
      waiverSignedAt: true,
      emailOptIn: true,
      startDate: true,
      medicalNotes: true,
      parentGuardianName: true,
      uniformSize: true,
      clientId: true,
    },
  });

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build rank/belt info from stylesNotes + style beltConfig
  const rankInfo: Array<{
    styleName: string;
    rankName: string;
    beltLayers: Record<string, unknown> | null;
    beltThumbnail?: string | null;
    nextRankName: string | null;
    classRequirements: Array<{ label: string; attended: number; required: number; met: boolean }>;
    documents: Array<{ id: string; name: string; url: string }>;
  }> = [];

  // Parse stylesNotes to get enrolled styles and ranks
  let enrolledStyles: Array<{ name: string; rank?: string; attendanceResetDate?: string; active?: boolean }> = [];
  if (member.stylesNotes) {
    try {
      enrolledStyles = JSON.parse(member.stylesNotes);
    } catch { /* ignore */ }
  }

  // If no stylesNotes but has primaryStyle + rank, use that
  if (enrolledStyles.length === 0 && member.primaryStyle && member.rank) {
    enrolledStyles = [{ name: member.primaryStyle, rank: member.rank }];
  }

  // Track all pdfDocument IDs per style for the fallback filter
  const allBeltConfigDocIds = new Map<string, Set<string>>();

  // For each enrolled style, look up the beltConfig to get belt image + documents + progress
  for (const enrolled of enrolledStyles) {
    if (!enrolled.name || !enrolled.rank) continue;
    if (enrolled.active === false) continue;

    // Case-insensitive style lookup so e.g. "Brazilian Jiu-Jitsu" in stylesNotes
    // still matches "brazilian jiu-jitsu" in the Style table.
    // Scope Style lookup to the member's tenant. Without this, findFirst could
    // return a same-named Style from another client (a stale duplicate from
    // earlier imports) that had no beltConfig/PDFs.
    const style = await prisma.style.findFirst({
      where: {
        name: { equals: enrolled.name, mode: "insensitive" },
        clientId: member.clientId,
      },
      select: {
        beltConfig: true,
        ranks: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true, pdfDocument: true, thumbnail: true } },
      },
    });

    let beltLayers: Record<string, unknown> | null = null;
    let nextRankName: string | null = null;
    let classRequirements: Array<{ label: string; attended: number; required: number; met: boolean }> = [];
    let documents: Array<{ id: string; name: string; url: string }> = [];

    if (style?.beltConfig) {
      try {
        const config = JSON.parse(style.beltConfig);
        const ranks: Array<{
          name: string;
          order: number;
          layers?: Record<string, unknown>;
          classRequirements?: Array<{ label: string; minCount: number }>;
          pdfDocuments?: Array<{ id: string; name: string; url: string }>;
        }> = config.ranks || [];

        const sortedRanks = [...ranks].sort((a, b) => a.order - b.order);

        // Collect ALL pdfDocument IDs from this style's beltConfig (for fallback filtering)
        const styleDocIdSet = new Set<string>();
        for (const r of ranks) {
          if (r.pdfDocuments) {
            for (const doc of r.pdfDocuments) {
              styleDocIdSet.add(doc.id);
            }
          }
        }
        allBeltConfigDocIds.set(enrolled.name.toLowerCase(), styleDocIdSet);

        const currentRankIndex = sortedRanks.findIndex(
          (r) => r.name.toLowerCase() === enrolled.rank!.toLowerCase()
        );

        // Merge rank layers with style default layers
        const defaultStyleLayers = config.layers || {};
        if (currentRankIndex >= 0) {
          const currentRank = sortedRanks[currentRankIndex];
          beltLayers = { ...defaultStyleLayers, ...(currentRank.layers || {}), fabric: true };

          // Collect PDFs from all ranks up to and including current rank.
          // Source from the Rank model (Rank.pdfDocument) and emit streaming URLs
          // — beltConfig.pdfDocuments URLs were stripped to keep beltConfig under 1MB.
          const seenRankIds = new Set<string>();
          for (const r of sortedRanks) {
            if (r.order > currentRank.order) continue;
            const rankRow = style.ranks.find((rr) => rr.name.toLowerCase() === r.name.toLowerCase());
            if (rankRow?.pdfDocument && !seenRankIds.has(rankRow.id)) {
              seenRankIds.add(rankRow.id);
              // Use the Rank's unique ID rather than its name so two different
              // styles with same-named ranks (e.g. White Belt) resolve to the
              // correct PDF.
              const docId = `rank-pdf-${rankRow.id}`;
              const fname = encodeURIComponent(`${r.name}.pdf`);
              documents.push({
                id: docId,
                name: `${r.name} Curriculum`,
                url: `/api/portal/documents/${encodeURIComponent(docId)}/pdf/${fname}`,
              });
            }
          }

          // Reqs stored on a rank = needed to GRADUATE FROM that rank, so
          // for a member sitting at currentRank we display currentRank's
          // requirements (what they're working to satisfy). nextRank is
          // kept only for the "Next: X" header label. Same convention as
          // the admin member profile, /api/promotions/eligible, and
          // /api/portal/auth/me. The /portal/styles page actually
          // fetches THIS route (not /api/portal/auth/me), which is why
          // Colten still saw the old next-rank numbers after the prior
          // fix landed.
          if (currentRankIndex < sortedRanks.length - 1) {
            nextRankName = sortedRanks[currentRankIndex + 1].name;
          }

          // Permissive style gate (matches admin/promotions): explicit
          // style tag, IMPORTED bulk-import rows, or class with no style
          // attached at all. Bulk-import attendance lives on stub class
          // sessions with a classType but no styleName — the strict
          // filter was dropping all of those.
          const styleAttendances = (member.attendances || []).filter((att) => {
            if (enrolled.attendanceResetDate) {
              const attDate = att.attendanceDate
                ? new Date(att.attendanceDate).toISOString().split("T")[0]
                : att.checkedInAt
                  ? new Date(att.checkedInAt).toISOString().split("T")[0]
                  : null;
              if (attDate && attDate < enrolled.attendanceResetDate) return false;
            }
            if (att.source === "IMPORTED") return true;
            if (!att.classSession) return false;
            const cs = att.classSession;
            if (cs.styleNames) {
              try {
                const names: string[] = JSON.parse(cs.styleNames);
                if (names.some((n) => n.toLowerCase() === enrolled.name.toLowerCase())) return true;
              } catch { /* ignore */ }
            }
            if (cs.styleName?.toLowerCase() === enrolled.name.toLowerCase()) return true;
            return !cs.styleName && !cs.styleNames;
          });

          if (currentRank.classRequirements && Array.isArray(currentRank.classRequirements)) {
            classRequirements = currentRank.classRequirements
              .filter((req) => req.label && req.minCount != null && req.minCount > 0)
              .map((req) => {
                const isAny = req.label === "*";
                const attended = styleAttendances.filter((att) => {
                  if (!att.classSession) return false;
                  if (isAny) return true;
                  if (att.classSession.classType?.toLowerCase() === req.label.toLowerCase()) return true;
                  if (att.classSession.classTypes) {
                    try {
                      const types: string[] = JSON.parse(att.classSession.classTypes);
                      return types.some((t) => t.toLowerCase() === req.label.toLowerCase());
                    } catch { /* ignore */ }
                  }
                  return false;
                }).length;
                return { label: isAny ? "Any Class" : req.label, attended, required: req.minCount, met: attended >= req.minCount };
              });
          }

          if (classRequirements.length === 0) {
            const rankModel = await prisma.rank.findFirst({
              where: { name: currentRank.name },
              select: { classRequirement: true },
            });
            if (rankModel?.classRequirement) {
              const totalAttended = styleAttendances.length;
              classRequirements = [{
                label: "Classes",
                attended: totalAttended,
                required: rankModel.classRequirement,
                met: totalAttended >= rankModel.classRequirement,
              }];
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Fallback path: if the style's beltConfig is missing or broken, derive PDFs
    // and class requirements straight from the Rank table. This guarantees
    // documents + progress show even when beltConfig is empty for this style.
    if (style && (documents.length === 0 || classRequirements.length === 0)) {
      const sortedRankRows = [...style.ranks].sort((a, b) => a.order - b.order);
      const currentRankIdx = sortedRankRows.findIndex(
        (r) => r.name.toLowerCase() === enrolled.rank!.toLowerCase(),
      );
      if (currentRankIdx >= 0) {
        const curRank = sortedRankRows[currentRankIdx];

        if (documents.length === 0) {
          const seen = new Set<string>();
          for (const r of sortedRankRows) {
            if (r.order > curRank.order) continue;
            if (r.pdfDocument && !seen.has(r.id)) {
              seen.add(r.id);
              const docId = `rank-pdf-${r.id}`;
              const fname = encodeURIComponent(`${r.name}.pdf`);
              documents.push({
                id: docId,
                name: `${r.name} Curriculum`,
                url: `/api/portal/documents/${encodeURIComponent(docId)}/pdf/${fname}`,
              });
            }
          }
        }

        if (classRequirements.length === 0 && currentRankIdx < sortedRankRows.length - 1) {
          const nextRank = sortedRankRows[currentRankIdx + 1];
          if (!nextRankName) nextRankName = nextRank.name;
          const rankModel = await prisma.rank.findFirst({
            where: { id: nextRank.id || undefined, name: nextRank.name },
            select: { classRequirement: true },
          }).catch(() => null);
          const requirement = rankModel?.classRequirement;
          if (requirement) {
            const styleAttendances = (member.attendances || []).filter((att) => {
              if (enrolled.attendanceResetDate) {
                const attDate = att.attendanceDate
                  ? new Date(att.attendanceDate).toISOString().split("T")[0]
                  : att.checkedInAt
                    ? new Date(att.checkedInAt).toISOString().split("T")[0]
                    : null;
                if (attDate && attDate < enrolled.attendanceResetDate) return false;
              }
              if (att.source === "IMPORTED") return true;
              if (!att.classSession) return false;
              if (att.classSession.styleNames) {
                try {
                  const names: string[] = JSON.parse(att.classSession.styleNames);
                  return names.some((n) => n.toLowerCase() === enrolled.name.toLowerCase());
                } catch { /* ignore */ }
              }
              return att.classSession.styleName?.toLowerCase() === enrolled.name.toLowerCase();
            });
            classRequirements = [{
              label: "Classes",
              attended: styleAttendances.length,
              required: requirement,
              met: styleAttendances.length >= requirement,
            }];
          }
        }
      }
    }

    // Belt thumbnail fallback: if beltLayers don't include fabricColor (so the
    // portal can't render a colored belt), expose the current rank's stored
    // thumbnail image so the portal can show that instead.
    let beltThumbnail: string | null = null;
    if (style) {
      const cur = style.ranks.find((rr) => rr.name.toLowerCase() === enrolled.rank!.toLowerCase());
      if (cur?.thumbnail) beltThumbnail = cur.thumbnail;
    }

    rankInfo.push({
      styleName: enrolled.name,
      rankName: enrolled.rank,
      beltLayers,
      beltThumbnail,
      nextRankName,
      classRequirements,
      documents,
    });
  }

  // If any enrolled style has no beltConfig docs, fall back to member's styleDocuments
  // Match by document ID against each style's beltConfig pdfDocuments (not by rank name,
  // since different styles can share rank names like "White Belt")
  if (member.styleDocuments) {
    try {
      const memberDocs: Array<{ id: string; name: string; url: string; fromRank?: string }> = JSON.parse(member.styleDocuments);

      // Build set of doc IDs that belong to ANY other style's beltConfig
      for (const ri of rankInfo) {
        if (ri.documents.length === 0 && memberDocs.length > 0) {
          const thisStyleDocIds = allBeltConfigDocIds.get(ri.styleName.toLowerCase()) || new Set<string>();

          // Collect doc IDs owned by other styles
          const otherStyleDocIds = new Set<string>();
          for (const [styleName, ids] of allBeltConfigDocIds) {
            if (styleName !== ri.styleName.toLowerCase()) {
              for (const id of ids) otherStyleDocIds.add(id);
            }
          }

          const seenIds = new Set<string>();
          for (const doc of memberDocs) {
            if (seenIds.has(doc.id)) continue;
            // Skip docs that belong to another style's beltConfig
            if (otherStyleDocIds.has(doc.id)) continue;
            // Include if it's in this style's beltConfig, or if it's a manual upload (not in any beltConfig)
            if (thisStyleDocIds.has(doc.id) || (!otherStyleDocIds.has(doc.id) && rankInfo.length === 1)) {
              seenIds.add(doc.id);
              ri.documents.push({
                id: doc.id,
                name: doc.name,
                url: `/api/portal/documents/${encodeURIComponent(doc.id)}/pdf`,
              });
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Don't send raw attendances/stylesNotes/styleDocuments to the client
  const { attendances: _a, stylesNotes: _s, styleDocuments: _d, ...memberData } = member;

  return NextResponse.json({
    ...memberData,
    rankInfo,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowedFields = [
    "firstName", "lastName", "dateOfBirth",
    "phone", "email", "address", "city", "state", "zipCode",
    "emergencyContactName", "emergencyContactPhone",
    "medicalNotes", "emailOptIn",
    "parentGuardianName", "uniformSize",
  ];

  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      if (field === "dateOfBirth") {
        // parseLocalDate anchors "YYYY-MM-DD" at local noon so the calendar
        // day survives both the JS Date conversion AND any later
        // toLocaleDateString render. Using `new Date("2000-05-15")` was
        // parsing as UTC midnight, which then displays as the previous
        // day in any negative-UTC timezone (Colten saw 5/15 save and re-
        // render as 5/14 or 5/16 depending on the render path).
        updateData[field] = body[field] ? parseLocalDate(body[field]) : null;
      } else {
        updateData[field] = body[field];
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.member.update({
    where: { id: auth.memberId },
    data: updateData,
  });

  return NextResponse.json({ success: true, id: updated.id });
}

