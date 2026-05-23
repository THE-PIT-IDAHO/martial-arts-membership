// /api/members/[id]/discounts — per-member discount CRUD.
// All ops tenant-scoped through the parent member's clientId.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

const VALID_SCOPES = new Set(["POS", "MEMBERSHIP", "PROMOTION", "ALL"]);

async function verifyMember(memberId: string, clientId: string) {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, clientId: true },
  });
  if (!m || m.clientId !== clientId) return null;
  return m;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyMember(id, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    const discounts = await prisma.memberDiscount.findMany({
      where: { memberId: id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ discounts });
  } catch (err) {
    console.error("GET discounts error:", err);
    return NextResponse.json({ error: "Failed to load discounts" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyMember(id, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const body = await req.json();
    const { label, appliesTo, percentOff, flatCents, oneTime } = body;

    if (!VALID_SCOPES.has(appliesTo)) {
      return NextResponse.json({ error: "Invalid appliesTo" }, { status: 400 });
    }
    const percent = percentOff === "" || percentOff == null ? null : Number(percentOff);
    const flat = flatCents === "" || flatCents == null ? null : Number(flatCents);
    if ((percent == null || isNaN(percent)) && (flat == null || isNaN(flat))) {
      return NextResponse.json(
        { error: "Provide percentOff or flatCents" },
        { status: 400 },
      );
    }
    if (percent != null && (percent < 0 || percent > 100)) {
      return NextResponse.json({ error: "percentOff must be 0-100" }, { status: 400 });
    }
    if (flat != null && flat < 0) {
      return NextResponse.json({ error: "flatCents must be >= 0" }, { status: 400 });
    }

    const discount = await prisma.memberDiscount.create({
      data: {
        memberId: id,
        clientId,
        label: typeof label === "string" && label.trim() ? label.trim() : null,
        appliesTo,
        percentOff: percent ?? null,
        flatCents: flat ?? null,
        oneTime: !!oneTime,
      },
    });
    return NextResponse.json({ discount }, { status: 201 });
  } catch (err) {
    console.error("POST discount error:", err);
    return NextResponse.json({ error: "Failed to create discount" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;
    if (!(await verifyMember(id, clientId))) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    const { searchParams } = new URL(req.url);
    const discountId = searchParams.get("discountId");
    if (!discountId) {
      return NextResponse.json({ error: "discountId required" }, { status: 400 });
    }
    const existing = await prisma.memberDiscount.findUnique({
      where: { id: discountId },
      select: { memberId: true },
    });
    if (!existing || existing.memberId !== id) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }
    await prisma.memberDiscount.delete({ where: { id: discountId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE discount error:", err);
    return NextResponse.json({ error: "Failed to delete discount" }, { status: 500 });
  }
}
