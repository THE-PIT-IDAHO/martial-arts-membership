import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

/**
 * GET /api/members/[id]/discounts
 *
 * Returns every active MemberDiscount row on this member, across ALL
 * scopes (POS / MEMBERSHIP / PROMOTION / ALL). The POS UI uses this
 * to show discount previews on every cart line the moment a member is
 * attached to the sale, so the cashier isn't surprised by the total
 * at checkout.
 *
 * Rows are the raw stored values -- percent + flat + scope + oneTime.
 * The client re-computes the actual $ off against each cart line using
 * the same math as the server (lib/member-discounts.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientId = await getClientId(req);
    const { id: memberId } = await params;

    // Tenant guard: the member must live in this gym before we return
    // their discount rows.
    const member = await prisma.member.findFirst({
      where: { id: memberId, clientId },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const rows = await prisma.memberDiscount.findMany({
      where: { memberId, active: true },
      select: {
        id: true,
        label: true,
        appliesTo: true,
        percentOff: true,
        flatCents: true,
        oneTime: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ discounts: rows });
  } catch (err) {
    console.error("[members/[id]/discounts] fatal:", err);
    return NextResponse.json({ error: "Failed to load discounts" }, { status: 500 });
  }
}
