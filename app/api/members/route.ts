// app/api/members/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

const MIN_MEMBER_NUMBER = 10000000;

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// find lowest free memberNumber >= MIN_MEMBER_NUMBER
async function getNextMemberNumber() {
  const existing = await prisma.member.findMany({
    where: {
      memberNumber: {
        gte: MIN_MEMBER_NUMBER,
      },
    },
    select: { memberNumber: true },
    orderBy: { memberNumber: "asc" },
  });

  let candidate = MIN_MEMBER_NUMBER;
  for (const row of existing) {
    if (row.memberNumber == null) continue;
    if (row.memberNumber === candidate) {
      candidate++;
    } else if (row.memberNumber > candidate) {
      break;
    }
  }
  return candidate;
}

// GET /api/members
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = searchParams.get("limit");
    const styleName = searchParams.get("styleName");
    const styleId = searchParams.get("styleId"); // Filter by membership that allows this style

    const whereClause: any = {};
    if (status) {
      whereClause.status = status;
    }

    // Filter by style name (checks primaryStyle or stylesNotes JSON)
    if (styleName) {
      whereClause.OR = [
        { primaryStyle: styleName },
        { stylesNotes: { contains: styleName } },
      ];
    }

    // Add search filter for name or member number
    // Note: SQLite doesn't support mode: "insensitive", so we search both lower and original case
    if (search && search.length >= 2) {
      const searchLower = search.toLowerCase();
      const searchUpper = search.toUpperCase();
      const searchCapitalized = search.charAt(0).toUpperCase() + search.slice(1).toLowerCase();

      const searchConditions = [
        { firstName: { contains: search } },
        { firstName: { contains: searchLower } },
        { firstName: { contains: searchCapitalized } },
        { lastName: { contains: search } },
        { lastName: { contains: searchLower } },
        { lastName: { contains: searchCapitalized } },
        { email: { contains: search } },
        { email: { contains: searchLower } },
      ];
      // Also search by member number if the search is numeric
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) {
        searchConditions.push({ memberNumber: searchNum } as any);
      }

      // If we already have style filter, use AND to combine
      if (styleName) {
        whereClause.AND = [
          { OR: whereClause.OR },
          { OR: searchConditions },
        ];
        delete whereClause.OR;
      } else {
        whereClause.OR = searchConditions;
      }
    }

    const members = await prisma.member.findMany({
      where: whereClause,
      orderBy: [
        { lastName: "asc" },
        { firstName: "asc" },
      ],
      // Take more than needed to account for potential duplicates from OR clause, then slice
      ...(limit ? { take: parseInt(limit, 10) * 3 } : {}),
      include: {
        memberships: {
          where: {
            // Include both ACTIVE and CANCELED memberships so we can show membership info
            // for members with canceled (but not expired) memberships in reports
            status: { in: ["ACTIVE", "CANCELED", "CANCELLED"] },
          },
          include: {
            membershipPlan: {
              select: {
                id: true,
                name: true,
                priceCents: true,
                autoRenew: true,
                allowedStyles: true,
                membershipType: true,
              },
            },
          },
        },
        trialPasses: {
          where: { status: "ACTIVE" },
          select: { id: true, status: true, classesUsed: true, maxClasses: true, expiresAt: true },
        },
      },
    });

    // Deduplicate members by ID (in case OR conditions matched same member multiple times)
    const uniqueMembers = members.filter((member, index, self) =>
      index === self.findIndex((m) => m.id === member.id)
    );

    // Filter by membership that allows the style (if styleId provided)
    const membersWithAllowedStyle = styleId
      ? uniqueMembers.filter((member) => {
          // Member must have at least one active membership that allows this style
          return member.memberships.some((membership) => {
            const allowedStyles = membership.membershipPlan.allowedStyles;
            // null means all styles are allowed
            if (!allowedStyles) return true;
            // Check if styleId is in the allowed styles array
            try {
              const stylesArray = JSON.parse(allowedStyles);
              return Array.isArray(stylesArray) && stylesArray.includes(styleId);
            } catch {
              return false;
            }
          });
        })
      : uniqueMembers;

    // Apply limit after deduplication and style filtering
    const limitedMembers = limit ? membersWithAllowedStyle.slice(0, parseInt(limit, 10)) : membersWithAllowedStyle;

    // Calculate monthly payment and extract membership info for each member
    const membersWithMembershipInfo = limitedMembers.map((m) => {
      let monthlyPaymentCents = 0;
      let membershipTypeName: string | null = null;
      let membershipPlanName: string | null = null;
      let autoRenew: boolean | null = null;
      let membershipEndDate: Date | null = null;

      // Sort memberships so ACTIVE ones come first (prioritize active over canceled)
      const sortedMemberships = [...m.memberships].sort((a, b) => {
        if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
        if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
        return 0;
      });

      // Get info from memberships (prioritizing active, but using canceled as fallback)
      for (const membership of sortedMemberships) {
        // Only count active memberships for payment calculation
        if (membership.status === "ACTIVE") {
          const priceCents = membership.customPriceCents ?? membership.membershipPlan.priceCents ?? 0;
          monthlyPaymentCents += priceCents;
        }

        // Use first membership (active preferred) for type/plan/autoRenew info
        if (!membershipPlanName) {
          membershipPlanName = membership.membershipPlan.name;
          membershipTypeName = membership.membershipPlan.membershipType?.name || null;
          autoRenew = membership.membershipPlan.autoRenew;
        }

        // Track the earliest end date (soonest expiration)
        if (membership.endDate) {
          if (!membershipEndDate || new Date(membership.endDate) < membershipEndDate) {
            membershipEndDate = new Date(membership.endDate);
          }
        }
      }

      return {
        ...m,
        monthlyPaymentCents,
        membershipTypeName,
        membershipPlanName,
        autoRenew,
        membershipEndDate,
      };
    });

    return NextResponse.json({ members: membersWithMembershipInfo });
  } catch (err) {
    console.error("GET /api/members error:", err);
    return NextResponse.json(
      { error: "Failed to load members" },
      { status: 500 }
    );
  }
}

