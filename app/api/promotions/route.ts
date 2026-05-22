// /api/promotions
//   GET  → list Promotion records (history; optional memberId filter)
//   POST → record one or more promotions (single = quick promote, array =
//          bulk promote). Each item: { memberId, styleId, toRank, date?,
//          testResult?, paymentMethod?, notes?, costOverrideCents? }.
//
// Side effects per promotion:
//   - Computes the fee (per-member > per-style > global, then plan discount)
//   - Creates a POSTransaction line item "Promotion: <rank>" with the fee
//   - Decrements member.accountCreditCents if paymentMethod is ACCOUNT
//   - Updates the member's stylesNotes: bumps rank, sets lastPromotionDate,
//     resets attendanceResetDate for that style (so progress restarts from
//     today against the new next-rank's requirements)
//   - Returns the created Promotion rows
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { computePromotionFee } from "@/lib/promotion-fee";

export type PromoteInput = {
  memberId: string;
  styleId: string;
  toRank: string;
  fromRank?: string | null;
  date?: string | null;       // ISO or yyyy-mm-dd
  testResult?: "PASSED" | "FAILED" | null;
  paymentMethod?: string;     // "CARD" | "CASH" | "ACCOUNT" | etc.
  notes?: string;
  costOverrideCents?: number | null; // admin can override final cost in modal
};

