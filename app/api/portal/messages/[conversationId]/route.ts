import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await params;

  // Verify member is part of this conversation AND that the conversation
  // belongs to their tenant. Membership check alone isn't enough — if an
  // admin had ever added a member to a cross-tenant conversation by
  // mistake, the unique-key check would happily pass.
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

  const messages = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      senderType: true,
      senderId: true,
      isRead: true,
      createdAt: true,
    },
  });

  // Mark admin messages as read
  await prisma.directMessage.updateMany({
    where: {
      conversationId,
      senderType: "admin",
      isRead: false,
    },
    data: { isRead: true },
  });

  return NextResponse.json({ messages, memberId: auth.memberId });
}
