// app/api/members/route.ts

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { getClientId } from "@/lib/tenant";
import { canAddMember } from "@/lib/trial";
import { checkEmailAvailable, normalizeEmail } from "@/lib/member-email";
import { getNextMemberNumber } from "@/lib/sequence";

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// GET /api/members
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const limit = searchParams.get("limit");
    const styleName = searchParams.get("styleName");
    const styleId = searchParams.get("styleId"); // Filter by membership that allows this style

    const whereClause: any = { clientId };
    if (status) {
      // Member.status is a comma-separated string (e.g. "ACTIVE,COACH"), so
      // we use contains-based matching. Special-case ACTIVE to exclude
      // "INACTIVE" substring matches.
      if (status === "ACTIVE") {
        whereClause.status = { contains: "ACTIVE" };
        whereClause.NOT = { status: { contains: "INACTIVE" } };
      } else {
        whereClause.status = { contains: status };
      }
    }

    // Filter by style name (checks primaryStyle or stylesNotes JSON)
    if (styleName) {
      whereClause.OR = [
        { primaryStyle: styleName },
        { stylesNotes: { contains: styleName } },
      ];
    }

    // Add search filter for name or member number
    if (search && search.length >= 2) {
      const parts = search.trim().split(/\s+/);
      const searchConditions: Prisma.MemberWhereInput[] = [];

      if (parts.length >= 2) {
        // "John Smith" → match firstName contains "John" AND lastName contains "Smith"
        searchConditions.push(
          { AND: [
            { firstName: { contains: parts[0], mode: "insensitive" } },
            { lastName: { contains: parts.slice(1).join(" "), mode: "insensitive" } },
          ]},
          // Also try single-field matches
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        );
      } else {
        searchConditions.push(
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        );
      }
      // Also search by member number if the search is numeric
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) {
        searchConditions.push({ memberNumber: searchNum });
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
      // Explicit select — the default include returns every column on Member,
      // which includes styleDocuments (legacy field with base64-encoded PDFs,
      // ~3-4 MB per member). On a 15-member gym that's a 60+ MB list payload
      // and one of the main reasons Members / Memberships / Reports etc. were
      // each taking 10+ seconds to load. List endpoints never display these
      // fields, so we omit them entirely.
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        photoUrl: true,
        primaryStyle: true,
        // stylesNotes is small (a few KB at most) and the list uses it for
        // per-style rank/filter display.
        stylesNotes: true,
        status: true,
        dateOfBirth: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        parentGuardianName: true,
        minorCommsMode: true,
        startDate: true,
        rank: true,
        uniformSize: true,
        waiverSigned: true,
        waiverSignedAt: true,
        emailOptIn: true,
        membershipType: true,
        clientId: true,
        createdAt: true,
        updatedAt: true,
        memberNumber: true,
        accountCreditCents: true,
        accessRole: true,
        stripeCustomerId: true,
        defaultPaymentMethodId: true,
        paypalPayerId: true,
        squareCustomerId: true,
        leadSource: true,
        referredByMemberId: true,
        // EXCLUDED from list (heavy or sensitive — fetch on the profile page):
        //   - styleDocuments  (multi-MB base64 PDFs)
        //   - medicalNotes    (sensitive)
        //   - notes           (free-form, can grow)
        //   - paymentNotes    (sensitive)
        //   - portalPasswordHash
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
                billingCycle: true,
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

    // Filter by membership that allows the style (if styleId provided).
    //
    // Strict semantic: a plan with no allowedStyles set (null / empty)
    // does NOT match any specific styleId filter. The previous "null
    // means all styles" behavior caused members on no-style plans (e.g.
    // a flat-rate "Open Mat" membership) to incorrectly appear under
    // every style's "Add all from style" picker.
    const membersWithAllowedStyle = styleId
      ? uniqueMembers.filter((member) => {
          return member.memberships.some((membership) => {
            const allowedStyles = membership.membershipPlan.allowedStyles;
            if (!allowedStyles) return false;
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
      let nextPaymentDate: Date | null = null;
      let lastPaymentDate: Date | null = null;

      // Sort memberships so ACTIVE ones come first (prioritize active over canceled)
      const sortedMemberships = [...m.memberships].sort((a, b) => {
        if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
        if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
        return 0;
      });

      // Get info from memberships (prioritizing active, but using canceled as fallback)
      const now = new Date();
      for (const membership of sortedMemberships) {
        // Count toward monthly payments when more revenue is expected from
        // this membership. Includes two cases:
        //   (a) Auto-renewing plans (charges continue indefinitely)
        //   (b) Contract plans that haven't reached the end of their term yet
        //       (more contracted payments are still due even if autoRenew=false)
        // Excludes canceled, expired, and one-shot (no autoRenew, no contract).
        const isActive = membership.status === "ACTIVE";
        const notExpired = !membership.endDate || new Date(membership.endDate) > now;
        const willRenew = membership.membershipPlan.autoRenew === true;
        const stillInContract = !!membership.contractEndDate
          && new Date(membership.contractEndDate) > now;
        if (isActive && notExpired && (willRenew || stillInContract)) {
          // customPriceCents IS the recurring price (set by the POS Price
          // input). Plan price is the fallback when the admin didn't
          // override it for this signup.
          const recurringPriceCents = membership.customPriceCents
            ?? membership.membershipPlan.priceCents
            ?? 0;
          monthlyPaymentCents += recurringPriceCents;
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

        // Earliest upcoming payment across all the member's memberships
        if (membership.nextPaymentDate) {
          const d = new Date(membership.nextPaymentDate);
          if (!nextPaymentDate || d < nextPaymentDate) nextPaymentDate = d;
        }

        // Most recent payment received
        if (membership.lastPaymentDate) {
          const d = new Date(membership.lastPaymentDate);
          if (!lastPaymentDate || d > lastPaymentDate) lastPaymentDate = d;
        }
      }

      return {
        ...m,
        monthlyPaymentCents,
        membershipTypeName,
        membershipPlanName,
        autoRenew,
        membershipEndDate,
        nextPaymentDate,
        lastPaymentDate,
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

    } = body || {};

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    // Resolve tenant clientId from request header
    const clientId = await getClientId(req);

    // Enforce one-email-per-member at the tenant scope. Family members
    // get an exception (handled by the helper) so the add-child flow can
    // share a parent's email with their kids' profiles.
    const normalizedEmail = normalizeEmail(email);
    const emailCheck = await checkEmailAvailable({ email: normalizedEmail, clientId });
    if (!emailCheck.ok) {
      return NextResponse.json({ error: emailCheck.reason }, { status: 409 });
    }

    // Check trial limits
    const memberCheck = await canAddMember(clientId);
    if (!memberCheck.allowed) {
      return NextResponse.json({ error: memberCheck.reason }, { status: 403 });
    }

    const memberNumber = await getNextMemberNumber(clientId);

    const member = await prisma.member.create({
      data: {
        firstName,
        lastName,
        email: normalizedEmail,
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
