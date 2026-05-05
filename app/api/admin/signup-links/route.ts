import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/signup-links — list all signup links
export async function GET() {
  try {
    const links = await prisma.signupLink.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ links });
  } catch (error) {
    console.error("Error fetching signup links:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST /api/admin/signup-links — create a new signup link
export async function POST(req: Request) {
  try {
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
        trialMonths: body.trialMonths !== undefined && body.trialMonths !== "" ? parseInt(body.trialMonths) || 0 : 0,
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

// PATCH /api/admin/signup-links — update a signup link
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const parse = (v: unknown, def: number) => v !== undefined && v !== "" ? parseInt(String(v)) || def : undefined;
    const data: Record<string, unknown> = {};

    if (fields.maxMembers !== undefined) data.maxMembers = parse(fields.maxMembers, 10);
    if (fields.maxStyles !== undefined) data.maxStyles = parse(fields.maxStyles, 3);
    if (fields.maxRanksPerStyle !== undefined) data.maxRanksPerStyle = parse(fields.maxRanksPerStyle, 10);
    if (fields.maxMembershipPlans !== undefined) data.maxMembershipPlans = parse(fields.maxMembershipPlans, 3);
    if (fields.maxClasses !== undefined) data.maxClasses = parse(fields.maxClasses, 5);
    if (fields.maxUsers !== undefined) data.maxUsers = parse(fields.maxUsers, 2);
    if (fields.maxLocations !== undefined) data.maxLocations = parse(fields.maxLocations, 1);
    if (fields.maxReports !== undefined) data.maxReports = parse(fields.maxReports, 3);
    if (fields.maxPOSItems !== undefined) data.maxPOSItems = parse(fields.maxPOSItems, 10);
    if (fields.trialMonths !== undefined) data.trialMonths = fields.trialMonths !== "" ? parseInt(fields.trialMonths) || 0 : 0;
    if (fields.note !== undefined) data.note = fields.note?.trim() || null;
    if (fields.active !== undefined) data.active = fields.active;

    const link = await prisma.signupLink.update({ where: { id }, data });
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Error updating signup link:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE /api/admin/signup-links — delete a signup link
export async function DELETE(req: Request) {
  try {
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
