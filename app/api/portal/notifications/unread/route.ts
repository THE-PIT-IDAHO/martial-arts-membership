import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getVisibleBoardChannelIds } from "@/lib/portal-board-visibility";

/**
 * GET /api/portal/notifications/unread
 *
 * Returns unread notification counts for the authenticated portal
 * member. Powers the red badge on the Messages tab in the bottom
 * nav and the "N New Messages" pill on the portal home page.
 *
 * Response shape:
 *   {
 *     unreadMessages: number,   // direct messages sent by admin, not yet read
 *     unreadBoardPosts: number, // posts in visible channels created after the
 *                               // member's per-channel lastReadAt (or ever,
 *                               // for channels they've never opened)
 *     total: number,            // sum of the above -- what the UI usually shows
 *   }
 *
 * A channel the member CAN'T see (visibility rules exclude them) never
 * contributes to unreadBoardPosts -- the notification pool is exactly
 * the same set the Dojo Board page shows them.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Direct messages -------------------------------------------------
  const memberships = await prisma.directConversationMember.findMany({
    where: { memberId: auth.memberId },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((m) => m.conversationId);
  let unreadMessages = 0;
  if (conversationIds.length > 0) {
    unreadMessages = await prisma.directMessage.count({
      where: {
        conversationId: { in: conversationIds },
        senderType: "admin",
        isRead: false,
      },
    });
  }

  // Board posts -----------------------------------------------------
  // Count posts in each visible channel that are newer than the
  // member's per-channel lastReadAt (or ALL posts if they've never
  // opened that channel). Summed across channels.
  const visibleChannelIds = await getVisibleBoardChannelIds(auth.memberId);
  let unreadBoardPosts = 0;
  if (visibleChannelIds.size > 0) {
    const reads = await prisma.memberBoardChannelRead.findMany({
      where: { memberId: auth.memberId, channelId: { in: [...visibleChannelIds] } },
      select: { channelId: true, lastReadAt: true },
    });
    const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));

    for (const channelId of visibleChannelIds) {
      const cutoff = readMap.get(channelId);
      const count = await prisma.boardPost.count({
        where: {
          channelId,
          ...(cutoff ? { createdAt: { gt: cutoff } } : {}),
        },
      });
      unreadBoardPosts += count;
    }
  }

  return NextResponse.json({
    unreadMessages,
    unreadBoardPosts,
    total: unreadMessages + unreadBoardPosts,
  });
}
