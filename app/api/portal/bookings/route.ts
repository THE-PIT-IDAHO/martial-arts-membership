import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmationEmail } from "@/lib/notifications";
import { memberCanAttendClass } from "@/lib/class-eligibility";
import { getGymTimezone, occurrenceForDate, localMidnightUtc, formatDateInTimezone } from "@/lib/dates";
import { classRunsOnDate } from "@/lib/class-occurrence";
import { deductClassCreditForMember } from "@/lib/class-credits";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookings = await prisma.classBooking.findMany({
    where: {
      memberId: auth.memberId,
      status: { in: ["CONFIRMED", "WAITLISTED"] },
      bookingDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
    include: {
      classSession: {
        select: {
          name: true,
          startsAt: true,
          endsAt: true,
          coachName: true,
          styleName: true,
          // Schedule fields needed by classRunsOnDate to filter ghosts
          // -- bookings whose ClassSession no longer runs on the
          // bookingDate (e.g. schedule moved after booking created).
          isRecurring: true,
          excludedDates: true,
          scheduleStartDate: true,
          scheduleEndDate: true,
          isOngoing: true,
          frequencyNumber: true,
          frequencyUnit: true,
          classType: true,
          clientId: true,
        },
      },
    },
    orderBy: { bookingDate: "asc" },
  });

  // Cache one tz lookup per client to avoid re-hitting the DB per row.
  const tzByClient = new Map<string, string>();
  const getTz = async (clientId: string) => {
    let tz = tzByClient.get(clientId);
    if (!tz) {
      tz = await getGymTimezone(clientId);
      tzByClient.set(clientId, tz);
    }
    return tz;
  };

  const kept: typeof bookings = [];
  for (const b of bookings) {
    const cls = b.classSession;
    if (!cls) continue;
    const tz = await getTz(cls.clientId);
    const localYmd = formatDateInTimezone(b.bookingDate, tz);
    if (classRunsOnDate(cls, localYmd, tz)) kept.push(b);
  }

  return NextResponse.json(kept);
}

export async function POST(req: NextRequest) {
  try {
    return await handleBookingPost(req);
  } catch (err) {
    console.error("[portal/bookings] POST failed:", err);
    const message = err instanceof Error ? err.message : "Booking failed";
    return NextResponse.json({ error: `Booking failed: ${message}` }, { status: 500 });
  }
}

