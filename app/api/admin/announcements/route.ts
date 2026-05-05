import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const announcements = await prisma.platformAnnouncement.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ announcements });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { title, content, type } = await req.json();
    if (!title || !content) return NextResponse.json({ error: "Title and content required" }, { status: 400 });
    const announcement = await prisma.platformAnnouncement.create({
      data: { title, content, type: type || "info" },
    });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id, isActive } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const announcement = await prisma.platformAnnouncement.update({
      where: { id }, data: { isActive },
    });
    return NextResponse.json({ announcement });
  } catch (error) {
    console.error("Error:", error);
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
    await prisma.platformAnnouncement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
