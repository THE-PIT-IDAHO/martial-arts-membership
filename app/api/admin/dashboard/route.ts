import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalGyms,
      totalMembers,
      totalUsers,
      newGymsThisWeek,
      newGymsThisMonth,
      newMembersThisWeek,
      signupLinks,
      clients,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.member.count(),
      prisma.user.count(),
      prisma.client.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.client.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.member.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.signupLink.findMany({
        select: { useCount: true },
      }),
      prisma.client.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          trialExpiresAt: true,
          isPlatformAdmin: true,
          createdAt: true,
          _count: { select: { members: true, users: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalSignups = signupLinks.reduce((sum, l) => sum + l.useCount, 0);
    const activeTrials = clients.filter(c => c.trialExpiresAt && new Date(c.trialExpiresAt) > now && !c.isPlatformAdmin).length;
    const expiredTrials = clients.filter(c => c.trialExpiresAt && new Date(c.trialExpiresAt) <= now).length;
    const gymClients = clients.filter(c => !c.isPlatformAdmin);

    return NextResponse.json({
      stats: {
        totalGyms: gymClients.length,
        totalMembers,
        totalUsers,
        newGymsThisWeek,
        newGymsThisMonth,
        newMembersThisWeek,
        totalSignups,
        activeTrials,
        expiredTrials,
        activeLinks: signupLinks.length,
      },
      recentGyms: gymClients.slice(0, 10),
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
