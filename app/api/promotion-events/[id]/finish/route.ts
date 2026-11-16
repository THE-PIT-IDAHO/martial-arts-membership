// POST /api/promotion-events/[id]/finish
//
// Closes out an event:
//   1. For every still-REGISTERED participant on the roster, finds the
//      event styles they're enrolled in where they have a next rank
//      available, and creates one Promotion (+ POSTransaction for the
//      fee) per (member, style).
//   2. Marks each promoted participant PROMOTED + feeCharged=true with
//      a transactionId link.
//   3. Sets the event's status=COMPLETED + finishedAt=now so the modal
//      shows "Finished" and the daily cron stops considering it.
//
// Modes:
//   - mode="manual" (default): promote every REGISTERED participant
//     (admin clicked the Finish button — they've already chosen who to
//     remove). Honors per-participant feeOverrideCents.
//   - mode="auto": only promote participants with autoPromote=true. Used
//     by the daily lifecycle cron when an event's autoFinishAt has
//     arrived. Skipped participants stay REGISTERED so admin can finish
//     them manually later.
//
// Payment method defaults to "ACCOUNT": applyOnePromotion charges the
// member's card on file first and only falls back to the account balance
// when there's no card or it declines. Failures don't roll back successful promotions — the route
// returns a per-participant result array so admin can retry the failures.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { rankKey } from "@/lib/rank-rename";
import { applyOnePromotion, type PromoteInput } from "@/app/api/promotions/route";

