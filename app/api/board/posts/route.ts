import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/board/posts
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    const where = channelId
      ? { channelId, channel: { clientId } }
      : { channel: { clientId } };

    const posts = await prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({ posts });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return new NextResponse("Failed to load posts", { status: 500 });
  }
}

// POST /api/board/posts
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const {
      type,
      title,
      content,
      authorId,
      authorName,
      authorInitials,
      isPriority,
      styleTags,
      channelId,
      files,
    } = body;

    if (!title || typeof title !== "string") {
      return new NextResponse("Title is required", { status: 400 });
    }

    if (!channelId) {
      return new NextResponse("Channel ID is required", { status: 400 });
    }

    // Verify the channel belongs to this tenant BEFORE writing. Prevents
    // posting into another gym's channel by supplying its id.
    const channel = await prisma.boardChannel.findFirst({
      where: { id: channelId, clientId },
      select: { id: true },
    });
    if (!channel) {
      return new NextResponse("Channel not found in this tenant", { status: 404 });
    }

    // Create the post with optional files
    const post = await prisma.boardPost.create({
      data: {
        type: type || "notice",
        title: title.trim(),
        content: content?.trim() || "",
        authorId: authorId || null,
        authorName: authorName || "Anonymous",
        authorInitials: authorInitials || "?",
        isPriority: isPriority || false,
        styleTags: styleTags ? JSON.stringify(styleTags) : null,
        channelId,
        files: files?.length
          ? {
              create: files.map((file: { name: string; size: number; type: string; url: string; uploadedBy?: string }) => ({
                name: file.name,
                size: file.size,
                type: file.type,
                url: file.url,
                uploadedBy: file.uploadedBy || authorName || "Anonymous",
                channelId,
              })),
            }
          : undefined,
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

    // Mark channel as having updates
    await prisma.boardChannel.update({
      where: { id: channelId },
      data: { hasUpdates: true },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error("Error creating post:", error);
    return new NextResponse("Failed to create post", { status: 500 });
  }
}
