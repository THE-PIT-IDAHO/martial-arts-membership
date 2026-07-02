import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get conversations this member is part of
  const memberships = await prisma.directConversationMember.findMany({
    where: { memberId: auth.memberId },
    select: { conversationId: true },
  });

  const conversationIds = memberships.map((m) => m.conversationId);

  if (conversationIds.length === 0) {
    return NextResponse.json([]);
  }

  const conversations = await prisma.directConversation.findMany({
    where: { id: { in: conversationIds } },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          senderType: true,
          isRead: true,
        },
      },
      members: {
        select: { memberId: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Get unread counts
  const result = await Promise.all(
    conversations.map(async (conv) => {
      const unreadCount = await prisma.directMessage.count({
        where: {
          conversationId: conv.id,
          senderType: "admin",
          isRead: false,
        },
      });

      return {
        id: conv.id,
        lastMessage: conv.messages[0] || null,
        unreadCount,
        updatedAt: conv.updatedAt,
      };
    })
  );

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId, content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const me = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { clientId: true },
  });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve the target conversation. Two paths:
  //   - conversationId provided → member is replying to an existing
  //     conversation (must be in this tenant and they must be a
  //     participant).
  //   - conversationId omitted → member is starting a message to the
  //     gym. Look for a solo-member conversation they already have; if
  //     none exists, create one. Admin sees new conversations via
  //     /api/direct-messages regardless of who started them.
  let targetConversationId: string;

  if (conversationId) {
    const conversation = await prisma.directConversation.findFirst({
      where: { id: conversationId, clientId: me.clientId },
      select: { id: true },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const membership = await prisma.directConversationMember.findUnique({
      where: {
        conversationId_memberId: {
          conversationId,
          memberId: auth.memberId,
        },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this conversation" }, { status: 403 });
    }
    targetConversationId = conversationId;
  } else {
    // Look for an existing solo conversation (this member as the only
    // participant) — that's the natural "member ↔ gym" thread we reuse
    // so repeated starts don't spam separate threads.
    const existing = await prisma.directConversation.findFirst({
      where: {
        clientId: me.clientId,
        members: { every: { memberId: auth.memberId } },
      },
      include: { members: { select: { memberId: true } } },
    });
    const soloExisting = existing && existing.members.length === 1 ? existing : null;

    if (soloExisting) {
      targetConversationId = soloExisting.id;
    } else {
      const created = await prisma.directConversation.create({
        data: {
          clientId: me.clientId,
          membersVisible: true,
          members: { create: [{ memberId: auth.memberId }] },
        },
        select: { id: true },
      });
      targetConversationId = created.id;
    }
  }

  const message = await prisma.directMessage.create({
    data: {
      conversationId: targetConversationId,
      senderType: "member",
      senderId: auth.memberId,
      content: content.trim(),
      clientId: me.clientId,
    },
  });

  await prisma.directConversation.update({
    where: { id: targetConversationId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ...message, conversationId: targetConversationId });
}
