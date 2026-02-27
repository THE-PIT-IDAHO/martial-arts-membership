// app/api/members/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit, computeChanges } from "@/lib/audit";

type Params = {
  params: Promise<{ id: string }>;
};

type RankPdf = {
  id?: string;
  name: string;
  url: string;
};

type BeltRank = {
  name: string;
  order: number;
  pdfDocuments?: RankPdf[];
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  fromRank?: string;
};

type MemberStyle = {
  name: string;
  rank?: string;
  beltSize?: string;
  uniformSize?: string;
  startDate?: string;
  lastPromotionDate?: string;
  attendanceResetDate?: string;
  active?: boolean;
};

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Helper function to get PDF names for ranks ABOVE a target rank (for removal during downgrade)
function getPdfNamesAboveRank(
  beltConfig: string | null,
  targetRankName: string
): string[] {
  if (!beltConfig) return [];

  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (!config.ranks || !Array.isArray(config.ranks)) return [];

    // Find the target rank
    const targetRank = config.ranks.find((r: BeltRank) => r.name === targetRankName);
    if (!targetRank) return [];

    // Get ranks ABOVE the target rank (higher order number)
    const ranksAbove = config.ranks.filter((r: BeltRank) => r.order > targetRank.order);

    const pdfNames: string[] = [];
    for (const rank of ranksAbove) {
      if (rank.pdfDocuments && Array.isArray(rank.pdfDocuments)) {
        for (const pdf of rank.pdfDocuments) {
          if (pdf.name) pdfNames.push(pdf.name);
        }
      }
    }
    return pdfNames;
  } catch {
    return [];
  }
}

// Helper function to get the order number of a rank
function getRankOrder(beltConfig: string | null, rankName: string): number | null {
  if (!beltConfig || !rankName) return null;

  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (!config.ranks || !Array.isArray(config.ranks)) return null;

    const rank = config.ranks.find((r: BeltRank) => r.name === rankName);
    return rank ? rank.order : null;
  } catch {
    return null;
  }
}

// Helper function to add rank PDFs to member's styleDocuments
function addRankPdfsToDocuments(
  beltConfig: string | null,
  targetRankName: string,
  currentDocs: StyleDocument[]
): { docs: StyleDocument[]; hasChanges: boolean } {
  if (!beltConfig) return { docs: currentDocs, hasChanges: false };

  try {
    const config = typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
    if (!config.ranks || !Array.isArray(config.ranks)) {
      return { docs: currentDocs, hasChanges: false };
    }

    // Find the target rank
    const targetRank = config.ranks.find((r: BeltRank) => r.name === targetRankName);
    if (!targetRank) return { docs: currentDocs, hasChanges: false };

    // Get all ranks up to and including the target rank (by order number)
    const ranksToInclude = config.ranks.filter((r: BeltRank) => r.order <= targetRank.order);

    let hasChanges = false;
    const updatedDocs = [...currentDocs];

    // Add PDFs from all these ranks
    for (const rank of ranksToInclude) {
      if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

      for (const rankPdf of rank.pdfDocuments) {
        // Check if this PDF already exists (by name)
        const exists = updatedDocs.some((doc) => doc.name === rankPdf.name);
        if (!exists) {
          const docId = rankPdf.id || rankPdf.name.replace(/\s+/g, '-');
          const newDoc: StyleDocument = {
            id: `rank-${rank.name}-${docId}`,
            name: rankPdf.name,
            url: rankPdf.url,
            uploadedAt: new Date().toISOString(),
            fromRank: rank.name,
          };
          updatedDocs.push(newDoc);
          hasChanges = true;
        }
      }
    }

    return { docs: updatedDocs, hasChanges };
  } catch {
    return { docs: currentDocs, hasChanges: false };
  }
}

