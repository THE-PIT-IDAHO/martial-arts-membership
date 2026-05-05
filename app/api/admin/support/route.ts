import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { ticketId, status, reply } = await req.json();
    if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

    if (reply) {
      await prisma.supportReply.create({
        data: { ticketId, authorName: "Platform Admin", content: reply, isStaff: true },
      });
    }

    if (status) {
      await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
