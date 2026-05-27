import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// BoardPost is tenant-scoped through its channel.clientId. All ops here
// now verify the post's channel belongs to the caller's tenant before
// touching it — previously GET/PATCH/DELETE acted on any post by id.

async function verifyTenant(postId: string, clientId: string) {
  const post = await prisma.boardPost.findUnique({
    where: { id: postId },
    select: { channel: { select: { clientId: true } } },
  });
  return !!post && post.channel?.clientId === clientId;
}

// GET /api/board/posts/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);
    if (!(await verifyTenant(id, clientId))) {
      return new NextResponse("Post not found", { status: 404 });
    }

    const post = await prisma.boardPost.findUnique({
      where: { id },
      include: {
        files: true,
        replies: true,
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!post) {
      return new NextResponse("Post not found", { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Error fetching post:", error);
    return new NextResponse("Failed to load post", { status: 500 });
  }
}

// PATCH /api/board/posts/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);
    if (!(await verifyTenant(id, clientId))) {
      return new NextResponse("Post not found", { status: 404 });
    }

    const body = await req.json();
    const { type, title, content, isPriority, styleTags, reactions } = body;

    const post = await prisma.boardPost.update({
      where: { id },
      data: {
        ...(type !== undefined && { type }),
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content: content?.trim() || "" }),
        ...(isPriority !== undefined && { isPriority }),
        ...(styleTags !== undefined && { styleTags: styleTags ? JSON.stringify(styleTags) : null }),
        ...(reactions !== undefined && { reactions: reactions ? JSON.stringify(reactions) : null }),
      },
      include: {
        files: true,
        replies: true,
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ post });
  } catch (error) {
    console.error("Error updating post:", error);
    return new NextResponse("Failed to update post", { status: 500 });
  }
}

// DELETE /api/board/posts/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);
    if (!(await verifyTenant(id, clientId))) {
      return new NextResponse("Post not found", { status: 404 });
    }

    // Delete the post (files and replies will cascade delete)
    await prisma.boardPost.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting post:", error);
    return new NextResponse("Failed to delete post", { status: 500 });
  }
}