// GET /api/members/:id
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        attendances: {
          where: {
            confirmed: true, // Only include confirmed attendance for requirement counting
          },
          select: {
            id: true,
            checkedInAt: true,
            attendanceDate: true,
            source: true,
            classSession: {
              select: {
                id: true,
                name: true,
                classType: true,
                classTypes: true,
                styleName: true,
                styleNames: true,
                program: true,
              },
            },
          },
        },
        memberships: {
          include: {
            membershipPlan: {
              select: {
                id: true,
                name: true,
                membershipId: true,
                priceCents: true,
                billingCycle: true,
                allowedStyles: true,
                color: true,
                cancellationFeeCents: true,
                cancellationNoticeDays: true,
                contractLengthMonths: true,
              },
            },
          },
          orderBy: { startDate: "desc" },
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Fetch test results for this member
    const testResults = await prisma.testingParticipant.findMany({
      where: { memberId: id },
      select: {
        id: true,
        testingForRank: true,
        currentRank: true,
        status: true,
        score: true,
        resultPdfUrl: true,
        createdAt: true,
        updatedAt: true,
        testingEvent: {
          select: {
            id: true,
            name: true,
            date: true,
            styleName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch POS transactions for this member (last 20)
    const transactions = await prisma.pOSTransaction.findMany({
      where: { memberId: id, status: "COMPLETED" },
      select: {
        id: true,
        transactionNumber: true,
        totalCents: true,
        paymentMethod: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Fetch invoices for this member
    const invoices = await prisma.invoice.findMany({
      where: { memberId: id },
      select: {
        id: true,
        invoiceNumber: true,
        amountCents: true,
        status: true,
        dueDate: true,
        paidAt: true,
        billingPeriodStart: true,
        billingPeriodEnd: true,
        paymentMethod: true,
        membershipId: true,
        membership: {
          select: {
            membershipPlan: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: "desc" },
      take: 50,
    });

    return NextResponse.json({ member, testResults, transactions, invoices });
  } catch (err) {
    console.error(`GET /api/members/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to load member profile" },
      { status: 500 }
    );
  }
}

// PATCH /api/members/:id
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));

    const {
      firstName,
      lastName,
      email,
      phone,
      status,

      dateOfBirth,
      address,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      parentGuardianName,
      minorCommsMode,
      notes,

      medicalNotes,
      waiverSigned,
      waiverSignedAt,

      primaryStyle,
      stylesNotes,
      rank,
      startDate,
      uniformSize,
      styleDocuments,

      membershipType,

      photoUrl,
      paymentNotes,
      accessRole,
      emailOptIn,
      leadSource,
      referredByMemberId,
    } = body || {};

    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (status !== undefined) updateData.status = status;

    if (dateOfBirth !== undefined)
      updateData.dateOfBirth = toDateOrNull(dateOfBirth);
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (emergencyContactName !== undefined)
      updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined)
      updateData.emergencyContactPhone = emergencyContactPhone;
    if (parentGuardianName !== undefined)
      updateData.parentGuardianName = parentGuardianName;
    if (minorCommsMode !== undefined)
      updateData.minorCommsMode = minorCommsMode;
    if (notes !== undefined) updateData.notes = notes;

    if (medicalNotes !== undefined) updateData.medicalNotes = medicalNotes;
    if (waiverSigned !== undefined) updateData.waiverSigned = !!waiverSigned;
    if (waiverSignedAt !== undefined)
      updateData.waiverSignedAt = toDateOrNull(waiverSignedAt);
    if (emailOptIn !== undefined) updateData.emailOptIn = !!emailOptIn;

    if (primaryStyle !== undefined) updateData.primaryStyle = primaryStyle;
    if (rank !== undefined) updateData.rank = rank;
    if (startDate !== undefined)
      updateData.startDate = toDateOrNull(startDate);
    if (uniformSize !== undefined) updateData.uniformSize = uniformSize;

    if (membershipType !== undefined)
      updateData.membershipType = membershipType;

    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
    if (paymentNotes !== undefined) updateData.paymentNotes = paymentNotes;
    if (accessRole !== undefined) updateData.accessRole = accessRole;
    if (leadSource !== undefined) updateData.leadSource = leadSource || null;
    if (referredByMemberId !== undefined) updateData.referredByMemberId = referredByMemberId || null;

    // Handle stylesNotes updates - check for rank changes and add PDFs
    if (stylesNotes !== undefined) {
      updateData.stylesNotes = stylesNotes;

      // Fetch current member data to compare styles
      const currentMember = await prisma.member.findUnique({
        where: { id },
        select: { stylesNotes: true, styleDocuments: true },
      });

      // Parse old and new styles
      const oldStyles: MemberStyle[] = currentMember?.stylesNotes
        ? JSON.parse(currentMember.stylesNotes)
        : [];
      const newStyles: MemberStyle[] = stylesNotes ? JSON.parse(stylesNotes) : [];

      // Build a map of old style ranks
      const oldStyleRanks = new Map<string, string | undefined>();
      for (const style of oldStyles) {
        oldStyleRanks.set(style.name.toLowerCase(), style.rank);
      }

      // Fetch all styles to get beltConfig (needed for rank order comparison)
      const allStyles = await prisma.style.findMany({
        select: { name: true, beltConfig: true },
      });

      // Find styles with rank changes and determine if upgrade or downgrade
      const stylesWithUpgrades: Array<{ styleName: string; newRank: string }> = [];
      const stylesWithDowngrades: Array<{ styleName: string; newRank: string; oldRank: string }> = [];

      for (const style of newStyles) {
        if (style.rank) {
          const oldRank = oldStyleRanks.get(style.name.toLowerCase());
          if (oldRank !== style.rank) {
            // Find the style's beltConfig to compare rank orders
            const styleData = allStyles.find(s => s.name.toLowerCase() === style.name.toLowerCase());
            if (styleData?.beltConfig) {
              const oldOrder = oldRank ? getRankOrder(styleData.beltConfig, oldRank) : null;
              const newOrder = getRankOrder(styleData.beltConfig, style.rank);

              if (newOrder !== null) {
                if (oldOrder === null || newOrder > oldOrder) {
                  // Upgrade: new style or higher rank - add PDFs
                  stylesWithUpgrades.push({ styleName: style.name, newRank: style.rank });
                } else if (newOrder < oldOrder) {
                  // Downgrade: lower rank - remove PDFs for ranks above new rank
                  stylesWithDowngrades.push({ styleName: style.name, newRank: style.rank, oldRank: oldRank! });
                }
              }
            } else {
              // No beltConfig, but rank changed - treat as upgrade to add any available PDFs
              stylesWithUpgrades.push({ styleName: style.name, newRank: style.rank });
            }
          }
        }
      }

      // If there are rank changes, update the PDFs appropriately
      if (stylesWithUpgrades.length > 0 || stylesWithDowngrades.length > 0) {
        // Parse current style documents (use provided styleDocuments or existing)
        let currentDocs: StyleDocument[] = [];
        const docsSource = styleDocuments !== undefined ? styleDocuments : currentMember?.styleDocuments;
        if (docsSource) {
          try {
            currentDocs = JSON.parse(docsSource);
          } catch {
            currentDocs = [];
          }
        }

        let updatedDocs = [...currentDocs];
        let docsChanged = false;

        // Handle upgrades - add PDFs for new ranks
        for (const { styleName, newRank } of stylesWithUpgrades) {
          const styleData = allStyles.find(s => s.name.toLowerCase() === styleName.toLowerCase());
          if (styleData?.beltConfig) {
            const result = addRankPdfsToDocuments(styleData.beltConfig, newRank, updatedDocs);
            if (result.hasChanges) {
              updatedDocs = result.docs;
              docsChanged = true;
            }
          }
        }

        // Handle downgrades - remove PDFs for ranks above the new rank
        for (const { styleName, newRank } of stylesWithDowngrades) {
          const styleData = allStyles.find(s => s.name.toLowerCase() === styleName.toLowerCase());
          if (styleData?.beltConfig) {
            const pdfNamesToRemove = getPdfNamesAboveRank(styleData.beltConfig, newRank);
            if (pdfNamesToRemove.length > 0) {
              const beforeCount = updatedDocs.length;
              updatedDocs = updatedDocs.filter(doc => !pdfNamesToRemove.includes(doc.name));
              if (updatedDocs.length < beforeCount) {
                docsChanged = true;
              }
            }
          }
        }

        // Update styleDocuments if PDFs were changed
        if (docsChanged) {
          updateData.styleDocuments = JSON.stringify(updatedDocs);
        } else if (styleDocuments !== undefined) {
          // Use provided styleDocuments if no automatic changes
          updateData.styleDocuments = styleDocuments;
        }

        // On rank upgrade (promotion), delete all imported/bulk attendance records for this member
        if (stylesWithUpgrades.length > 0) {
          await prisma.attendance.deleteMany({
            where: {
              memberId: id,
              source: "IMPORTED",
            },
          });
        }
      } else if (styleDocuments !== undefined) {
        // No rank changes, but styleDocuments was explicitly provided
        updateData.styleDocuments = styleDocuments;
      }
    } else if (styleDocuments !== undefined) {
      // stylesNotes not being updated, but styleDocuments is
      updateData.styleDocuments = styleDocuments;
    }

    const member = await prisma.member.update({
      where: { id },
      data: updateData,
      include: {
        attendances: {
          where: { confirmed: true },
          select: {
            id: true,
            checkedInAt: true,
            attendanceDate: true,
            source: true,
            classSession: {
              select: {
                id: true,
                name: true,
                classType: true,
                classTypes: true,
                styleName: true,
                styleNames: true,
                program: true,
              },
            },
          },
        },
        memberships: {
          include: {
            membershipPlan: {
              select: {
                id: true,
                name: true,
                membershipId: true,
                priceCents: true,
                billingCycle: true,
                allowedStyles: true,
                color: true,
              },
            },
          },
          orderBy: { startDate: "desc" },
        },
      },
    });

    logAudit({
      entityType: "Member",
      entityId: id,
      action: "UPDATE",
      summary: `Updated member ${member.firstName} ${member.lastName}`,
    }).catch(() => {});

    return NextResponse.json({ member });
  } catch (err) {
    console.error(`PATCH /api/members/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

// DELETE /api/members/:id
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    // Delete related records first (due to foreign key constraints)
    // Delete relationships where this member is involved
    await prisma.memberRelationship.deleteMany({
      where: {
        OR: [{ fromMemberId: id }, { toMemberId: id }],
      },
    });

    // Delete attendances
    await prisma.attendance.deleteMany({
      where: { memberId: id },
    });

    // Delete memberships
    await prisma.membership.deleteMany({
      where: { memberId: id },
    });

    // Fetch member name before deleting
    const memberToDelete = await prisma.member.findUnique({
      where: { id },
      select: { firstName: true, lastName: true },
    });

    // Now delete the member
    await prisma.member.delete({
      where: { id },
    });

    logAudit({
      entityType: "Member",
      entityId: id,
      action: "DELETE",
      summary: `Deleted member ${memberToDelete?.firstName || ""} ${memberToDelete?.lastName || ""}`.trim(),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`DELETE /api/members/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to delete member" },
      { status: 500 }
    );
  }
}
