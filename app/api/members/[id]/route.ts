// app/api/members/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit, computeChanges } from "@/lib/audit";
import { getClientId } from "@/lib/tenant";
import { checkEmailAvailable, normalizeEmail } from "@/lib/member-email";

type Params = {
  params: Promise<{ id: string }>;
};

import {
  getPdfNamesAboveRank,
  getRankOrder,
  addRankPdfsToDocuments,
  type StyleDocument,
} from "@/lib/belt-config";

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

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string | number | Date);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// GET /api/members/:id
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const clientId = await getClientId(_req);
    const member = await prisma.member.findUnique({
      where: { id, clientId },
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
                autoRenew: true,
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

    // Fetch email log for this member (most recent 50)
    const emails = await prisma.emailLog.findMany({
      where: { memberId: id },
      select: {
        id: true,
        eventType: true,
        subject: true,
        recipients: true,
        success: true,
        errorText: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ member, testResults, transactions, invoices, emails });
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
    const clientId = await getClientId(req);

    // Verify member belongs to this tenant
    const existing = await prisma.member.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

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
      emergencyContactRelationship,
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
      promotionFeeOverrideCents,
    } = body || {};

    const updateData: any = {};

    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) {
      // Normalize + enforce one-email-per-tenant. Family members are
      // exempt (a kid updating to a sibling's own email would still be
      // blocked unless that link exists).
      const normalizedEmail = normalizeEmail(email);
      const emailCheck = await checkEmailAvailable({
        email: normalizedEmail,
        clientId,
        excludeMemberId: id,
      });
      if (!emailCheck.ok) {
        return NextResponse.json({ error: emailCheck.reason }, { status: 409 });
      }
      updateData.email = normalizedEmail;
    }
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
    if (emergencyContactRelationship !== undefined)
      updateData.emergencyContactRelationship = emergencyContactRelationship || null;
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
    if (promotionFeeOverrideCents !== undefined) {
      updateData.promotionFeeOverrideCents =
        promotionFeeOverrideCents === null || promotionFeeOverrideCents === ""
          ? null
          : Number(promotionFeeOverrideCents);
    }

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

      // Rank PDFs are now displayed directly on member profiles from Rank.pdfDocument
      // No need to sync PDFs into styleDocuments
      if (styleDocuments !== undefined) {
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
      clientId,
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
    const clientId = await getClientId(_req);

    // Verify member belongs to this tenant
    const existingMember = await prisma.member.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existingMember || existingMember.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

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
      clientId,
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
