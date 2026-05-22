// GET /api/promotions/eligible
// Returns one row per (member, style) where:
//   - the member has the style in stylesNotes (active),
//   - the style has belt config with a next rank above the member's current,
// with progress info so the UI can flag who's met all requirements.
//
// The frontend can promote any of them (eligibility is a visual flag only;
// admin override is always allowed). This endpoint just computes the data.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { computePromotionFee } from "@/lib/promotion-fee";
import { effectiveAttendanceStart, type AttendanceWindow } from "@/lib/attendance-window";

type StyleEntry = {
  name: string;
  rank?: string;
  startDate?: string;
  lastPromotionDate?: string;
  attendanceResetDate?: string;
  active?: boolean;
};

type BeltConfigRank = {
  id?: string;
  name: string;
  order: number;
  classRequirements?: Array<{ label: string; minCount: number }>;
  attendanceWindow?: AttendanceWindow;
};

type EligibleEntry = {
  memberId: string;
  memberName: string;
  photoUrl: string | null;
  styleId: string;
  styleName: string;
  fromRank: string | null;
  toRank: string;
  // Per-class-type attendance progress against the next rank's requirements.
  classRequirements: Array<{ label: string; attended: number; required: number; met: boolean }>;
  allRequirementsMet: boolean;
  attendanceResetDate: string | null;
  lastPromotionDate: string | null;
  // Pre-computed fee preview so the modal can show the breakdown instantly.
  fee: {
    baseCostCents: number;
    discountCents: number;
    costCents: number;
    discountSourcePlanName: string | null;
    source: "member" | "style" | "global" | "none";
  };
};

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");

    // If an event is given, the window's END is the event date (so progress
    // is measured "will they be ready BY THAT DATE"); roster filters limit
    // which members + styles to evaluate against the event.
    let event: {
      id: string;
      date: Date;
      styleIds: string[];
      memberIds: string[];
      // false → ignore the per-rank attendanceWindow when computing the
      // start cutoff; only the member's reset date acts as the floor.
      applyAttendanceWindow: boolean;
    } | null = null;
    if (eventId) {
      const evRow = await prisma.promotionEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true, date: true, clientId: true, styleId: true, styleIds: true,
          applyAttendanceWindow: true,
          participants: { select: { memberId: true } },
        },
      });
      if (!evRow || evRow.clientId !== clientId) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      let evStyleIds: string[] = [];
      if (evRow.styleIds) {
        try { evStyleIds = JSON.parse(evRow.styleIds); } catch { /* ignore */ }
      }
      if (evStyleIds.length === 0 && evRow.styleId) evStyleIds = [evRow.styleId];
      event = {
        id: evRow.id,
        date: evRow.date,
        styleIds: evStyleIds,
        memberIds: evRow.participants.map((p) => p.memberId),
        applyAttendanceWindow: evRow.applyAttendanceWindow !== false,
      };
    }

    const styles = await prisma.style.findMany({
      where: {
        clientId,
        beltSystemEnabled: true,
        ...(event && event.styleIds.length > 0 ? { id: { in: event.styleIds } } : {}),
      },
      select: { id: true, name: true, beltConfig: true, promotionFeeCents: true },
    });
    const styleByName = new Map<string, typeof styles[number]>();
    for (const s of styles) styleByName.set(s.name.toLowerCase(), s);

    const members = await prisma.member.findMany({
      where: {
        clientId,
        ...(event && event.memberIds.length > 0
          ? { id: { in: event.memberIds } }
          : {
              // Default: only active members. When event is set, the roster
              // is the filter — we don't double-restrict by status.
              status: { contains: "ACTIVE" },
              NOT: { status: { contains: "INACTIVE" } },
            }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        stylesNotes: true,
      },
    });

    // Window end date: event.date if provided, else now.
    const windowEnd = event ? event.date : new Date();

    // Cache attendance per member (we filter in-memory by style).
    const attendanceByMember = new Map<
      string,
      Array<{
        attendanceDate: Date | null;
        classSession: { classType: string | null; classTypes: string | null; styleName: string | null; styleNames: string | null } | null;
        source: string | null;
      }>
    >();
    const memberIds = members.map((m) => m.id);
    if (memberIds.length > 0) {
      const atts = await prisma.attendance.findMany({
        where: { memberId: { in: memberIds }, confirmed: true },
        select: {
          memberId: true,
          attendanceDate: true,
          source: true,
          classSession: {
            select: { classType: true, classTypes: true, styleName: true, styleNames: true },
          },
        },
      });
      for (const a of atts) {
        if (!attendanceByMember.has(a.memberId)) attendanceByMember.set(a.memberId, []);
        attendanceByMember.get(a.memberId)!.push({
          attendanceDate: a.attendanceDate,
          classSession: a.classSession,
          source: a.source,
        });
      }
    }

    const rows: EligibleEntry[] = [];

    for (const member of members) {
      let enrolled: StyleEntry[] = [];
      if (member.stylesNotes) {
        try { enrolled = JSON.parse(member.stylesNotes); } catch { enrolled = []; }
      }

      for (const es of enrolled) {
        if (!es.name || es.active === false || !es.rank) continue;
        const style = styleByName.get(es.name.toLowerCase());
        if (!style || !style.beltConfig) continue;

        let parsed: { ranks?: BeltConfigRank[] } = {};
        try { parsed = JSON.parse(style.beltConfig); } catch { continue; }
        const ranks = (parsed.ranks || []).slice().sort((a, b) => a.order - b.order);
        const currentIdx = ranks.findIndex((r) => r.name.toLowerCase() === es.rank!.toLowerCase());
        if (currentIdx < 0 || currentIdx >= ranks.length - 1) continue;

        const nextRank = ranks[currentIdx + 1];
        const requirements = (nextRank.classRequirements || []).filter(
          (r) => r.label && r.minCount > 0,
        );

        // Filter member's attendance to this style. The window has two
        // bounds: lastReset (member's last promotion) and the rank's
        // attendanceWindow (e.g. "6 months back from event date") —
        // whichever is more recent wins, since both are floors.
        const memberAtts = attendanceByMember.get(member.id) || [];
        const resetCutoff = es.attendanceResetDate
          ? new Date(es.attendanceResetDate + "T00:00:00")
          : null;
        const startCutoff = effectiveAttendanceStart({
          endDate: windowEnd,
          resetDate: resetCutoff,
          // Honor the per-event opt-out: when the admin unchecked
          // "Attach Attendance Windows" on this event, ignore the
          // rank's window and let the reset date stand alone.
          window: event && !event.applyAttendanceWindow ? null : nextRank.attendanceWindow,
        });
        const styleAtts = memberAtts.filter((a) => {
          if (!a.attendanceDate) return false;
          if (startCutoff && a.attendanceDate < startCutoff) return false;
          if (a.attendanceDate > windowEnd) return false;
          if (a.source === "IMPORTED") return true;
          if (!a.classSession) return false;
          if (a.classSession.styleNames) {
            try {
              const names: string[] = JSON.parse(a.classSession.styleNames);
              return names.some((n) => n.toLowerCase() === es.name.toLowerCase());
            } catch { /* ignore */ }
          }
          return (a.classSession.styleName || "").toLowerCase() === es.name.toLowerCase();
        });

        const classReqs = requirements.map((req) => {
          const isAny = req.label === "*";
          const attended = styleAtts.filter((a) => {
            if (isAny) return true;
            if (!a.classSession) return false;
            if (a.classSession.classType?.toLowerCase() === req.label.toLowerCase()) return true;
            if (a.classSession.classTypes) {
              try {
                const types: string[] = JSON.parse(a.classSession.classTypes);
                return types.some((t) => t.toLowerCase() === req.label.toLowerCase());
              } catch { /* ignore */ }
            }
            return false;
          }).length;
          return {
            label: isAny ? "Any Class" : req.label,
            attended,
            required: req.minCount,
            met: attended >= req.minCount,
          };
        });

        const allMet = classReqs.length === 0 ? true : classReqs.every((r) => r.met);

        const fee = await computePromotionFee({
          memberId: member.id,
          styleId: style.id,
          clientId,
        });

        rows.push({
          memberId: member.id,
          memberName: `${member.firstName} ${member.lastName}`.trim(),
          photoUrl: member.photoUrl,
          styleId: style.id,
          styleName: style.name,
          fromRank: es.rank,
          toRank: nextRank.name,
          classRequirements: classReqs,
          allRequirementsMet: allMet,
          attendanceResetDate: es.attendanceResetDate || null,
          lastPromotionDate: es.lastPromotionDate || null,
          fee: {
            baseCostCents: fee.baseCostCents,
            discountCents: fee.discountCents,
            costCents: fee.costCents,
            discountSourcePlanName: fee.discountSourcePlanName,
            source: fee.source,
          },
        });
      }
    }

    // Sort: eligible (met all) first, then by name.
    rows.sort((a, b) => {
      if (a.allRequirementsMet !== b.allRequirementsMet) {
        return a.allRequirementsMet ? -1 : 1;
      }
      return a.memberName.localeCompare(b.memberName);
    });

    return NextResponse.json({ promotions: rows });
  } catch (err) {
    console.error("GET /api/promotions/eligible error:", err);
    return NextResponse.json({ error: "Failed to load eligible promotions" }, { status: 500 });
  }
}
