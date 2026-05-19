import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmationEmail } from "@/lib/notifications";
import { memberCanAttendClass } from "@/lib/class-eligibility";
import { getGymTimezone, occurrenceForDate, localMidnightUtc } from "@/lib/dates";

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
        select: { name: true, startsAt: true, endsAt: true, coachName: true, styleName: true },
      },
    },
    orderBy: { bookingDate: "asc" },
  });

  return NextResponse.json(bookings);
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

  // If booking for a child, verify parent relationship
  let bookingMemberId = auth.memberId;
  if (forMemberId && forMemberId !== auth.memberId) {
    const relationship = await prisma.memberRelationship.findFirst({
      where: {
        fromMemberId: auth.memberId,
        toMemberId: forMemberId,
        relationship: { in: ["PARENT", "GUARDIAN"] },
      },
    });
    if (!relationship) {
      return NextResponse.json({ error: "Not authorized to book for this member" }, { status: 403 });
    }
    bookingMemberId = forMemberId;
  }

  if (!classSessionId || !bookingDate) {
    return NextResponse.json({ error: "classSessionId and bookingDate required" }, { status: 400 });
  }

  // Store the booking's date as the UTC timestamp of the gym's local midnight
  // for that date. This way the same booking row is in range for both the
  // portal classes page (filters by client-local day) and the dashboard
  // (filters by gym-local day) — no straddling-midnight surprises.
  const bookingTz = await getGymTimezone();
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
    },
  });

  if (!cls) {
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
      await prisma.attendance.create({
        data: {
          memberId: bookingMemberId,
          classSessionId,
          attendanceDate: parsedDate,
          source: "PORTAL",
          confirmed: false,
        },
      });
    }
  }

  // Send booking email
  if (member) {
    const classStart = new Date(cls.startsAt);
    sendBookingConfirmationEmail({
      memberId: bookingMemberId,
      memberName: `${member.firstName} ${member.lastName}`,
      className: cls.name,
      classDate: parsedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      classTime: classStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      status: result.status,
      waitlistPosition: result.waitlistPosition ?? undefined,
    }).catch(() => {});
  }

  return NextResponse.json(result);
}