type StyleEntry = {
  name: string;
  rank?: string;
  startDate?: string;
  lastPromotionDate?: string;
  attendanceResetDate?: string;
  active?: boolean;
};

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function applyOnePromotion(
  input: PromoteInput,
  clientId: string,
): Promise<{ promotion: any | null; error?: string }> {
  // Resolve member + style and verify they belong to this tenant.
  const [member, style] = await Promise.all([
    prisma.member.findUnique({
      where: { id: input.memberId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        clientId: true,
        accountCreditCents: true,
        stylesNotes: true,
        primaryStyle: true,
        rank: true,
      },
    }),
    prisma.style.findUnique({
      where: { id: input.styleId },
      select: { id: true, name: true, clientId: true },
    }),
  ]);

  if (!member || member.clientId !== clientId) {
    return { promotion: null, error: `Member not found` };
  }
  if (!style || style.clientId !== clientId) {
    return { promotion: null, error: `Style not found` };
  }

  // Fee calc (admin can override via costOverrideCents in the modal).
  const fee = await computePromotionFee({
    memberId: member.id,
    styleId: style.id,
    clientId,
  });
  const finalCostCents =
    typeof input.costOverrideCents === "number" && input.costOverrideCents >= 0
      ? input.costOverrideCents
      : fee.costCents;

  const promotedAt = input.date ? new Date(input.date) : new Date();
  if (isNaN(promotedAt.getTime())) {
    return { promotion: null, error: "Invalid date" };
  }

  // Update stylesNotes: bump rank in the matching style entry, set
  // lastPromotionDate + attendanceResetDate to the promotion date so
  // progress toward the next rank starts fresh.
  let styles: StyleEntry[] = [];
  if (member.stylesNotes) {
    try { styles = JSON.parse(member.stylesNotes) || []; } catch { styles = []; }
  }
  const styleNameLower = style.name.toLowerCase();
  const dateStr = toLocalDateString(promotedAt);
  const idx = styles.findIndex((s) => (s.name || "").toLowerCase() === styleNameLower);
  let prevRank: string | null = null;
  if (idx >= 0) {
    prevRank = styles[idx].rank || null;
    styles[idx] = {
      ...styles[idx],
      rank: input.toRank,
      lastPromotionDate: dateStr,
      attendanceResetDate: dateStr,
      active: true,
    };
  } else {
    styles.push({
      name: style.name,
      rank: input.toRank,
      lastPromotionDate: dateStr,
      attendanceResetDate: dateStr,
      active: true,
    });
  }
  const fromRank = input.fromRank ?? prevRank;

  // POS transaction — created only when there's a cost. paymentStatus on
  // the Promotion is set based on what the admin selected (we don't actually
  // hit Stripe here; the existing POS POST handles that for CARD, but for
  // simplicity here we just record the sale and let staff verify the charge
  // separately).
  let posTransactionId: string | null = null;
  let paymentStatus: "PAID" | "UNPAID" | "CARD_FAILED" = "PAID";
  if (finalCostCents > 0) {
    const method = (input.paymentMethod || "CASH").toUpperCase();
    const txn = await prisma.pOSTransaction.create({
      data: {
        id: crypto.randomUUID(),
        transactionNumber: `PROMO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        clientId,
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        subtotalCents: finalCostCents,
        taxCents: 0,
        discountCents: fee.discountCents,
        totalCents: finalCostCents,
        paymentMethod: method,
        notes: `Promotion: ${input.toRank} (${style.name})`,
        updatedAt: new Date(),
        POSLineItem: {
          create: [{
            id: crypto.randomUUID(),
            itemName: `Promotion: ${input.toRank}`,
            type: "promotion",
            quantity: 1,
            unitPriceCents: finalCostCents,
            subtotalCents: finalCostCents,
          }],
        },
      },
    });
    posTransactionId = txn.id;

    // ACCOUNT method draws from the member's stored credit (can go negative).
    if (method === "ACCOUNT") {
      await prisma.member.update({
        where: { id: member.id },
        data: { accountCreditCents: { decrement: finalCostCents } },
      });
    }
    // CARD/CASH/CHECK assumed paid here. CARD_FAILED handling (auto-charge
    // declines → debit accountCreditCents) is wired in the dedicated POS
    // charge endpoint when that gets built; for the manual modal, admin
    // selects the actual outcome.
  }

  // Save the new stylesNotes + denormalized primaryStyle/rank if this is
  // the member's primary style.
  const memberUpdate: Record<string, unknown> = {
    stylesNotes: JSON.stringify(styles),
  };
  if (
    member.primaryStyle &&
    member.primaryStyle.toLowerCase() === styleNameLower
  ) {
    memberUpdate.rank = input.toRank;
  } else if (!member.primaryStyle) {
    memberUpdate.primaryStyle = style.name;
    memberUpdate.rank = input.toRank;
  }
  await prisma.member.update({ where: { id: member.id }, data: memberUpdate });

  // Reset IMPORTED attendance for this member (legacy behavior — when a
  // member is promoted, bulk-imported "catch-up" attendance is cleared
  // because progress restarts from the promotion date).
  await prisma.attendance.deleteMany({
    where: { memberId: member.id, source: "IMPORTED" },
  });

  const promotion = await prisma.promotion.create({
    data: {
      memberId: member.id,
      styleId: style.id,
      styleName: style.name,
      fromRank: fromRank ?? undefined,
      toRank: input.toRank,
      promotedAt,
      testResult: input.testResult ?? undefined,
      baseCostCents: fee.baseCostCents,
      discountCents: fee.discountCents,
      costCents: finalCostCents,
      discountSourcePlanId: fee.discountSourcePlanId ?? undefined,
      paymentStatus,
      paymentMethod: finalCostCents > 0 ? (input.paymentMethod || "CASH").toUpperCase() : undefined,
      posTransactionId: posTransactionId ?? undefined,
      notes: input.notes || undefined,
      clientId,
    },
  });

  return { promotion };
}

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");

    const promotions = await prisma.promotion.findMany({
      where: {
        clientId,
        ...(memberId ? { memberId } : {}),
      },
      orderBy: { promotedAt: "desc" },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        style: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ promotions });
  } catch (err) {
    console.error("GET /api/promotions error:", err);
    return NextResponse.json({ error: "Failed to load promotions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const items: PromoteInput[] = Array.isArray(body) ? body : [body];

    const results: Array<{ memberId: string; ok: boolean; promotion?: unknown; error?: string }> = [];
    for (const input of items) {
      try {
        const { promotion, error } = await applyOnePromotion(input, clientId);
        if (error) results.push({ memberId: input.memberId, ok: false, error });
        else results.push({ memberId: input.memberId, ok: true, promotion });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Promotion failed for member ${input.memberId}:`, err);
        results.push({ memberId: input.memberId, ok: false, error: msg });
      }
    }

    return NextResponse.json({ results }, { status: 201 });
  } catch (err) {
    console.error("POST /api/promotions error:", err);
    return NextResponse.json({ error: "Failed to create promotions" }, { status: 500 });
  }
}
