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
// Payment method defaults to "ACCOUNT" so members are charged against
// their stored credit (matches the existing legacy /charge endpoint
// default). Failures don't roll back successful promotions — the route
// returns a per-participant result array so admin can retry the failures.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
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
    if (event.finishedAt) {
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
        data: { status: "COMPLETED", finishedAt: new Date() },
      });
      return NextResponse.json({ results: [], finished: true });
    }

    // Load members with stylesNotes so we can resolve per-style current
    // rank in one shot instead of N round-trips.
    const memberIds = participants.map((p) => p.memberId);
    const members = await prisma.member.findMany({
      where: { id: { in: memberIds }, clientId },
      select: { id: true, stylesNotes: true },
    });
    const stylesByMember = new Map<string, StyleEntry[]>();
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
    }> = [];

    for (const p of participants) {
      const styleEntries = stylesByMember.get(p.memberId) || [];
      const promoted: Array<{ styleId: string; toRank: string }> = [];
      const errors: Array<{ styleId: string; error: string }> = [];

      for (const styleId of eventStyleIds) {
        const style = styleById.get(styleId);
        if (!style || !style.beltConfig) continue;

        // Find this style's entry in the member's stylesNotes (case-
        // insensitive name match). Skip if the member isn't enrolled.
        const entry = styleEntries.find(
          (e) => (e.name || "").toLowerCase() === style.name.toLowerCase(),
        );
        if (!entry || entry.active === false || !entry.rank) continue;

        // Look up the next rank from beltConfig.
        let parsed: { ranks?: BeltConfigRank[] } = {};
        try { parsed = JSON.parse(style.beltConfig); } catch { continue; }
        const ranks = (parsed.ranks || []).slice().sort((a, b) => a.order - b.order);
        const currentIdx = ranks.findIndex(
          (r) => r.name.toLowerCase() === entry.rank!.toLowerCase(),
        );
        if (currentIdx < 0 || currentIdx >= ranks.length - 1) continue;
        const nextRank = ranks[currentIdx + 1];

        const input: PromoteInput = {
          memberId: p.memberId,
          styleId: style.id,
          fromRank: entry.rank,
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

      results.push({ participantId: p.id, memberId: p.memberId, promoted, errors });
    }

    // Mark the event finished regardless — the per-participant results
    // surface any failures so admin sees them in the response.
    await prisma.promotionEvent.update({
      where: { id: event.id },
      data: { status: "COMPLETED", finishedAt: new Date() },
    });

    return NextResponse.json({ results, finished: true });
  } catch (err) {
    console.error("POST /api/promotion-events/[id]/finish error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to finish event: ${msg}` }, { status: 500 });
  }
}