async function handleBookingPost(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { classSessionId, bookingDate, forMemberId } = await req.json();

  // If booking for a child, verify parent relationship. Check against the
  // real signed-in member (sessionMemberId) — relationship strings can be
  // "PARENT"/"Parent of"/"GUARDIAN"/"Guardian of" historically, so accept
  // any outgoing link.
  let bookingMemberId = auth.memberId;
  if (forMemberId && forMemberId !== auth.memberId && forMemberId !== auth.sessionMemberId) {
    const relationship = await prisma.memberRelationship.findFirst({
      where: {
        fromMemberId: auth.sessionMemberId,
        toMemberId: forMemberId,
      },
    });
    if (!relationship) {
      return NextResponse.json({ error: "Not authorized to book for this member" }, { status: 403 });
    }
    bookingMemberId = forMemberId;
  } else if (forMemberId === auth.sessionMemberId) {
    bookingMemberId = auth.sessionMemberId;
  }

  if (!classSessionId || !bookingDate) {
    return NextResponse.json({ error: "classSessionId and bookingDate required" }, { status: 400 });
  }

  // Verify the booking member and the class belong to the same tenant.
  // Without this, an authenticated portal user could pass any classSessionId
  // — including one from a completely different gym — and the endpoint
  // would happily create a booking + attendance row against the foreign
  // class. (How we got Patrick-Star-at-other-gym onto a Pit class roster.)
  const bookingMember = await prisma.member.findUnique({
    where: { id: bookingMemberId },
    select: { clientId: true },
  });

  if (!bookingMember) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Store the booking's date as the UTC timestamp of the gym's local midnight
  // for that date -- using THIS member's tenant timezone.
  const bookingTz = await getGymTimezone(bookingMember.clientId);
  const parsedDate = new Date(localMidnightUtc(bookingDate, bookingTz));

  // Get class info
  const cls = await prisma.classSession.findUnique({
    where: { id: classSessionId },
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      maxCapacity: true,
      bookingEnabled: true,
      bookingCutoffMins: true,
      bookingAdvanceDays: true,
      // mobileConfirm: when true, portal / mobile bookings create
      // an already-confirmed attendance row (member self-checks-in
      // by booking). When false (default), portal bookings land as
      // unconfirmed and wait for admin confirm.
      mobileConfirm: true,
      clientId: true,
    },
  });

  if (!cls || cls.clientId !== bookingMember.clientId) {
    // 404 (not 403) so the response shape can't be used to enumerate
    // class IDs across tenants.
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  // Enforce class style eligibility
  const eligibility = await memberCanAttendClass(bookingMemberId, classSessionId);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }

  // Check advance booking limit (how far out someone can book)
  if (cls.bookingAdvanceDays) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + cls.bookingAdvanceDays);
    if (parsedDate > maxDate) {
      return NextResponse.json(
        { error: `Booking is only available up to ${cls.bookingAdvanceDays} day${cls.bookingAdvanceDays === 1 ? "" : "s"} in advance` },
        { status: 400 }
      );
    }
  }

  // Check booking cutoff (how close to class start they can book).
  // Use the gym's IANA timezone to compute the exact UTC start of the
  // occurrence on bookingDate — otherwise evening classes whose UTC
  // datetime crosses midnight get a cutoff that's a day off.
  if (cls.bookingCutoffMins) {
    const occurrence = occurrenceForDate(new Date(cls.startsAt), bookingDate, bookingTz);
    const cutoff = new Date(occurrence.getTime() - cls.bookingCutoffMins * 60 * 1000);
    if (new Date() > cutoff) {
      return NextResponse.json({ error: "Booking cutoff has passed" }, { status: 400 });
    }
  }

  // Check if already booked
  const existing = await prisma.classBooking.findUnique({
    where: {
      memberId_classSessionId_bookingDate: {
        memberId: bookingMemberId,
        classSessionId,
        bookingDate: parsedDate,
      },
    },
  });

  if (existing && existing.status !== "CANCELLED") {
    return NextResponse.json({ error: "Already booked" }, { status: 400 });
  }

  // Get member info for email
  const member = await prisma.member.findUnique({
    where: { id: bookingMemberId },
    select: { firstName: true, lastName: true },
  });

  // Use transaction for capacity check + booking
  const result = await prisma.$transaction(async (tx) => {
    const confirmedCount = await tx.classBooking.count({
      where: {
        classSessionId,
        bookingDate: parsedDate,
        status: "CONFIRMED",
      },
    });

    const isFull = cls.maxCapacity ? confirmedCount >= cls.maxCapacity : false;
    const status = isFull ? "WAITLISTED" : "CONFIRMED";

    let waitlistPosition: number | null = null;
    if (isFull) {
      const lastWaitlisted = await tx.classBooking.findFirst({
        where: {
          classSessionId,
          bookingDate: parsedDate,
          status: "WAITLISTED",
        },
        orderBy: { waitlistPosition: "desc" },
      });
      waitlistPosition = (lastWaitlisted?.waitlistPosition || 0) + 1;
    }

    if (existing) {
      // Re-activate cancelled booking
      return tx.classBooking.update({
        where: { id: existing.id },
        data: { status, waitlistPosition },
      });
    }

    return tx.classBooking.create({
      data: {
        memberId: bookingMemberId,
        classSessionId,
        bookingDate: parsedDate,
        status,
        waitlistPosition,
      },
    });
  });

  // Also create/restore an Attendance record so member shows on admin class list
  if (result.status === "CONFIRMED") {
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        memberId_classSessionId_attendanceDate: {
          memberId: bookingMemberId,
          classSessionId,
          attendanceDate: parsedDate,
        },
      },
    });
    if (!existingAttendance) {
      // When the class has "Mobile check-in confirms attendance"
      // enabled, portal bookings auto-confirm on creation -- the
      // member self-checks-in by booking. Otherwise land as
      // unconfirmed, awaiting an admin confirm.
      const willBeConfirmed = cls.mobileConfirm === true;
      const created = await prisma.attendance.create({
        data: {
          memberId: bookingMemberId,
          classSessionId,
          attendanceDate: parsedDate,
          source: "PORTAL",
          confirmed: willBeConfirmed,
        },
      });
      // Portal booking is a SIGN_IN event for the member. Fire
      // SIGN_IN first (natural fit for a self-book). If the row
      // ALSO lands confirmed (mobileConfirm=true) and the SIGN_IN
      // trigger didn't tag it, fire CONFIRM too so CONFIRM-mode
      // class packs burn here. Helper's mode filter makes cross-
      // mode calls silent no-ops.
      let creditFromMembershipId: string | null = null;
      try {
        const r = await deductClassCreditForMember(bookingMemberId, "SIGN_IN");
        if (r.deducted && r.membershipId) creditFromMembershipId = r.membershipId;
      } catch (err) {
        console.error("[portal/bookings] SIGN_IN deduct failed:", err);
      }
      if (willBeConfirmed && !creditFromMembershipId) {
        try {
          const r = await deductClassCreditForMember(bookingMemberId, "CONFIRM");
          if (r.deducted && r.membershipId) creditFromMembershipId = r.membershipId;
        } catch (err) {
          console.error("[portal/bookings] CONFIRM deduct failed:", err);
        }
      }
      if (creditFromMembershipId) {
        await prisma.attendance.update({
          where: { id: created.id },
          data: { creditDeductedFromMembershipId: creditFromMembershipId },
        }).catch((err) => { console.error("[portal/bookings] tag attendance failed:", err); });
      }
    }
  }

  // Send booking email. Awaited (was fire-and-forget). Vercel kills
  // dangling promises when the response returns.
  if (member) {
    const classStart = new Date(cls.startsAt);
    try {
      await sendBookingConfirmationEmail({
        memberId: bookingMemberId,
        memberName: `${member.firstName} ${member.lastName}`,
        className: cls.name,
        classDate: parsedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
        classTime: classStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        status: result.status,
        waitlistPosition: result.waitlistPosition ?? undefined,
      });
    } catch (err) {
      console.error("[portal/bookings] booking-confirmation email failed:", err);
    }
  }

  return NextResponse.json(result);
}
