import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

// POST /api/portal/board/replies — create a reply as the logged-in member
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedMember(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const member = await prisma.member.findUnique({
      where: { id: auth.memberId },
      select: { id: true, firstName: true, lastName: true, clientId: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const body = await req.json();
    const { postId, content } = body;

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Verify the post belongs to this member's tenant — without this a
    // member could reply to another gym's board post by guessing the id.
    const post = await prisma.boardPost.findUnique({
      where: { id: postId },
      select: { channel: { select: { clientId: true } } },
    });
    if (!post || post.channel?.clientId !== member.clientId) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const authorName = `${member.firstName} ${member.lastName}`.trim();
    const authorInitials = `${member.firstName?.[0] || ""}${member.lastName?.[0] || ""}`.toUpperCase();

    const reply = await prisma.boardReply.create({
      data: {
        content: content.trim(),
        authorId: member.id,
        authorName,
        authorInitials,
        postId,
      },
    });

    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    console.error("Error creating portal board reply:", error);
    return NextResponse.json({ error: "Failed to create reply" }, { status: 500 });
  }
}
