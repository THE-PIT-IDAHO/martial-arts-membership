import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const clients = await prisma.client.findMany({
      where: { isPlatformAdmin: false },
      select: {
        id: true, name: true, slug: true, trialExpiresAt: true, createdAt: true,
        _count: {
          select: {
            members: true, users: true, classSessions: true, membershipPlans: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Get style counts per client
    const styleCounts = await prisma.style.groupBy({ by: ["clientId"], _count: true });
    const styleMap = new Map(styleCounts.map(s => [s.clientId, s._count]));

    const usage = clients.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      trialExpiresAt: c.trialExpiresAt,
      createdAt: c.createdAt,
      members: c._count.members,
      users: c._count.users,
      classes: c._count.classSessions,
      membershipPlans: c._count.membershipPlans,
      styles: styleMap.get(c.id) || 0,
    }));

    return NextResponse.json({ usage });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
