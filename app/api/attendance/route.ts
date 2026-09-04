import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { memberCanAttendClass } from "@/lib/class-eligibility";
import { getGymTimezone, localMidnightUtc } from "@/lib/dates";
import { deductClassCreditForMember, refundClassCreditForMember } from "@/lib/class-credits";

// GET /api/attendance?classSessionId=xxx&date=yyyy-mm-dd
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const classSessionId = searchParams.get("classSessionId");
    const dateStr = searchParams.get("date");

    if (!classSessionId || !dateStr) {
      return new NextResponse("classSessionId and date are required", { status: 400 });
    }

    // Anchor at gym-local midnight so reads match how the POST + dashboard write.
    const tz = await getGymTimezone(clientId);
    const dayStartMs = localMidnightUtc(dateStr, tz);
    const startOfDay = new Date(dayStartMs);
    const endOfDay = new Date(dayStartMs + 24 * 60 * 60 * 1000 - 1);

    // Coach-attends-as-student: lazy-create the coach's Attendance row on
    // roster load. Once the class's start time has passed (in gym TZ) the
    // row is auto-confirmed — coach gets credit for teaching without
    // anyone manually checking them in.
    const cls = await prisma.classSession.findUnique({
      where: { id: classSessionId },
      select: { coachId: true, coachAttendsAsStudent: true, clientId: true, startsAt: true },
    });
    if (cls?.coachAttendsAsStudent && cls.coachId && cls.clientId === clientId) {
      const coachMember = await prisma.member.findUnique({
        where: { id: cls.coachId },
        select: { id: true },
      });
      if (coachMember) {
        // Has the class started for THIS date? startsAt is the template's
        // start time; we project it onto the requested date and compare to
        // "now". Auto-confirm if the start time has already passed.
        const tpl = cls.startsAt;
        const projected = new Date(dayStartMs);
        projected.setUTCHours(tpl.getUTCHours(), tpl.getUTCMinutes(), 0, 0);
        const classHasStarted = Date.now() >= projected.getTime();

        const existing = await prisma.attendance.findFirst({
          where: {
            memberId: cls.coachId,
            classSessionId,
            attendanceDate: { gte: startOfDay, lte: endOfDay },
          },
        });
        if (!existing) {
          await prisma.attendance.create({
            data: {
              memberId: cls.coachId,
              classSessionId,
              attendanceDate: startOfDay,
              // COACH_AUTO is the dedicated source for "auto coach-as-student"
              // rows so the coach-swap logic on class edit can target them
              // exclusively without ever touching manual check-ins.
              source: "COACH_AUTO",
              confirmed: classHasStarted,
              requirementOverride: true,
            },
          }).catch(() => { /* ignore unique-race */ });
        } else if (classHasStarted && !existing.confirmed) {
          // Existing row but class has since started — bump to confirmed.
          await prisma.attendance.update({
            where: { id: existing.id },
            data: { confirmed: true },
          }).catch(() => { /* ignore */ });
        }
      }
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        source: { not: "IMPORTED" },
        member: { clientId },
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryStyle: true,
            stylesNotes: true,
            rank: true,
          },
        },
      },
      orderBy: {
        checkedInAt: "asc",
      },
    });

    return NextResponse.json({ attendances });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return new NextResponse("Failed to load attendance", { status: 500 });
  }
}

