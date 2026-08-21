import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getVisibleBoardChannelIds } from "@/lib/portal-board-visibility";

/**
 * POST /api/portal/board/read
 *
 * Marks board channels as read for the current member -- upserts a
 * MemberBoardChannelRead row with lastReadAt = now for each specified
 * channel. Two shapes accepted:
 *
 *   { channelId: "abc123" }   -> mark just that one channel as read
 *   { all: true }             -> mark EVERY channel the member can
 *                                see as read (called on Dojo Board
 *                                page mount to clear the badge on
 *                                first visit)
 *
 * Enforces visibility: channelIds the member can't see are silently
 * dropped -- can't accidentally mark someone's cross-channel state
 * for a channel they shouldn't even know exists.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const visibleIds = await getVisibleBoardChannelIds(auth.memberId);

  let targets: string[];
  if (body.all === true) {
    targets = [...visibleIds];
  } else if (typeof body.channelId === "string" && visibleIds.has(body.channelId)) {
    targets = [body.channelId];
  } else {
    return NextResponse.json(
      { error: "Provide either { all: true } or { channelId } for a channel you can see." },
      { status: 400 },
    );
  }

  if (targets.length === 0) {
    return NextResponse.json({ marked: 0 });
  }

  // Upsert per channel. Parallel is fine -- @@unique(memberId,channelId)
  // protects against duplicate rows even under concurrent taps.
  await Promise.all(
    targets.map((channelId) =>
      prisma.memberBoardChannelRead.upsert({
        where: {
          memberId_channelId: { memberId: auth.memberId, channelId },
        },
        create: { memberId: auth.memberId, channelId, lastReadAt: now },
        update: { lastReadAt: now },
      }),
    ),
  );

  return NextResponse.json({ marked: targets.length });
}
