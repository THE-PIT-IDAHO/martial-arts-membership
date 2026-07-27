import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Every handler here verifies conversation.clientId matches the
// caller's tenant. Before the fix, all three methods (GET / POST /
// PATCH) were completely open -- an admin in gym A could read,
// post to, and mark-read any conversation in gym B just by knowing
// (or guessing) the id.

// GET /api/direct-messages/[conversationId] — fetch conversation thread
export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { conversationId } = await params;

    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId },
      include: {
        members: true,
      },
    });

    if (!conversation || conversation.clientId !== clientId) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const messages = await prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    // Fetch member details -- scoped so a stray member row on the
    // conversation from another tenant can't leak profile data.
    const memberIds = conversation.members.map((m) => m.memberId);
    const members = memberIds.length
      ? await prisma.member.findMany({
          where: { id: { in: memberIds }, clientId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            status: true,
            email: true,
            phone: true,
            dateOfBirth: true,
            minorCommsMode: true,
          },
        })
      : [];

    return NextResponse.json({
      messages,
      members,
      membersVisible: conversation.membersVisible,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return new NextResponse("Failed to load conversation", { status: 500 });
  }
}

// POST /api/direct-messages/[conversationId] — send a message in existing conversation
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { conversationId } = await params;
    const body = await req.json();
    const { senderType, senderId, content } = body;

    if (!senderType || !["admin", "member"].includes(senderType)) {
      return new NextResponse("senderType must be 'admin' or 'member'", { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return new NextResponse("content is required", { status: 400 });
    }

    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId },
      select: { clientId: true },
    });
    if (!conversation || conversation.clientId !== clientId) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const message = await prisma.directMessage.create({
      data: {
        conversationId,
        clientId,
        senderType,
        senderId: senderId || null,
        content: content.trim(),
      },
    });

    await prisma.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Error sending message:", error);
    return new NextResponse("Failed to send message", { status: 500 });
  }
}

// PATCH /api/direct-messages/[conversationId] — mark messages as read for admin
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const clientId = await getClientId(req);
    const { conversationId } = await params;

    const conversation = await prisma.directConversation.findUnique({
      where: { id: conversationId },
      select: { clientId: true },
    });
    if (!conversation || conversation.clientId !== clientId) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    await prisma.directMessage.updateMany({
      where: {
        conversationId,
        senderType: "member",
        isRead: false,
      },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    return new NextResponse("Failed to mark messages as read", { status: 500 });
  }
}
