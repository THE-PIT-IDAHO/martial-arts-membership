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

    // Fetch the rows FIRST so we know which members are actually
    // being FLIPPED unconfirmed->confirmed (vs already confirmed).
    // Only newly-confirmed rows burn a class-pack credit -- re-
    // confirming an already-confirmed row must not double-decrement.
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
      select: { memberId: true, confirmed: true },
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

    // Decrement one class-pack credit for each member whose row
    // actually flipped false -> true. Non-class-pack members
    // (nothing to deduct) get a silent no-op from the helper.
    const newlyConfirmedMemberIds = targets
      .filter((t) => !t.confirmed)
      .map((t) => t.memberId);
    for (const mId of newlyConfirmedMemberIds) {
      await deductClassCreditForMember(mId).catch((err) => {
        console.error(`Class-credit deduction failed for member ${mId}:`, err);
      });
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

    // Grab the rows FIRST so we know which ones are FLIPPING
    // confirmed -> unconfirmed. Only those get their class-pack
    // credit refunded -- re-DELETE-ing an already-unconfirmed row
    // must not double-refund.
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
      select: { memberId: true, confirmed: true },
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

    // Refund one class-pack credit per member whose row actually
    // flipped true -> false. If the deduction had auto-EXPIRED the
    // pack (balance hit 0), the refund re-activates it so the undo
    // is a real undo.
    const newlyUnconfirmedMemberIds = targets
      .filter((t) => t.confirmed)
      .map((t) => t.memberId);
    for (const mId of newlyUnconfirmedMemberIds) {
      await refundClassCreditForMember(mId).catch((err) => {
        console.error(`Class-credit refund failed for member ${mId}:`, err);
      });
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