// POST /api/attendance
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberId, classSessionId, attendanceDate, requirementOverride, source } = body;

    if (!memberId || !classSessionId || !attendanceDate) {
      return new NextResponse("memberId, classSessionId, and attendanceDate are required", { status: 400 });
    }

    // Verify member and class belong to this gym
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { clientId: true } });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    const classSession = await prisma.classSession.findUnique({ where: { id: classSessionId }, select: { clientId: true, mobileConfirm: true } });
    if (!classSession || classSession.clientId !== clientId) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // Anchor the attendance date at the gym's local midnight (UTC) so every
    // TZ-aware reader (dashboard, portal classes, reports) sees it in the
    // correct day bucket. Server-local midnight would land in the wrong UTC
    // day on Vercel.
    const dateStr = typeof attendanceDate === "string" && attendanceDate.includes("T")
      ? attendanceDate.split("T")[0]
      : String(attendanceDate);
    const tz = await getGymTimezone(clientId);
    const dayStartMs = localMidnightUtc(dateStr, tz);
    const date = new Date(dayStartMs);
    const startOfDay = new Date(dayStartMs);
    const endOfDay = new Date(dayStartMs + 24 * 60 * 60 * 1000 - 1);

    const existing = await prisma.attendance.findFirst({
      where: {
        memberId,
        classSessionId,
        attendanceDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (existing) {
      // Duplicate check-in. If the CURRENT attempt would confirm the
      // row (KIOSK / MANUAL always, or a class where mobileConfirm is
      // on) and the existing row is still unconfirmed, promote it in
      // place instead of returning 409. Without this, an early scan
      // that landed as source=QR (pre-fix, or a stale kiosk browser)
      // stays permanently unconfirmed no matter how many times the
      // member rescans -- every retry short-circuits at this branch
      // before touching the row. Nathan Hall's row was the trigger
      // for this fix.
      const shouldConfirm =
        source === "KIOSK" ||
        source === "MANUAL" ||
        (classSession?.mobileConfirm ? true : false);
      if (shouldConfirm && !existing.confirmed) {
        const updated = await prisma.attendance.update({
          where: { id: existing.id },
          // Also rewrite `source` to the new (trusted) source so
          // downstream reporting doesn't still call it a "QR" row
          // when a KIOSK scan just confirmed it.
          data: { confirmed: true, source: source || existing.source },
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                primaryStyle: true,
                stylesNotes: true,
                rank: true,
              },
            },
          },
        });
        // Row went from unconfirmed -> confirmed. This is a CONFIRM
        // trigger. SIGN_IN-mode packs were already deducted when the
        // row was originally created; helper filters by plan mode so
        // this call is a no-op for them. When it does deduct, record
        // which membership paid so an unconfirm/delete can refund
        // the exact pack.
        try {
          const result = await deductClassCreditForMember(memberId, "CONFIRM");
          if (result.deducted && result.membershipId) {
            await prisma.attendance.update({
              where: { id: existing.id },
              data: { creditDeductedFromMembershipId: result.membershipId },
            });
          }
        } catch (err) {
          console.error("[class-credits] deduct failed:", err);
        }
        return NextResponse.json({ attendance: updated, promoted: true }, { status: 200 });
      }
      return new NextResponse("Member is already signed in to this class", { status: 409 });
    }

    // Enforce class style eligibility — block check-in if member has no active enrolled
    // style matching the class's allowed styles. Admin can pass requirementOverride:true
    // to bypass (same flag used for rank-requirement overrides).
    if (!requirementOverride) {
      const eligibility = await memberCanAttendClass(memberId, classSessionId);
      if (!eligibility.ok) {
        return NextResponse.json(
          { error: eligibility.reason, code: "STYLE_NOT_ALLOWED" },
          { status: 403 },
        );
      }
    }

    const willBeConfirmed = source === "KIOSK" || source === "MANUAL"
      ? true
      : (classSession?.mobileConfirm ? true : false);
    const attendance = await prisma.attendance.create({
      data: {
        memberId,
        classSessionId,
        attendanceDate: date,
        source: source || "MANUAL",
        confirmed: willBeConfirmed,
        requirementOverride: requirementOverride || false,
      },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryStyle: true,
            stylesNotes: true,
            rank: true,
          },
        },
      },
    });
    // A new attendance row exists -- fire SIGN_IN trigger for packs
    // configured to burn on sign-in. If the row was ALSO created
    // confirmed (kiosk/manual/mobileConfirm), fire CONFIRM too so
    // CONFIRM-mode packs deduct. Cross-mode calls are safe no-ops
    // because the helper filters by plan.expireOnSignIn. Whichever
    // path deducts gets its membershipId stored on the attendance so
    // refunds can find the exact pack later.
    let creditFromMembershipId: string | null = null;
    try {
      const signInResult = await deductClassCreditForMember(memberId, "SIGN_IN");
      if (signInResult.deducted && signInResult.membershipId) {
        creditFromMembershipId = signInResult.membershipId;
      }
    } catch (err) { console.error("[class-credits] SIGN_IN deduct failed:", err); }
    if (willBeConfirmed && !creditFromMembershipId) {
      try {
        const confirmResult = await deductClassCreditForMember(memberId, "CONFIRM");
        if (confirmResult.deducted && confirmResult.membershipId) {
          creditFromMembershipId = confirmResult.membershipId;
        }
      } catch (err) { console.error("[class-credits] CONFIRM deduct failed:", err); }
    }
    if (creditFromMembershipId) {
      await prisma.attendance.update({
        where: { id: attendance.id },
        data: { creditDeductedFromMembershipId: creditFromMembershipId },
      }).catch((err) => { console.error("[class-credits] tag attendance failed:", err); });
    }

    // Also upsert a ClassBooking so it appears in the member portal. Have to
    // handle three states: no row at all (create), an active row (skip), or
    // a CANCELLED row from a prior portal cancel (re-activate). Without the
    // re-activate branch the unique constraint (memberId+classSessionId+
    // bookingDate) would 500 the request.
    const existingBookingAny = await prisma.classBooking.findFirst({
      where: {
        memberId,
        classSessionId,
        bookingDate: { gte: startOfDay, lte: endOfDay },
      },
    });
    if (!existingBookingAny) {
      await prisma.classBooking.create({
        data: {
          memberId,
          classSessionId,
          bookingDate: date,
          status: "CONFIRMED",
        },
      });
    } else if (existingBookingAny.status === "CANCELLED") {
      await prisma.classBooking.update({
        where: { id: existingBookingAny.id },
        data: { status: "CONFIRMED", waitlistPosition: null },
      });
    }
    // CONFIRMED/WAITLISTED → leave as-is

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    console.error("Error creating attendance:", error);
    return new NextResponse("Failed to create attendance", { status: 500 });
  }
}

