import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/direct-messages — list all conversations for admin view
export async function GET() {
  try {
    const conversations = await prisma.directConversation.findMany({
      include: {
        members: {
          include: {
            conversation: false,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Get all member IDs across all conversations
    const allMemberIds = [
      ...new Set(conversations.flatMap((c) => c.members.map((m) => m.memberId))),
    ];
    const members = await prisma.member.findMany({
      where: { id: { in: allMemberIds } },
      select: { id: true, firstName: true, lastName: true, photoUrl: true, status: true, dateOfBirth: true },
    });
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Count unread messages per conversation (member-sent, unread by admin)
    const unreadCounts = await Promise.all(
      conversations.map((c) =>
        prisma.directMessage.count({
          where: { conversationId: c.id, senderType: "member", isRead: false },
        })
      )
    );

    const result = conversations.map((conv, i) => {
      const lastMsg = conv.messages[0] || null;
      return {
        id: conv.id,
        membersVisible: conv.membersVisible,
        members: conv.members.map((cm) => {
          const m = memberMap.get(cm.memberId);
          return {
            id: cm.memberId,
            firstName: m?.firstName || "Unknown",
            lastName: m?.lastName || "",
            photoUrl: m?.photoUrl || null,
            status: m?.status || "UNKNOWN",
            dateOfBirth: m?.dateOfBirth || null,
          };
        }),
        lastMessage: lastMsg?.content || "",
        lastMessageAt: lastMsg?.createdAt || conv.createdAt,
        lastSenderType: lastMsg?.senderType || "admin",
        unreadCount: unreadCounts[i],
      };
    });

    return NextResponse.json({ conversations: result });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return new NextResponse("Failed to load conversations", { status: 500 });
  }
}

// POST /api/direct-messages — create a new conversation and send first message
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { memberIds, content, membersVisible } = body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return new NextResponse("content is required", { status: 400 });
    }

    // Auto-expand for minors: look up PARENT/GUARDIAN relationships
    const selectedMembers = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, dateOfBirth: true, minorCommsMode: true },
    });

    const finalMemberIds = new Set<string>(memberIds);

    for (const member of selectedMembers) {
      if (!member.dateOfBirth) continue;
      const age = Math.floor(
        (Date.now() - new Date(member.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      if (age >= 18) continue;

      // Find PARENT or GUARDIAN relationships where this member is the child
      const parentRels = await prisma.memberRelationship.findMany({
        where: {
          OR: [
            { toMemberId: member.id, relationship: "PARENT" },
            { toMemberId: member.id, relationship: "GUARDIAN" },
          ],
        },
      });

      for (const rel of parentRels) {
        finalMemberIds.add(rel.fromMemberId);
      }

      // If parent_only, remove the minor from the conversation
      if (member.minorCommsMode === "parent_only" && parentRels.length > 0) {
        finalMemberIds.delete(member.id);
      }
    }

    const sortedIds = [...finalMemberIds].sort();

    // Check if a conversation with the exact same member set already exists
    const existingConversations = await prisma.directConversation.findMany({
      include: { members: true },
    });

    let conversation = existingConversations.find((c) => {
      const existingIds = c.members.map((m) => m.memberId).sort();
      return (
        existingIds.length === sortedIds.length &&
        existingIds.every((id, i) => id === sortedIds[i])
      );
    });

    if (!conversation) {
      conversation = await prisma.directConversation.create({
        data: {
          membersVisible: membersVisible !== false,
          members: {
            create: sortedIds.map((id) => ({ memberId: id })),
          },
        },
        include: { members: true },
      });
    }

    // Send the first message
    await prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderType: "admin",
        content: content.trim(),
      },
    });

    // Update conversation timestamp
    await prisma.directConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return new NextResponse("Failed to create conversation", { status: 500 });
  }
}
