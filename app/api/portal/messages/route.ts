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

  if (!conversationId || !content?.trim()) {
    return NextResponse.json({ error: "conversationId and content required" }, { status: 400 });
  }

  // Same belt-and-suspenders as the GET handler: verify the conversation
  // is in this member's tenant before checking conversation membership.
  const me = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { clientId: true },
  });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversation = await prisma.directConversation.findFirst({
    where: { id: conversationId, clientId: me.clientId },
    select: { id: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Verify member is part of this conversation
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

  const message = await prisma.directMessage.create({
    data: {
      conversationId,
      senderType: "member",
      senderId: auth.memberId,
      content: content.trim(),
      clientId: me.clientId,
    },
  });

  // Update conversation timestamp
  await prisma.directConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message);
}
