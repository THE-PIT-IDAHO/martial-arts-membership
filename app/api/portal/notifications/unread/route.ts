import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

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
 *     unreadBoardPosts: number, // reserved for phase 2 (currently always 0)
 *     total: number,            // sum of the above -- what the UI usually shows
 *   }
 *
 * Cheap query: one findMany for conversation ids + one aggregate count.
 * Safe to call on every portal page load; the two-hop query executes
 * against indexed FKs.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  // Board post notifications land here in phase 2 -- reserved slot so
  // the client can already destructure `total` without a shape change.
  const unreadBoardPosts = 0;

  return NextResponse.json({
    unreadMessages,
    unreadBoardPosts,
    total: unreadMessages + unreadBoardPosts,
  });
}
