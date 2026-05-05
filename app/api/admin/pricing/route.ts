import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const tiers = await prisma.pricingTier.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json({ tiers });
  } catch (error) {
    console.error("Error fetching pricing tiers:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const count = await prisma.pricingTier.count();

    const tier = await prisma.pricingTier.create({
      data: {
        name: body.name || "New Tier",
        description: body.description || null,
        priceCents: parseInt(body.priceCents) || 0,
        billingPeriod: body.billingPeriod || "monthly",
        maxMembers: body.maxMembers !== undefined && body.maxMembers !== "" ? parseInt(body.maxMembers) : 999999,
        maxStyles: body.maxStyles !== undefined && body.maxStyles !== "" ? parseInt(body.maxStyles) : 999999,
        maxRanksPerStyle: body.maxRanksPerStyle !== undefined && body.maxRanksPerStyle !== "" ? parseInt(body.maxRanksPerStyle) : 999999,
        maxMembershipPlans: body.maxMembershipPlans !== undefined && body.maxMembershipPlans !== "" ? parseInt(body.maxMembershipPlans) : 999999,
        maxClasses: body.maxClasses !== undefined && body.maxClasses !== "" ? parseInt(body.maxClasses) : 999999,
        maxUsers: body.maxUsers !== undefined && body.maxUsers !== "" ? parseInt(body.maxUsers) : 999999,
        maxLocations: body.maxLocations !== undefined && body.maxLocations !== "" ? parseInt(body.maxLocations) : 999999,
        maxReports: body.maxReports !== undefined && body.maxReports !== "" ? parseInt(body.maxReports) : 999999,
        maxPOSItems: body.maxPOSItems !== undefined && body.maxPOSItems !== "" ? parseInt(body.maxPOSItems) : 999999,
        allowStripe: body.allowStripe || false,
        allowPaypal: body.allowPaypal || false,
        allowSquare: body.allowSquare || false,
        sortOrder: count,
      },
    });

    return NextResponse.json({ tier }, { status: 201 });
  } catch (error) {
    console.error("Error creating pricing tier:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.description !== undefined) data.description = fields.description || null;
    if (fields.priceCents !== undefined) data.priceCents = parseInt(fields.priceCents) || 0;
    if (fields.billingPeriod !== undefined) data.billingPeriod = fields.billingPeriod;
    if (fields.maxMembers !== undefined) data.maxMembers = parseInt(fields.maxMembers) || 10;
    if (fields.maxStyles !== undefined) data.maxStyles = parseInt(fields.maxStyles) || 3;
    if (fields.maxRanksPerStyle !== undefined) data.maxRanksPerStyle = parseInt(fields.maxRanksPerStyle) || 10;
    if (fields.maxMembershipPlans !== undefined) data.maxMembershipPlans = parseInt(fields.maxMembershipPlans) || 3;
    if (fields.maxClasses !== undefined) data.maxClasses = parseInt(fields.maxClasses) || 5;
    if (fields.maxUsers !== undefined) data.maxUsers = parseInt(fields.maxUsers) || 2;
    if (fields.maxLocations !== undefined) data.maxLocations = parseInt(fields.maxLocations) || 1;
    if (fields.maxReports !== undefined) data.maxReports = parseInt(fields.maxReports) || 3;
    if (fields.maxPOSItems !== undefined) data.maxPOSItems = parseInt(fields.maxPOSItems) || 10;
    if (fields.allowStripe !== undefined) data.allowStripe = !!fields.allowStripe;
    if (fields.allowPaypal !== undefined) data.allowPaypal = !!fields.allowPaypal;
    if (fields.allowSquare !== undefined) data.allowSquare = !!fields.allowSquare;
    if (fields.isActive !== undefined) data.isActive = !!fields.isActive;
    if (fields.sortOrder !== undefined) data.sortOrder = parseInt(fields.sortOrder) || 0;

    const tier = await prisma.pricingTier.update({ where: { id }, data });
    return NextResponse.json({ tier });
  } catch (error) {
    console.error("Error updating pricing tier:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.pricingTier.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pricing tier:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
