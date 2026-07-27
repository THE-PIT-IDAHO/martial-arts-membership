import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/direct-messages — list conversations for the calling tenant only.
// Previously returned every conversation on the platform to any admin --
// a cross-tenant read of member PII + message bodies.
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);

    const conversations = await prisma.directConversation.findMany({
      where: { clientId },
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

    // Get all member IDs across all conversations (also tenant-scoped
    // so a rogue foreign memberId on an old row can't leak profile
    // fields for someone in another gym).
    const allMemberIds = [
      ...new Set(conversations.flatMap((c) => c.members.map((m) => m.memberId))),
    ];
    const members = allMemberIds.length
      ? await prisma.member.findMany({
          where: { id: { in: allMemberIds }, clientId },
          select: { id: true, firstName: true, lastName: true, photoUrl: true, status: true, dateOfBirth: true },
        })
      : [];
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
    const clientId = await getClientId(req);
    const body = await req.json();
    const { memberIds, content, membersVisible } = body;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return new NextResponse("memberIds array is required", { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return new NextResponse("content is required", { status: 400 });
    }

    // Verify every provided memberId belongs to this tenant. Prevents
    // an attacker from creating a conversation attached to members
    // in another gym.
    const selectedMembers = await prisma.member.findMany({
      where: { id: { in: memberIds }, clientId },
      select: { id: true, dateOfBirth: true, minorCommsMode: true },
    });
    if (selectedMembers.length !== memberIds.length) {
      return new NextResponse("One or more memberIds are invalid for this tenant", { status: 400 });
    }

    const finalMemberIds = new Set<string>(memberIds);

    for (const member of selectedMembers) {
      if (!member.dateOfBirth) continue;
      const age = Math.floor(
        (Date.now() - new Date(member.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
      if (age >= 18) continue;

      // Find PARENT or GUARDIAN relationships where this member is
      // the child. MemberRelationship has no clientId of its own; we
      // already verified `member.id` belongs to this tenant above,
      // so the toMemberId constraint already scopes us implicitly.
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

    // Check if a conversation with the exact same member set already
    // exists WITHIN THIS TENANT. Previously searched every gym.
    const existingConversations = await prisma.directConversation.findMany({
      where: { clientId },
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
          clientId,
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
        clientId,
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
