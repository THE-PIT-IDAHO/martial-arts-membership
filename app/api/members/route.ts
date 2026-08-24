// app/api/members/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { getClientId } from "@/lib/tenant";
import { canAddMember } from "@/lib/trial";
import { checkEmailAvailable, normalizeEmail } from "@/lib/member-email";
import { getNextMemberNumber } from "@/lib/sequence";
import { getEffectivePriceAfterDiscountCents } from "@/lib/billing";
import { buildMemberSearchWhere, scoreMemberSearchMatch } from "@/lib/member-search";

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

    // Every filter gets appended to a single AND array so multiple
    // filters (status + styleName + search) combine cleanly without
    // stomping on each other's OR clause.
    const andClauses: any[] = [];

    if (status) {
      // Member.status is a comma-separated string ("ACTIVE,COACH").
      // Match on whole tokens (never "INACTIVE" for "ACTIVE") by
      // testing every position the token can occupy in the stored
      // string: sole value, start, end, or middle.
      const s = status.toUpperCase();
      andClauses.push({
        OR: [
          { status: { equals: s } },
          { status: { startsWith: `${s},` } },
          { status: { endsWith: `,${s}` } },
          { status: { contains: `,${s},` } },
        ],
      });
    }

    // Filter by style name (checks primaryStyle or stylesNotes JSON).
    if (styleName) {
      andClauses.push({
        OR: [
          { primaryStyle: styleName },
          { stylesNotes: { contains: styleName } },
        ],
      });
    }

    // Add search filter for name / email / phone / member number.
    // Delegates to the shared lib/member-search.ts helper so every
    // search input (POS, kiosk, global search, dashboard, etc.) uses
    // the same token-based AND matcher.
    if (search) {
      const searchClause = buildMemberSearchWhere(search);
      if (searchClause) andClauses.push(searchClause);
    }

    const whereClause: any = { clientId };
    if (andClauses.length > 0) whereClause.AND = andClauses;

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

    // When a search query is in play, re-sort by relevance so prefix
    // matches on firstName / lastName float above mid-word matches
    // (typing "nic" should land Nick + Nicole before Dominick, not
    // whichever alphabetical row Postgres picked first).
    const rankedMembers = search
      ? [...membersWithAllowedStyle].sort((a, b) => {
          const sB = scoreMemberSearchMatch(b, search);
          const sA = scoreMemberSearchMatch(a, search);
          if (sB !== sA) return sB - sA;
          const al = (a.lastName || "").toLowerCase();
          const bl = (b.lastName || "").toLowerCase();
          if (al !== bl) return al.localeCompare(bl);
          return (a.firstName || "").toLowerCase().localeCompare((b.firstName || "").toLowerCase());
        })
      : membersWithAllowedStyle;

    // Apply limit after deduplication, style filtering, and (optional) relevance sort
    const limitedMembers = limit ? rankedMembers.slice(0, parseInt(limit, 10)) : rankedMembers;

    // Bulk-fetch MEMBERSHIP + ALL scope discount rows for every member
    // in one round-trip so the per-member loop below can apply them
    // without an N+1 query. Fully-comped memberships end up excluded
    // from monthlyPaymentCents so the Recurring Payments report (and
    // any other list gated on monthlyPaymentCents > 0) drops them.
    const memberIds = limitedMembers.map((m) => m.id);
    const rawDiscountRows = memberIds.length > 0
      ? await prisma.memberDiscount.findMany({
          where: {
            memberId: { in: memberIds },
            active: true,
            appliesTo: { in: ["MEMBERSHIP", "ALL"] },
          },
          select: {
            memberId: true,
            appliesTo: true,
            percentOff: true,
            flatCents: true,
          },
        })
      : [];
    const discountsByMember = new Map<string, Array<{ appliesTo: string; percentOff: number | null; flatCents: number | null }>>();
    for (const row of rawDiscountRows) {
      const bucket = discountsByMember.get(row.memberId) ?? [];
      bucket.push({ appliesTo: row.appliesTo, percentOff: row.percentOff, flatCents: row.flatCents });
      discountsByMember.set(row.memberId, bucket);
    }

    // Outstanding balance = sum of amountCents on unpaid invoices
    // (PENDING / FAILED / PAST_DUE). One groupBy hits the DB once for
    // every member in the current page rather than N+1 queries.
    const outstandingByMember = new Map<string, number>();
    if (memberIds.length > 0) {
      const rows = await prisma.invoice.groupBy({
        by: ["memberId"],
        where: {
          memberId: { in: memberIds },
          status: { in: ["PENDING", "FAILED", "PAST_DUE"] },
        },
        _sum: { amountCents: true, creditAppliedCents: true },
      });
      for (const r of rows) {
        // Subtract creditApplied so the outstanding number reflects
        // what the member ACTUALLY still owes after account credit.
        const owed = (r._sum.amountCents || 0) - (r._sum.creditAppliedCents || 0);
        outstandingByMember.set(r.memberId, Math.max(0, owed));
      }
    }

    // Calculate monthly payment and extract membership info for each member
    const membersWithMembershipInfo = limitedMembers.map((m) => {
      let monthlyPaymentCents = 0;
      const memberDiscounts = discountsByMember.get(m.id) ?? [];
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
          // Apply the member's MEMBERSHIP + ALL scope discounts BEFORE
          // summing into monthlyPaymentCents so a 100%-discounted member
          // contributes $0 and disappears from any list gated on
          // monthlyPaymentCents > 0 (e.g. the Recurring Payments report).
          const effective = getEffectivePriceAfterDiscountCents(recurringPriceCents, memberDiscounts);
          monthlyPaymentCents += effective;
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
        outstandingBalanceCents: outstandingByMember.get(m.id) || 0,
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

    // Verify referredByMemberId (if set) belongs to this tenant so
    // the referral report doesn't grow dangling FKs pointing at
    // other gyms' members.
    let referredByMemberIdSafe: string | null = null;
    if (referredByMemberId) {
      const ref = await prisma.member.findUnique({
        where: { id: referredByMemberId },
        select: { clientId: true },
      });
      if (ref && ref.clientId === clientId) {
        referredByMemberIdSafe = referredByMemberId;
      }
    }

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
        referredByMemberId: referredByMemberIdSafe,
      },
    });

    // Send welcome email. Awaited (was previously fire-and-forget)
    // because Vercel serverless kills the function process the
    // instant the response is sent, cutting off any dangling promise
    // mid-flight -- the old .catch(() => {}) also swallowed every
    // error. Adds ~200-500ms to the response; guarantees the send
    // actually completes and surfaces errors in Vercel logs.
    try {
      await sendWelcomeEmail({
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
      });
    } catch (err) {
      console.error("[members] welcome email failed:", err);
    }

    logAudit({
      entityType: "Member",
      entityId: member.id,
      action: "CREATE",
      summary: `Created member ${member.firstName} ${member.lastName}`,
      clientId,
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