// DELETE /api/attendance?id=xxx OR ?memberId=xxx&classSessionId=xxx&date=yyyy-mm-dd
export async function DELETE(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const memberId = searchParams.get("memberId");
    const classSessionId = searchParams.get("classSessionId");
    const dateStr = searchParams.get("date");

    if (id) {
      // Look up the attendance record first so we can cancel the matching
      // booking AND verify the row's member belongs to this tenant.
      // Without the tenant check, `?id=xxx` let anyone delete any
      // attendance row on the platform.
      const att = await prisma.attendance.findUnique({
        where: { id },
        select: {
          memberId: true,
          classSessionId: true,
          attendanceDate: true,
          confirmed: true,
          creditDeductedFromMembershipId: true,
          member: { select: { clientId: true } },
        },
      });
      if (!att || att.member?.clientId !== clientId) {
        return new NextResponse("Attendance not found", { status: 404 });
      }

      await prisma.attendance.delete({
        where: { id },
      });

      // Refund the class-pack credit this row consumed, if any. The
      // exact pack that paid is stored on creditDeductedFromMembershipId
      // -- refund to that one so the credit returns to the original
      // pack (even if it's now EXPIRED and the member has a newer
      // pack). Rows without the tag (legacy or no deduction fired)
      // fall through the helper's mode-matched heuristic.
      if (att.creditDeductedFromMembershipId) {
        await refundClassCreditForMember(
          att.memberId,
          att.confirmed ? "CONFIRM" : "SIGN_IN",
          att.creditDeductedFromMembershipId,
        ).catch((err) => {
          console.error(`Class-credit refund failed for member ${att.memberId}:`, err);
        });
      }

      // Cancel matching portal booking
      if (att) {
        const attDate = new Date(att.attendanceDate);
        const s = new Date(attDate.getFullYear(), attDate.getMonth(), attDate.getDate(), 0, 0, 0, 0);
        const e = new Date(attDate.getFullYear(), attDate.getMonth(), attDate.getDate(), 23, 59, 59, 999);
        if (att.classSessionId) {
          await prisma.classBooking.updateMany({
            where: {
              memberId: att.memberId,
              classSessionId: att.classSessionId,
              bookingDate: { gte: s, lte: e },
              status: { in: ["CONFIRMED", "WAITLISTED"] },
            },
            data: { status: "CANCELLED" },
          });
        }
      }
    } else if (memberId && classSessionId && dateStr) {
      // Delete by member, class, and date — anchor at gym-local midnight to
      // match how writes were created.
      // Verify BOTH the member and the class session belong to this
      // tenant. Without these checks, a caller could pass a foreign
      // memberId + classSessionId and delete attendance + cancel
      // bookings in another gym.
      const [mem, sess] = await Promise.all([
        prisma.member.findUnique({ where: { id: memberId }, select: { clientId: true } }),
        prisma.classSession.findUnique({ where: { id: classSessionId }, select: { clientId: true } }),
      ]);
      if (!mem || mem.clientId !== clientId) {
        return new NextResponse("Member not found", { status: 404 });
      }
      if (!sess || sess.clientId !== clientId) {
        return new NextResponse("Class session not found", { status: 404 });
      }

      const tz = await getGymTimezone(clientId);
      const dayStartMs = localMidnightUtc(dateStr, tz);
      const startOfDay = new Date(dayStartMs);
      const endOfDay = new Date(dayStartMs + 24 * 60 * 60 * 1000 - 1);

      // Snapshot rows first so we know which membership to refund
      // for each -- the creditDeductedFromMembershipId tag on every
      // row identifies the exact pack that paid, keeping refunds
      // pinned to the correct membership even when a member has
      // multiple packs (or an EXPIRED old pack + a new ACTIVE one).
      const toDelete = await prisma.attendance.findMany({
        where: {
          memberId,
          classSessionId,
          attendanceDate: { gte: startOfDay, lte: endOfDay },
        },
        select: { confirmed: true, creditDeductedFromMembershipId: true },
      });

      await prisma.attendance.deleteMany({
        where: {
          memberId,
          classSessionId,
          attendanceDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      for (const row of toDelete) {
        if (!row.creditDeductedFromMembershipId) continue;
        await refundClassCreditForMember(
          memberId,
          row.confirmed ? "CONFIRM" : "SIGN_IN",
          row.creditDeductedFromMembershipId,
        ).catch((err) => {
          console.error(`Class-credit refund failed for member ${memberId}:`, err);
        });
      }

      // Cancel matching portal booking
      await prisma.classBooking.updateMany({
        where: {
          memberId,
          classSessionId,
          bookingDate: { gte: startOfDay, lte: endOfDay },
          status: { in: ["CONFIRMED", "WAITLISTED"] },
        },
        data: { status: "CANCELLED" },
      });
    } else {
      return new NextResponse("id or (memberId, classSessionId, date) required", { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    return new NextResponse("Failed to delete attendance", { status: 500 });
  }
}
