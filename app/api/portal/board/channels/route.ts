import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

interface ChannelVisibility {
  type: "all" | "styles" | "ranks" | "statuses" | "specific";
  styleIds?: string[];
  rankIds?: string[];
  statuses?: string[];
  memberIds?: string[];
}

// GET /api/portal/board/channels — list channels visible to this member
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Fetch member profile with their styles and memberships
    const member = await prisma.member.findUnique({
      where: { id: auth.memberId },
      select: {
        id: true,
        primaryStyle: true,
        rank: true,
        status: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            membershipPlan: {
              select: { allowedStyles: true },
            },
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Build set of style IDs this member is actually enrolled in
    const styles = await prisma.style.findMany({ select: { id: true, name: true } });
    const memberStyleIds = new Set<string>();

    // Match by primaryStyle name — this is the member's actual training style
    if (member.primaryStyle) {
      // primaryStyle may contain multiple styles separated by commas or " / "
      const styleNames = member.primaryStyle.split(/[,\/]/).map((s) => s.trim().toLowerCase());
      for (const sName of styleNames) {
        const match = styles.find((s) => s.name.toLowerCase() === sName);
        if (match) memberStyleIds.add(match.id);
      }
    }

    // Match by membership plan allowedStyles — but only when explicitly set
    // (null means "all classes allowed" which is a billing concern, not style enrollment)
    for (const ms of member.memberships) {
      const allowed = ms.membershipPlan.allowedStyles;
      if (allowed) {
        try {
          const arr = JSON.parse(allowed);
          if (Array.isArray(arr)) {
            for (const sid of arr) memberStyleIds.add(sid);
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // Build set of rank IDs this member holds
    const memberRankIds = new Set<string>();
    if (member.rank) {
      // rank is stored as a name string — find matching rank records
      const matchingRanks = await prisma.rank.findMany({
        where: { name: member.rank },
        select: { id: true },
      });
      for (const r of matchingRanks) memberRankIds.add(r.id);
    }

    // Fetch all channels
    const channels = await prisma.boardChannel.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { posts: true, polls: true } },
      },
    });

    // Filter by visibility
    const visibleChannels = channels.filter((ch) => {
      if (!ch.visibility) return true; // no visibility set = visible to all

      let vis: ChannelVisibility;
      try {
        vis = JSON.parse(ch.visibility);
      } catch {
        return true; // invalid JSON = visible to all
      }

      switch (vis.type) {
        case "all":
          return true;

        case "styles":
          if (!vis.styleIds || vis.styleIds.length === 0) return true;
          return vis.styleIds.some((sid) => memberStyleIds.has(sid));

        case "ranks":
          if (!vis.rankIds || vis.rankIds.length === 0) return true;
          return vis.rankIds.some((rid) => memberRankIds.has(rid));

        case "statuses":
          if (!vis.statuses || vis.statuses.length === 0) return true;
          return vis.statuses.includes(member.status);

        case "specific":
          if (!vis.memberIds || vis.memberIds.length === 0) return true;
          return vis.memberIds.includes(member.id);

        default:
          return true;
      }
    });

    return NextResponse.json({ channels: visibleChannels });
  } catch (error) {
    console.error("Error fetching portal board channels:", error);
    return NextResponse.json({ error: "Failed to load channels" }, { status: 500 });
  }
}
