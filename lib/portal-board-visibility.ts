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
 *   - { type: "combined", ... }       → every listed dimension must match
 *
 * "Enrolled in a style" has TWO senses:
 *   - broad  → any membership (any status) allowing the style, or
 *              a primaryStyle name match. Used when the channel
 *              filters by style ALONE (no status filter). A lapsed
 *              Kore BJJ member still counts as "in Kore BJJ".
 *   - active → only ACTIVE memberships allowing the style. Used when
 *              the channel filters by style AND requires ACTIVE
 *              status -- the member's KoreBJJ enrollment must be
 *              active, not just their overall member status.
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
      // Pull EVERY membership regardless of status. We split into
      // active-only vs any-status sets below and pick per channel.
      memberships: {
        select: {
          status: true,
          membershipPlan: { select: { allowedStyles: true } },
        },
      },
    },
  });
  if (!member) return new Set();

  // Style-id sets keyed by "enrollment strength":
  //   activeStyleIds -- only from status=ACTIVE memberships
  //   anyStyleIds    -- from ANY membership + primaryStyle name lookup
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
    } catch {
      /* ignore malformed JSON */
    }
  }

  // primaryStyle name -> id (fallback for members with no membership
  // record but a listed style). Only feeds anyStyleIds -- there's no
  // way to know if a name-only listing is currently "active", so it
  // never contributes to activeStyleIds.
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
        // No status filter -> broad match. A member with an inactive
        // Kore BJJ membership still counts as "in Kore BJJ" here.
        visible = !vis.styleIds?.length || vis.styleIds.some((sid) => anyStyleIds.has(sid));
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
        // means nobody qualifies on that axis. All dimensions absent =
        // everyone. Style axis uses activeStyleIds only when the status
        // filter requires ACTIVE (or ACTIVE-plus-others) -- e.g. a
        // "Kore BJJ + Active" channel excludes a member whose Kore BJJ
        // membership is INACTIVE even if they're active elsewhere. Any
        // other status set (INACTIVE-only, PROSPECT, PARENT, COACH...)
        // uses the broad set so a lapsed Kore BJJ member still counts
        // as "in Kore BJJ" on that axis.
        let ok = true;
        if (vis.styleIds !== undefined) {
          const requireActiveEnrollment =
            !!vis.statuses && vis.statuses.includes("ACTIVE");
          const pool = requireActiveEnrollment ? activeStyleIds : anyStyleIds;
          if (!vis.styleIds.some((sid) => pool.has(sid))) ok = false;
        }
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
