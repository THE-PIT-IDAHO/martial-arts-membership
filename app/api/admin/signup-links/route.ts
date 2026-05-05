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
        trialMonths: body.trialMonths !== undefined && body.trialMonths !== "" ? parseInt(body.trialMonths) || 0 : 3,
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
