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

/** Returns the set of channel IDs this member is allowed to see */
async function getVisibleChannelIds(memberId: string): Promise<Set<string> | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
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

  // Build member's style IDs — based on actual enrolled styles
  const styles = await prisma.style.findMany({ select: { id: true, name: true } });
  const memberStyleIds = new Set<string>();

  if (member.primaryStyle) {
    const styleNames = member.primaryStyle.split(/[,\/]/).map((s) => s.trim().toLowerCase());
    for (const sName of styleNames) {
      const match = styles.find((s) => s.name.toLowerCase() === sName);
      if (match) memberStyleIds.add(match.id);
    }
  }

  // Only use allowedStyles when explicitly set (null = billing concern, not enrollment)
  for (const ms of member.memberships) {
    const allowed = ms.membershipPlan.allowedStyles;
    if (allowed) {
      try {
        const arr = JSON.parse(allowed);
        if (Array.isArray(arr)) {
          for (const sid of arr) memberStyleIds.add(sid);
        }
      } catch { /* ignore */ }
    }
  }

  // Build member's rank IDs
  const memberRankIds = new Set<string>();
  if (member.rank) {
    const matchingRanks = await prisma.rank.findMany({
      where: { name: member.rank },
      select: { id: true },
    });
    for (const r of matchingRanks) memberRankIds.add(r.id);
  }

  // Fetch all channels and filter
  const channels = await prisma.boardChannel.findMany({
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
        visible = !vis.memberIds?.length || vis.memberIds.includes(member.id);
        break;
      default:
        visible = true;
    }

    if (visible) visibleIds.add(ch.id);
  }

  return visibleIds;
}

// GET /api/portal/board/posts — list posts from visible channels only
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    // Get the set of channels this member can see
    const visibleChannelIds = await getVisibleChannelIds(auth.memberId);
    if (!visibleChannelIds || visibleChannelIds.size === 0) {
      return NextResponse.json({ posts: [] });
    }

    // If filtering by a specific channel, verify access
    if (channelId && !visibleChannelIds.has(channelId)) {
      return NextResponse.json({ posts: [] });
    }

    const where = channelId
      ? { channelId }
      : { channelId: { in: Array.from(visibleChannelIds) } };

    const posts = await prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        files: true,
        replies: {
          orderBy: { createdAt: "asc" },
        },
        channel: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Error fetching portal board posts:", error);
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}

// POST /api/portal/board/posts — create a post as the logged-in member
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const member = await prisma.member.findUnique({
      where: { id: auth.memberId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const body = await req.json();
    const { title, content, channelId } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!channelId) {
      return NextResponse.json({ error: "Channel is required" }, { status: 400 });
    }

    // Verify the member has access to this channel
    const visibleChannelIds = await getVisibleChannelIds(auth.memberId);
    if (!visibleChannelIds || !visibleChannelIds.has(channelId)) {
      return NextResponse.json({ error: "You don't have access to this channel" }, { status: 403 });
    }

    const authorName = `${member.firstName} ${member.lastName}`.trim();
    const authorInitials = `${member.firstName?.[0] || ""}${member.lastName?.[0] || ""}`.toUpperCase();

    const post = await prisma.boardPost.create({
      data: {
        type: "discussion",
        title: title.trim(),
        content: content?.trim() || "",
        authorId: member.id,
        authorName,
        authorInitials,
        isPriority: false,
        channelId,
      },
      include: {
        files: true,
        replies: true,
        channel: {
          select: { id: true, name: true },
        },
      },
    });

    await prisma.boardChannel.update({
      where: { id: channelId },
      data: { hasUpdates: true },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error("Error creating portal board post:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
