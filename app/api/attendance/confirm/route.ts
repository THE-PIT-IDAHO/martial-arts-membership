import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getGymTimezone, localMidnightUtc } from "@/lib/dates";
import { deductClassCreditForMember, refundClassCreditForMember } from "@/lib/class-credits";

// POST /api/attendance/confirm - Confirm attendance for members
// Body: { memberIds: string[], classSessionId: string, date: string }
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberIds, classSessionId, date } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }

    if (!classSessionId || !date) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Verify class belongs to this gym
    const cls = await prisma.classSession.findUnique({ where: { id: classSessionId }, select: { clientId: true } });
    if (!cls || cls.clientId !== clientId) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Anchor at gym-local midnight to match how attendance rows were written.
    const tz = await getGymTimezone(clientId);
    const dayStartMs = localMidnightUtc(date, tz);
    const startOfDay = new Date(dayStartMs);
    const endOfDay = new Date(dayStartMs + 24 * 60 * 60 * 1000 - 1);

    // Fetch the rows FIRST (with their ids) so we know which are
    // actually FLIPPING unconfirmed->confirmed AND can tag the
    // specific attendance row with whichever membership pays.
    const targets = await prisma.attendance.findMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        member: { clientId },
      },
      select: { id: true, memberId: true, confirmed: true },
    });

    const result = await prisma.attendance.updateMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        member: { clientId },
      },
      data: {
        confirmed: true,
      },
    });

    // Decrement CONFIRM-mode class-pack credit for each member whose
    // row actually flipped false -> true. SIGN_IN-mode packs already
    // paid at row-CREATE and the helper filter makes those calls
    // silent no-ops. When a deduction fires, write the source
    // membershipId back to the attendance row so an eventual refund
    // returns the credit to that exact pack.
    const newlyConfirmed = targets.filter((t) => !t.confirmed);
    for (const t of newlyConfirmed) {
      try {
        // Try CONFIRM mode first (the natural fit for a confirm event).
        // If nothing matched, fall back to SIGN_IN -- self-heal for a
        // SIGN_IN pack that never got a sign-in event (e.g. admin
        // added the row confirmed via another path that skipped the
        // create-time trigger). Prevents "member on SIGN_IN pack got
        // confirmed and nothing decremented."
        let r = await deductClassCreditForMember(t.memberId, "CONFIRM");
        if (!r.deducted) {
          r = await deductClassCreditForMember(t.memberId, "SIGN_IN");
        }
        if (r.deducted && r.membershipId) {
          await prisma.attendance.update({
            where: { id: t.id },
            data: { creditDeductedFromMembershipId: r.membershipId },
          });
        }
      } catch (err) {
        console.error(`Class-credit deduction failed for member ${t.memberId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      confirmedCount: result.count
    });
  } catch (error) {
    console.error("Error confirming attendance:", error);
    return new NextResponse("Failed to confirm attendance", { status: 500 });
  }
}

// DELETE /api/attendance/confirm - Unconfirm (mark as absent) attendance for members
// Body: { memberIds: string[], classSessionId: string, date: string }
export async function DELETE(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberIds, classSessionId, date } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }

    if (!classSessionId || !date) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Verify class belongs to this gym
    const cls = await prisma.classSession.findUnique({ where: { id: classSessionId }, select: { clientId: true } });
    if (!cls || cls.clientId !== clientId) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Anchor at gym-local midnight to match how attendance rows were written.
    const tz = await getGymTimezone(clientId);
    const dayStartMs = localMidnightUtc(date, tz);
    const startOfDay = new Date(dayStartMs);
    const endOfDay = new Date(dayStartMs + 24 * 60 * 60 * 1000 - 1);

    // Grab rows first with their credit-source tag so we know which
    // membership to refund per row. Only rows flipping true -> false
    // and holding a CONFIRM-mode tag actually refund; SIGN_IN rows
    // keep their credit consumed (row still exists = still "signed
    // in") -- only DELETE-row refunds SIGN_IN.
    const targets = await prisma.attendance.findMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        member: { clientId },
      },
      select: { id: true, memberId: true, confirmed: true, creditDeductedFromMembershipId: true },
    });

    const result = await prisma.attendance.updateMany({
      where: {
        memberId: { in: memberIds },
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        member: { clientId },
      },
      data: {
        confirmed: false,
      },
    });

    // Refund + clear the credit-source tag on each row that had one
    // AND was previously confirmed (i.e. a CONFIRM-mode deduction).
    for (const t of targets) {
      if (!t.confirmed) continue;
      if (!t.creditDeductedFromMembershipId) continue;
      try {
        await refundClassCreditForMember(t.memberId, "CONFIRM", t.creditDeductedFromMembershipId);
        await prisma.attendance.update({
          where: { id: t.id },
          data: { creditDeductedFromMembershipId: null },
        });
      } catch (err) {
        console.error(`Class-credit refund failed for member ${t.memberId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      unconfirmedCount: result.count
    });
  } catch (error) {
    console.error("Error marking attendance as absent:", error);
    return new NextResponse("Failed to mark attendance as absent", { status: 500 });
  }
}