// POST /api/members
export async function POST(req: Request) {
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
      notes,
      medicalNotes,
      waiverSigned,
      waiverSignedAt,
      emailOptIn,
      leadSource,
      referredByMemberId,

      clientId: incomingClientId,
    } = body || {};

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    // pick a client
    let clientId = incomingClientId as string | undefined;
    if (!clientId) {
      const existingClient = await prisma.client.findFirst();
      if (!existingClient) {
        return NextResponse.json(
          { error: "No client found. Please create a Client first." },
          { status: 400 }
        );
      }
      clientId = existingClient.id;
    }

    const memberNumber = await getNextMemberNumber();

    const member = await prisma.member.create({
      data: {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        clientId,
        status: status || "PROSPECT",
        memberNumber,

        dateOfBirth: toDateOrNull(dateOfBirth),
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        parentGuardianName: parentGuardianName || null,
        notes: notes || null,
        medicalNotes: medicalNotes || null,
        waiverSigned: waiverSigned === true,
        waiverSignedAt: toDateOrNull(waiverSignedAt),
        emailOptIn: emailOptIn !== false,
        leadSource: leadSource || null,
        referredByMemberId: referredByMemberId || null,
      },
    });

    // Send welcome email (fire and forget)
    sendWelcomeEmail({
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
    }).catch(() => {});

    logAudit({
      entityType: "Member",
      entityId: member.id,
      action: "CREATE",
      summary: `Created member ${member.firstName} ${member.lastName}`,
    }).catch(() => {});

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("POST /api/members error:", err);
    return NextResponse.json(
      { error: "Failed to create member" },
      { status: 500 }
    );
  }
}
