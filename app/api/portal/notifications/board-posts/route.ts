import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getVisibleBoardChannelIds } from "@/lib/portal-board-visibility";

/**
 * GET /api/portal/notifications/board-posts
 *
 * Recent UNREAD board posts across every channel the member can see.
 * Powers the "New in Dojo Board" section on the portal Messages page:
 * each post renders as a row that links directly to that post on the
 * Dojo Board (/portal/board?post=<id>).
 *
 * Response: [{ id, title, snippet, authorName, channelId, channelName,
 *              createdAt }]
 * -- limited to 20, newest first. If a channel has never been opened
 * (no MemberBoardChannelRead row), every post in it counts as unread.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visibleChannelIds = await getVisibleBoardChannelIds(auth.memberId);
  if (visibleChannelIds.size === 0) return NextResponse.json({ posts: [] });

  const reads = await prisma.memberBoardChannelRead.findMany({
    where: { memberId: auth.memberId, channelId: { in: [...visibleChannelIds] } },
    select: { channelId: true, lastReadAt: true },
  });
  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));

  // Build an OR filter: for each visible channel, "posts in this
  // channel newer than my lastReadAt" (or all posts if I have no
  // cutoff). Single query keeps this cheap even with many channels.
  const orConds = [...visibleChannelIds].map((channelId) => {
    const cutoff = readMap.get(channelId);
    return cutoff ? { channelId, createdAt: { gt: cutoff } } : { channelId };
  });

  const posts = await prisma.boardPost.findMany({
    where: { OR: orConds },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      content: true,
      authorName: true,
      createdAt: true,
      channel: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      snippet: p.content.length > 90 ? p.content.slice(0, 90).trimEnd() + "…" : p.content,
      authorName: p.authorName,
      channelId: p.channel?.id ?? null,
      channelName: p.channel?.name ?? null,
      createdAt: p.createdAt,
    })),
  });
}
