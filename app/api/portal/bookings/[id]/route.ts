import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { sendWaitlistPromotionEmail } from "@/lib/notifications";
import { refundClassCreditForMember, deductClassCreditForMember } from "@/lib/class-credits";
import { getGymTimezone, occurrenceForDate, formatDateInTimezone } from "@/lib/dates";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const booking = await prisma.classBooking.findUnique({
    where: { id },
    include: {
      classSession: {
        select: {
          name: true,
          startsAt: true,
          cancellationCutoffMins: true,
          clientId: true,
        },
      },
    },
  });

  if (!booking || booking.memberId !== auth.memberId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  // Enforce the per-class cancellation cutoff. Anchors the class's
  // template startsAt on the actual bookingDate (occurrenceForDate)
  // so recurring classes get the right instance datetime rather
  // than the template's original date. Blank cutoff = no restriction.
  if (booking.classSession.cancellationCutoffMins) {
    const tz = await getGymTimezone(booking.classSession.clientId);
    const occurrence = occurrenceForDate(
      new Date(booking.classSession.startsAt),
      formatDateInTimezone(booking.bookingDate, tz),
      tz,
    );
    const cutoff = new Date(
      occurrence.getTime() - booking.classSession.cancellationCutoffMins * 60 * 1000,
    );
    if (new Date() > cutoff) {
      return NextResponse.json(
        { error: "Cancellation cutoff has passed" },
        { status: 400 },
      );
    }
  }

  const wasConfirmed = booking.status === "CONFIRMED";

  // Cancel the booking
  await prisma.classBooking.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  // Snapshot the attendance rows first so we can refund any class-
  // pack credit they consumed. Row's creditDeductedFromMembershipId
  // tag points to the exact pack that paid (kiosk sign-in, portal
  // sign-in, or admin confirm all tag the row when they burn a
  // credit).
  const toDelete = await prisma.attendance.findMany({
    where: {
      memberId: booking.memberId,
      classSessionId: booking.classSessionId,
      attendanceDate: booking.bookingDate,
    },
    select: { confirmed: true, creditDeductedFromMembershipId: true },
  });

  // Remove the corresponding attendance record. Cancelling the booking
  // should also pull the member off the class roster regardless of which
  // path created the attendance row (PORTAL self-book, MANUAL staff
  // sign-in, KIOSK check-in, etc.) — otherwise the dashboard's count
  // would stay stuck after a portal cancel of a staff-added member.
  await prisma.attendance.deleteMany({
    where: {
      memberId: booking.memberId,
      classSessionId: booking.classSessionId,
      attendanceDate: booking.bookingDate,
    },
  });

  // Refund any class-pack credits the deleted rows consumed.
  for (const row of toDelete) {
    if (!row.creditDeductedFromMembershipId) continue;
    await refundClassCreditForMember(
      booking.memberId,
      row.confirmed ? "CONFIRM" : "SIGN_IN",
      row.creditDeductedFromMembershipId,
    ).catch((err) => {
      console.error("[portal/bookings/[id]] class-credit refund failed:", err);
    });
  }

  // If was confirmed, promote first waitlisted member
  if (wasConfirmed) {
    const nextWaitlisted = await prisma.classBooking.findFirst({
      where: {
        classSessionId: booking.classSessionId,
        bookingDate: booking.bookingDate,
        status: "WAITLISTED",
      },
      orderBy: { waitlistPosition: "asc" },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (nextWaitlisted) {
      await prisma.classBooking.update({
        where: { id: nextWaitlisted.id },
        data: { status: "CONFIRMED", waitlistPosition: null },
      });

      // Create attendance record for promoted member
      const existingAtt = await prisma.attendance.findUnique({
        where: {
          memberId_classSessionId_attendanceDate: {
            memberId: nextWaitlisted.member.id,
            classSessionId: booking.classSessionId,
            attendanceDate: booking.bookingDate,
          },
        },
      });
      if (!existingAtt) {
        const promotedAtt = await prisma.attendance.create({
          data: {
            memberId: nextWaitlisted.member.id,
            classSessionId: booking.classSessionId,
            attendanceDate: booking.bookingDate,
            source: "PORTAL",
            confirmed: false,
          },
        });
        // Waitlist -> Confirmed is a fresh SIGN_IN for the promoted
        // member. Burn a class-pack credit if their plan is SIGN_IN mode.
        try {
          const r = await deductClassCreditForMember(nextWaitlisted.member.id, "SIGN_IN");
          if (r.deducted && r.membershipId) {
            await prisma.attendance.update({
              where: { id: promotedAtt.id },
              data: { creditDeductedFromMembershipId: r.membershipId },
            });
          }
        } catch (err) {
          console.error("[portal/bookings/[id]] promoted-waitlist SIGN_IN deduct failed:", err);
        }
      }

      // Notify promoted member
      const classStart = new Date(booking.classSession.startsAt);
      // Awaited (was fire-and-forget). Vercel kills dangling promises
      // when the response returns.
      try {
        await sendWaitlistPromotionEmail({
          memberId: nextWaitlisted.member.id,
          memberName: `${nextWaitlisted.member.firstName} ${nextWaitlisted.member.lastName}`,
          className: booking.classSession.name,
          classDate: booking.bookingDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
          classTime: classStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        });
      } catch (err) {
        console.error("[portal/bookings/[id]] waitlist-promotion email failed:", err);
      }
    }
  }

  return NextResponse.json({ success: true });
}
