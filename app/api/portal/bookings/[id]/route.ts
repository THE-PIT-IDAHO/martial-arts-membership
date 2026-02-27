import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { sendWaitlistPromotionEmail } from "@/lib/notifications";

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
      classSession: { select: { name: true, startsAt: true } },
    },
  });

  if (!booking || booking.memberId !== auth.memberId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  const wasConfirmed = booking.status === "CONFIRMED";

  // Cancel the booking
  await prisma.classBooking.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  // Remove the corresponding attendance record
  await prisma.attendance.deleteMany({
    where: {
      memberId: booking.memberId,
      classSessionId: booking.classSessionId,
      attendanceDate: booking.bookingDate,
      source: "PORTAL",
    },
  });

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
        await prisma.attendance.create({
          data: {
            memberId: nextWaitlisted.member.id,
            classSessionId: booking.classSessionId,
            attendanceDate: booking.bookingDate,
            source: "PORTAL",
            confirmed: false,
          },
        });
      }

      // Notify promoted member
      const classStart = new Date(booking.classSession.startsAt);
      sendWaitlistPromotionEmail({
        memberId: nextWaitlisted.member.id,
        memberName: `${nextWaitlisted.member.firstName} ${nextWaitlisted.member.lastName}`,
        className: booking.classSession.name,
        classDate: booking.bookingDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
        classTime: classStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
