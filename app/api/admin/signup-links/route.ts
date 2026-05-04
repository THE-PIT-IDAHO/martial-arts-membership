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
    const { maxMembers, maxStyles, trialMonths, expiresInDays, note } = await req.json();

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const link = await prisma.signupLink.create({
      data: {
        maxMembers: parseInt(maxMembers) || 10,
        maxStyles: parseInt(maxStyles) || 3,
        trialMonths: parseInt(trialMonths) || 3,
        expiresAt,
        note: note?.trim() || null,
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
