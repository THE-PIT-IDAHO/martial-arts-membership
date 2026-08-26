import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

/**
 * MemberDiscount CRUD for a single member. All routes are tenant-
 * scoped: the member must live at this gym before we return / mutate
 * any of their discount rows.
 */
type Params = { params: Promise<{ id: string }> };

async function requireMember(memberId: string, clientId: string) {
  const m = await prisma.member.findFirst({
    where: { id: memberId, clientId },
    select: { id: true },
  });
  return m;
}

function normalizeScope(input: unknown): string | null {
  if (typeof input !== "string") return null;
  return ["POS", "MEMBERSHIP", "PROMOTION", "ALL"].includes(input) ? input : null;
}

// GET /api/members/[id]/discounts
//
// `?includeInactive=1` returns EVERY row -- the member profile needs
// this so the on/off toggle can render disabled discounts too. Without
// that flag we only return active rows (what POS + billing preview
// callers actually want).
export async function GET(req: Request, { params }: Params) {
  try {
    const clientId = await getClientId(req);
    const { id: memberId } = await params;
    const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1";

    if (!(await requireMember(memberId, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const rows = await prisma.memberDiscount.findMany({
      where: { memberId, ...(includeInactive ? {} : { active: true }) },
      select: {
        id: true,
        label: true,
        appliesTo: true,
        percentOff: true,
        flatCents: true,
        oneTime: true,
        active: true,
        usedAt: true,
        templateId: true,
        membershipId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ discounts: rows });
  } catch (err) {
    console.error("[members/[id]/discounts] GET fatal:", err);
    return NextResponse.json({ error: "Failed to load discounts" }, { status: 500 });
  }
}

// POST /api/members/[id]/discounts
//
// Body: { label?, appliesTo, percentOff?, flatCents?, oneTime?,
// templateId? }. Either percentOff or flatCents must be set. If
// templateId is provided we record it (for "how many members use
// Family Discount" lookups later); the template's OWN values are not
// re-read here -- the client already prefilled the form from the
// template, and the operator may have tweaked them.
export async function POST(req: Request, { params }: Params) {
  try {
    const clientId = await getClientId(req);
    const { id: memberId } = await params;
    if (!(await requireMember(memberId, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const body = await req.json();
    const scope = normalizeScope(body?.appliesTo);
    if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 400 });

    const percentOff = body?.percentOff != null && Number(body.percentOff) !== 0 ? Number(body.percentOff) : null;
    const flatCents = body?.flatCents != null && Number(body.flatCents) !== 0 ? Math.round(Number(body.flatCents)) : null;
    if (percentOff == null && flatCents == null) {
      return NextResponse.json({ error: "Enter a percent or flat amount" }, { status: 400 });
    }

    // Optional template link: only accept a templateId that belongs to
    // this tenant. Silently drop it if a caller passed something bogus
    // rather than 400-ing -- the template link is purely informational.
    let templateId: string | null = null;
    if (typeof body?.templateId === "string" && body.templateId) {
      const t = await prisma.discountTemplate.findFirst({
        where: { id: body.templateId, clientId },
        select: { id: true },
      });
      if (t) templateId = t.id;
    }

    // Optional per-membership scope: the discount ONLY applies when
    // that specific membership is being billed. Verify the membership
    // belongs to THIS member + tenant so a hand-crafted POST can't
    // scope a discount to another gym's membership.
    let membershipId: string | null = null;
    if (typeof body?.membershipId === "string" && body.membershipId) {
      const ms = await prisma.membership.findFirst({
        where: { id: body.membershipId, memberId, member: { clientId } },
        select: { id: true },
      });
      if (!ms) {
        return NextResponse.json({ error: "Membership not found on this member" }, { status: 400 });
      }
      membershipId = ms.id;
    }

    const discount = await prisma.memberDiscount.create({
      data: {
        memberId,
        clientId,
        label: body?.label ? String(body.label).trim() || null : null,
        appliesTo: scope,
        percentOff,
        flatCents,
        oneTime: !!body?.oneTime,
        active: body?.active !== false,
        templateId,
        membershipId,
      },
      select: {
        id: true,
        label: true,
        appliesTo: true,
        percentOff: true,
        flatCents: true,
        oneTime: true,
        active: true,
        usedAt: true,
        templateId: true,
        membershipId: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ discount }, { status: 201 });
  } catch (err) {
    console.error("[members/[id]/discounts] POST fatal:", err);
    return NextResponse.json({ error: "Failed to add discount" }, { status: 500 });
  }
}

// PATCH /api/members/[id]/discounts?discountId=xxx
//
// Currently only toggles `active` on/off (the profile's on/off switch).
// Body: { active: boolean }. Extend here if we ever need in-place
// edits of percent / flat / scope from the profile.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const clientId = await getClientId(req);
    const { id: memberId } = await params;
    if (!(await requireMember(memberId, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const discountId = new URL(req.url).searchParams.get("discountId");
    if (!discountId) return NextResponse.json({ error: "discountId required" }, { status: 400 });

    // Tenant + ownership: the row has to belong to this member.
    const existing = await prisma.memberDiscount.findFirst({
      where: { id: discountId, memberId, clientId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Discount not found" }, { status: 404 });

    const body = await req.json();
    const patch: { active?: boolean } = {};
    if (typeof body?.active === "boolean") patch.active = body.active;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.memberDiscount.update({
      where: { id: discountId },
      data: patch,
      select: {
        id: true,
        label: true,
        appliesTo: true,
        percentOff: true,
        flatCents: true,
        oneTime: true,
        active: true,
        usedAt: true,
        templateId: true,
        membershipId: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ discount: updated });
  } catch (err) {
    console.error("[members/[id]/discounts] PATCH fatal:", err);
    return NextResponse.json({ error: "Failed to update discount" }, { status: 500 });
  }
}

// DELETE /api/members/[id]/discounts?discountId=xxx
export async function DELETE(req: Request, { params }: Params) {
  try {
    const clientId = await getClientId(req);
    const { id: memberId } = await params;
    if (!(await requireMember(memberId, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    const discountId = new URL(req.url).searchParams.get("discountId");
    if (!discountId) return NextResponse.json({ error: "discountId required" }, { status: 400 });

    const existing = await prisma.memberDiscount.findFirst({
      where: { id: discountId, memberId, clientId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Discount not found" }, { status: 404 });

    await prisma.memberDiscount.delete({ where: { id: discountId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[members/[id]/discounts] DELETE fatal:", err);
    return NextResponse.json({ error: "Failed to delete discount" }, { status: 500 });
  }
}
