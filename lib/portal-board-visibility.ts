import { prisma } from "@/lib/prisma";

/**
 * Shared helper: which BoardChannel ids is this member allowed to
 * see? Uses each channel's visibility JSON:
 *   - null / unparseable → all members can see it
 *   - { type: "all" }    → everyone
 *   - { type: "styles",   styleIds }  → members enrolled in any listed style
 *   - { type: "ranks",    rankIds }   → members holding any listed rank
 *   - { type: "statuses", statuses }  → members whose status includes one of them
 *   - { type: "specific", memberIds } → members explicitly listed
 *
 * "Enrolled in a style" means the member's primaryStyle name matches,
 * OR one of their active memberships' allowedStyles includes the id.
 *
 * Extracted from app/api/portal/board/posts/route.ts + channels/route.ts
 * so downstream code (notification counts, unread board post lists,
 * etc.) enforces the exact same rules -- if a member can't see the
 * channel, they can't get a notification for its posts.
 */
export interface ChannelVisibility {
  type: "all" | "styles" | "ranks" | "statuses" | "specific" | "combined";
  styleIds?: string[];
  rankIds?: string[];
  statuses?: string[];
  memberIds?: string[];
}

export async function getVisibleBoardChannelIds(memberId: string): Promise<Set<string>> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      clientId: true,
      primaryStyle: true,
      rank: true,
      status: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          membershipPlan: { select: { allowedStyles: true } },
        },
      },
    },
  });
  if (!member) return new Set();

  // Build member's style ids (from primaryStyle names + membership allowedStyles).
  const styles = await prisma.style.findMany({
    where: { clientId: member.clientId },
    select: { id: true, name: true },
  });
  const memberStyleIds = new Set<string>();

  if (member.primaryStyle) {
    const styleNames = member.primaryStyle.split(/[,\/]/).map((s) => s.trim().toLowerCase());
    for (const sName of styleNames) {
      const match = styles.find((s) => s.name.toLowerCase() === sName);
      if (match) memberStyleIds.add(match.id);
    }
  }
  for (const ms of member.memberships) {
    const allowed = ms.membershipPlan.allowedStyles;
    if (!allowed) continue;
    try {
      const arr = JSON.parse(allowed);
      if (Array.isArray(arr)) for (const sid of arr) memberStyleIds.add(sid);
    } catch {
      /* ignore */
    }
  }

  // Rank ids match by name within the member's tenant.
  const memberRankIds = new Set<string>();
  if (member.rank) {
    const matchingRanks = await prisma.rank.findMany({
      where: { name: member.rank, style: { clientId: member.clientId } },
      select: { id: true },
    });
    for (const r of matchingRanks) memberRankIds.add(r.id);
  }

  const channels = await prisma.boardChannel.findMany({
    where: { clientId: member.clientId },
    select: { id: true, visibility: true },
  });

  const visibleIds = new Set<string>();
  for (const ch of channels) {
    if (!ch.visibility) {
      visibleIds.add(ch.id);
      continue;
    }
    let vis: ChannelVisibility;
    try {
      vis = JSON.parse(ch.visibility);
    } catch {
      visibleIds.add(ch.id);
      continue;
    }
    let visible = false;
    switch (vis.type) {
      case "all":
        visible = true;
        break;
      case "styles":
        visible = !vis.styleIds?.length || vis.styleIds.some((sid) => memberStyleIds.has(sid));
        break;
      case "ranks":
        visible = !vis.rankIds?.length || vis.rankIds.some((rid) => memberRankIds.has(rid));
        break;
      case "statuses":
        visible = !vis.statuses?.length || vis.statuses.includes(member.status);
        break;
      case "specific":
        // Empty memberIds means "nobody" for specific channels -- new
        // channels created via the admin UI default to this so admins
        // must explicitly add members. Undefined memberIds (legacy /
        // hand-authored) still fall back to "everyone" for compat.
        visible = vis.memberIds
          ? vis.memberIds.includes(member.id)
          : true;
        break;
      case "combined": {
        // Every dimension the admin explicitly turned on (present as an
        // array, even if empty) must match. A present-but-empty array
        // means nobody qualifies on that axis. A dimension left off
        // entirely (undefined) is skipped. If NO dimensions are set,
        // the channel is visible to everyone.
        let ok = true;
        if (vis.styleIds !== undefined && !vis.styleIds.some((sid) => memberStyleIds.has(sid))) ok = false;
        if (ok && vis.rankIds !== undefined && !vis.rankIds.some((rid) => memberRankIds.has(rid))) ok = false;
        if (ok && vis.statuses !== undefined && !vis.statuses.includes(member.status)) ok = false;
        if (ok && vis.memberIds !== undefined && !vis.memberIds.includes(member.id)) ok = false;
        visible = ok;
        break;
      }
      default:
        visible = true;
    }
    if (visible) visibleIds.add(ch.id);
  }
  return visibleIds;
}