type BeltConfigRank = { name: string; order: number };
type StyleEntry = { name: string; rank?: string; active?: boolean };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const mode: "manual" | "auto" = body.mode === "auto" ? "auto" : "manual";
    const paymentMethod: string = typeof body.paymentMethod === "string" ? body.paymentMethod : "ACCOUNT";

    const event = await prisma.promotionEvent.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!event || event.clientId !== clientId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    // A finished event can be re-run manually to pick up participants the
    // first run skipped (still REGISTERED). Already-PROMOTED participants
    // are filtered out below, so nobody is promoted or charged twice.
    // The daily cron never re-runs a finished event.
    if (event.finishedAt && mode === "auto") {
      return NextResponse.json({ error: "Event already finished" }, { status: 400 });
    }

    // Event's attached styles. Resolve to full Style rows with beltConfig
    // so we can compute next-rank per (participant, style).
    let eventStyleIds: string[] = [];
    if (event.styleIds) {
      try { eventStyleIds = JSON.parse(event.styleIds); } catch { /* ignore */ }
    }
    if (eventStyleIds.length === 0 && event.styleId) eventStyleIds = [event.styleId];

    const eventStyles = await prisma.style.findMany({
      where: { id: { in: eventStyleIds }, clientId },
      select: { id: true, name: true, beltConfig: true },
    });
    const styleById = new Map(eventStyles.map((s) => [s.id, s]));

    // Pick the participants to promote based on the mode.
    const participants = event.participants.filter((p) => {
      if (p.status !== "REGISTERED") return false;
      if (mode === "auto" && p.autoPromote === false) return false;
      return true;
    });

    if (participants.length === 0) {
      // Still mark the event finished so manual button can close out an
      // empty event cleanly (it counts as "ran with no one to promote").
      await prisma.promotionEvent.update({
        where: { id: event.id },
        data: { status: "COMPLETED", finishedAt: event.finishedAt ?? new Date() },
      });
      return NextResponse.json({ results: [], finished: true });
    }

    // Load members with stylesNotes so we can resolve per-style current
    // rank in one shot instead of N round-trips.
    const memberIds = participants.map((p) => p.memberId);
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds }, clientId },
      select: {
        id: true,
        stylesNotes: true,
        rank: true,
        primaryStyle: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: { membershipPlan: { select: { allowedStyles: true } } },
        },
      },
    });
    const stylesByMember = new Map<string, StyleEntry[]>();
    const memberById = new Map(members.map((m) => [m.id, m]));
    // Style ids each member's active plans cover -- the same rule the
    // event roster uses to put a member in a style section.
    const planStylesByMember = new Map<string, Set<string>>();
    for (const m of members) {
      const set = new Set<string>();
      for (const ms of m.memberships) {
        try {
          const arr = JSON.parse(ms.membershipPlan?.allowedStyles || "[]");
          if (Array.isArray(arr)) arr.forEach((x) => typeof x === "string" && set.add(x));
        } catch { /* ignore */ }
      }
      planStylesByMember.set(m.id, set);
    }
    for (const m of members) {
      let arr: StyleEntry[] = [];
      if (m.stylesNotes) {
        try { arr = JSON.parse(m.stylesNotes) || []; } catch { arr = []; }
      }
      stylesByMember.set(m.id, arr);
    }

    const results: Array<{
      participantId: string;
      memberId: string;
      promoted: Array<{ styleId: string; toRank: string }>;
      errors: Array<{ styleId: string; error: string }>;
      skipped?: string;
    }> = [];

    const eventStyleNamesLower = new Set(eventStyles.map((s) => s.name.toLowerCase()));

    for (const p of participants) {
      const styleEntries = stylesByMember.get(p.memberId) || [];
      const memberRow = memberById.get(p.memberId);
      const planStyles = planStylesByMember.get(p.memberId) || new Set<string>();
      const promoted: Array<{ styleId: string; toRank: string }> = [];
      const errors: Array<{ styleId: string; error: string }> = [];
      const skipReasons: string[] = [];
      // member.rank may stand in for at most one style per member.
      let usedMemberRankFallback = false;

      for (const styleId of eventStyleIds) {
        const style = styleById.get(styleId);
        if (!style || !style.beltConfig) continue;

        let parsed: { ranks?: BeltConfigRank[] } = {};
        try { parsed = JSON.parse(style.beltConfig); } catch { continue; }
        const ranks = (parsed.ranks || []).slice().sort((a, b) => a.order - b.order);
        const styleLower = style.name.toLowerCase();

        // Current rank in this style. Prefer the member's stylesNotes entry
        // for this style (case-insensitive name match).
        const entry = styleEntries.find(
          (e) => (e.name || "").toLowerCase() === styleLower,
        );
        if (entry && entry.active === false) continue;
        let currentRankName: string | null = entry?.rank || null;

        // Fallback: no stylesNotes entry for this style, but the member is
        // in the style through their plan (or it's their primary style) --
        // the roster shows them under this style using member.rank, so use
        // it here too, as long as that belt actually exists in this style.
        // Skipped when member.rank belongs to a different event style the
        // member has its own entry for (avoids double-promoting).
        if (!currentRankName && memberRow?.rank && !usedMemberRankFallback) {
          const primaryLower = (memberRow.primaryStyle || "").toLowerCase();
          const tiedToStyle = primaryLower === styleLower || planStyles.has(style.id);
          const primaryIsOtherEventStyle =
            !!primaryLower && primaryLower !== styleLower && eventStyleNamesLower.has(primaryLower) &&
            styleEntries.some((e) => (e.name || "").toLowerCase() === primaryLower && e.rank);
          const rankInStyle = ranks.some((r) => rankKey(r.name) === rankKey(memberRow.rank));
          if (tiedToStyle && rankInStyle && !primaryIsOtherEventStyle) {
            currentRankName = memberRow.rank;
            usedMemberRankFallback = true;
          }
        }

        if (!currentRankName) {
          if (planStyles.has(style.id)) skipReasons.push(`${style.name}: no current belt on file`);
          continue;
        }

        const currentIdx = ranks.findIndex(
          (r) => rankKey(r.name) === rankKey(currentRankName), // "WHITE" matches "White Belt"
        );
        if (currentIdx < 0) {
          skipReasons.push(`${style.name}: belt "${currentRankName}" isn't in this style's belt list`);
          continue;
        }
        if (currentIdx >= ranks.length - 1) {
          skipReasons.push(`${style.name}: already at the top belt`);
          continue;
        }
        const nextRank = ranks[currentIdx + 1];

        const input: PromoteInput = {
          memberId: p.memberId,
          styleId: style.id,
          fromRank: currentRankName,
          toRank: nextRank.name,
          date: event.date.toISOString(),
          paymentMethod,
          // Per-member override overrides the plan-computed fee. null →
          // applyOnePromotion uses computePromotionFee's default for this
          // (member, style).
          costOverrideCents: p.feeOverrideCents ?? undefined,
        };

        try {
          const { promotion, error } = await applyOnePromotion(input, clientId);
          if (error || !promotion) {
            errors.push({ styleId, error: error || "Unknown error" });
          } else {
            promoted.push({ styleId, toRank: nextRank.name });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          errors.push({ styleId, error: msg });
        }
      }

      // Mark the participant as PROMOTED when at least one style went
      // through. If everything errored, leave them REGISTERED so admin
      // can investigate and retry.
      if (promoted.length > 0) {
        await prisma.promotionParticipant.update({
          where: { id: p.id },
          data: {
            status: "PROMOTED",
            feeCharged: true,
            promotedAt: event.date,
          },
        });
      }

      results.push({
        participantId: p.id,
        memberId: p.memberId,
        promoted,
        errors,
        ...(promoted.length === 0 && errors.length === 0
          ? { skipped: skipReasons.join("; ") || "not enrolled in any of this event's styles" }
          : {}),
      });
    }

    // Mark the event finished regardless — the per-participant results
    // surface any failures so admin sees them in the response.
    await prisma.promotionEvent.update({
      where: { id: event.id },
      data: { status: "COMPLETED", finishedAt: event.finishedAt ?? new Date() },
    });

    return NextResponse.json({ results, finished: true });
  } catch (err) {
    console.error("POST /api/promotion-events/[id]/finish error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to finish event: ${msg}` }, { status: 500 });
  }
}
