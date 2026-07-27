import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";

// GET /api/admin/signup-links — list all signup links (OWNER only)
export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const links = await prisma.signupLink.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ links });
  } catch (error) {
    console.error("Error fetching signup links:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST /api/admin/signup-links — create a new signup link (OWNER only)
export async function POST(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const parse = (v: unknown, def: number) => v !== undefined && v !== "" ? parseInt(String(v)) || def : def;

    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + parseInt(body.expiresInDays) * 24 * 60 * 60 * 1000)
      : null;

    const link = await prisma.signupLink.create({
      data: {
        maxMembers: parse(body.maxMembers, 10),
        maxStyles: parse(body.maxStyles, 3),
        maxRanksPerStyle: parse(body.maxRanksPerStyle, 10),
        maxMembershipPlans: parse(body.maxMembershipPlans, 3),
        maxClasses: parse(body.maxClasses, 5),
        maxUsers: parse(body.maxUsers, 2),
        maxLocations: parse(body.maxLocations, 1),
        maxReports: parse(body.maxReports, 3),
        maxPOSItems: parse(body.maxPOSItems, 10),
        allowStripe: body.allowStripe || false,
        allowPaypal: body.allowPaypal || false,
        allowSquare: body.allowSquare || false,
        priceCents: body.priceCents !== undefined && body.priceCents !== "" ? parseInt(body.priceCents) || 0 : 0,
        trialMonths: body.trialMonths !== undefined && body.trialMonths !== "" ? parseInt(body.trialMonths) || 0 : 0,
        // grantsTierId: which invite-only tier gyms created via this
        // link get added to their grantedTierIds. The admin UI passes
        // the picked tier's id here iff that tier was invite-only.
        grantsTierId: body.grantsTierId || null,
        expiresAt,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("Error creating signup link:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

// PATCH /api/admin/signup-links — update a signup link (OWNER only)
export async function PATCH(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Blank / missing / non-positive means "unlimited" (999999),
    // matching the POST handler + the edit form's blank-placeholder
    // UX. The old behavior returned undefined for blank input which
    // Prisma treats as skip, so you couldn't CLEAR a limit to make
    // a link unlimited from the edit form.
    const asLimit = (raw: unknown): number => {
      if (raw === undefined || raw === null || raw === "") return 999999;
      const n = parseInt(String(raw));
      return Number.isFinite(n) && n > 0 ? n : 999999;
    };
    const data: Record<string, unknown> = {};

    if (fields.maxMembers !== undefined) data.maxMembers = asLimit(fields.maxMembers);
    if (fields.maxStyles !== undefined) data.maxStyles = asLimit(fields.maxStyles);
    if (fields.maxRanksPerStyle !== undefined) data.maxRanksPerStyle = asLimit(fields.maxRanksPerStyle);
    if (fields.maxMembershipPlans !== undefined) data.maxMembershipPlans = asLimit(fields.maxMembershipPlans);
    if (fields.maxClasses !== undefined) data.maxClasses = asLimit(fields.maxClasses);
    if (fields.maxUsers !== undefined) data.maxUsers = asLimit(fields.maxUsers);
    if (fields.maxLocations !== undefined) data.maxLocations = asLimit(fields.maxLocations);
    if (fields.maxReports !== undefined) data.maxReports = asLimit(fields.maxReports);
    if (fields.maxPOSItems !== undefined) data.maxPOSItems = asLimit(fields.maxPOSItems);
    if (fields.trialMonths !== undefined) data.trialMonths = fields.trialMonths !== "" ? parseInt(fields.trialMonths) || 0 : 0;
    if (fields.grantsTierId !== undefined) data.grantsTierId = fields.grantsTierId || null;
    if (fields.note !== undefined) data.note = fields.note?.trim() || null;
    if (fields.active !== undefined) data.active = fields.active;

    const link = await prisma.signupLink.update({ where: { id }, data });
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Error updating signup link:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE /api/admin/signup-links — delete a signup link (OWNER only)
export async function DELETE(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.signupLink.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting signup link:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
