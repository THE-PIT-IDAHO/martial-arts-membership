import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

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
    },
  });

  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build rank/belt info from stylesNotes + style beltConfig
  const rankInfo: Array<{
    styleName: string;
    rankName: string;
    beltLayers: Record<string, unknown> | null;
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

    const style = await prisma.style.findFirst({
      where: { name: enrolled.name },
      select: { beltConfig: true },
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

          // Collect PDFs from all ranks up to and including current rank
          for (const r of sortedRanks) {
            if (r.order <= currentRank.order && r.pdfDocuments) {
              for (const doc of r.pdfDocuments) {
                documents.push({ id: doc.id, name: doc.name, url: doc.url });
              }
            }
          }

          // Get next rank + attendance progress
          if (currentRankIndex < sortedRanks.length - 1) {
            const nextRank = sortedRanks[currentRankIndex + 1];
            nextRankName = nextRank.name;

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

            if (nextRank.classRequirements && Array.isArray(nextRank.classRequirements)) {
              classRequirements = nextRank.classRequirements
                .filter((req) => req.label && req.minCount != null && req.minCount > 0)
                .map((req) => {
                  const attended = styleAttendances.filter((att) => {
                    if (!att.classSession) return false;
                    if (att.classSession.classType?.toLowerCase() === req.label.toLowerCase()) return true;
                    if (att.classSession.classTypes) {
                      try {
                        const types: string[] = JSON.parse(att.classSession.classTypes);
                        return types.some((t) => t.toLowerCase() === req.label.toLowerCase());
                      } catch { /* ignore */ }
                    }
                    return false;
                  }).length;
                  return { label: req.label, attended, required: req.minCount, met: attended >= req.minCount };
                });
            }

            if (classRequirements.length === 0) {
              const rankModel = await prisma.rank.findFirst({
                where: { name: nextRank.name },
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
        }
      } catch { /* ignore */ }
    }

    rankInfo.push({
      styleName: enrolled.name,
      rankName: enrolled.rank,
      beltLayers,
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
              ri.documents.push({ id: doc.id, name: doc.name, url: doc.url });
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
        updateData[field] = body[field] ? new Date(body[field]) : null;
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

