import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

interface ChannelVisibility {
  type: "all" | "styles" | "ranks" | "statuses" | "specific" | "combined";
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
    // Fetch member profile with their styles and memberships.
    // clientId is required to scope every downstream query — otherwise the
    // channels.findMany below pulls every gym's channels and only filters
    // by visibility rules, which exposes cross-tenant board data.
    const member = await prisma.member.findUnique({
      where: { id: auth.memberId },
      select: {
        id: true,
        clientId: true,
        primaryStyle: true,
        rank: true,
        status: true,
        // ALL memberships regardless of status -- broad vs active
        // enrollment is decided per-channel below.
        memberships: {
          select: {
            status: true,
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

    // Two style-id sets. See lib/portal-board-visibility.ts for the
    // active-vs-broad semantics: "styles" alone (or "combined"
    // WITHOUT an ACTIVE status filter) uses anyStyleIds; "combined"
    // WITH ACTIVE status uses activeStyleIds so per-style enrollment
    // is enforced.
    const activeStyleIds = new Set<string>();
    const anyStyleIds = new Set<string>();
    for (const ms of member.memberships) {
      const allowed = ms.membershipPlan.allowedStyles;
      if (!allowed) continue;
      try {
        const arr = JSON.parse(allowed);
        if (!Array.isArray(arr)) continue;
        for (const sid of arr) {
          anyStyleIds.add(sid);
          if (ms.status === "ACTIVE") activeStyleIds.add(sid);
        }
      } catch { /* ignore */ }
    }

    // primaryStyle name -> id feeds anyStyleIds only (no way to tell
    // if it's currently active).
    if (member.primaryStyle) {
      const styles = await prisma.style.findMany({
        where: { clientId: member.clientId },
        select: { id: true, name: true },
      });
      const names = member.primaryStyle.split(/[,\/]/).map((s) => s.trim().toLowerCase());
      for (const n of names) {
        const match = styles.find((s) => s.name.toLowerCase() === n);
        if (match) anyStyleIds.add(match.id);
      }
    }

    // Build set of rank IDs this member holds. Rank has no clientId
    // column of its own, but is scoped through its parent Style.
    const memberRankIds = new Set<string>();
    if (member.rank) {
      const matchingRanks = await prisma.rank.findMany({
        where: { name: member.rank, style: { clientId: member.clientId } },
        select: { id: true },
      });
      for (const r of matchingRanks) memberRankIds.add(r.id);
    }

    // Fetch this tenant's channels only.
    const channels = await prisma.boardChannel.findMany({
      where: { clientId: member.clientId },
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
          // Broad: any-status enrollment counts.
          if (!vis.styleIds || vis.styleIds.length === 0) return true;
          return vis.styleIds.some((sid) => anyStyleIds.has(sid));

        case "ranks":
          if (!vis.rankIds || vis.rankIds.length === 0) return true;
          return vis.rankIds.some((rid) => memberRankIds.has(rid));

        case "statuses":
          if (!vis.statuses || vis.statuses.length === 0) return true;
          return vis.statuses.includes(member.status);

        case "specific":
          // Empty memberIds = "nobody" (new-channel default in admin
          // UI). Undefined memberIds = legacy / hand-authored, fall
          // back to "everyone" for compat.
          if (!vis.memberIds) return true;
          return vis.memberIds.includes(member.id);

        case "combined": {
          // See lib/portal-board-visibility.ts for the shared rule.
          if (vis.styleIds !== undefined) {
            const requireActiveEnrollment =
              !!vis.statuses && vis.statuses.includes("ACTIVE");
            const pool = requireActiveEnrollment ? activeStyleIds : anyStyleIds;
            if (!vis.styleIds.some((sid) => pool.has(sid))) return false;
          }
          if (vis.rankIds !== undefined && !vis.rankIds.some((rid) => memberRankIds.has(rid))) return false;
          if (vis.statuses !== undefined && !vis.statuses.includes(member.status)) return false;
          if (vis.memberIds !== undefined && !vis.memberIds.includes(member.id)) return false;
          return true;
        }

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
