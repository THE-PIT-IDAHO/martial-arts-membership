import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/board/channels/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);

    const channel = await prisma.boardChannel.findFirst({
      where: { id, clientId },
      include: {
        posts: {
          orderBy: { createdAt: "desc" },
          include: {
            files: true,
            replies: true,
          },
        },
        polls: {
          orderBy: { createdAt: "desc" },
          include: {
            options: {
              include: {
                votes: true,
              },
            },
          },
        },
        _count: {
          select: { posts: true, polls: true },
        },
      },
    });

    if (!channel) {
      return new NextResponse("Channel not found", { status: 404 });
    }

    return NextResponse.json({ channel });
  } catch (error) {
    console.error("Error fetching channel:", error);
    return new NextResponse("Failed to load channel", { status: 500 });
  }
}

// PATCH /api/board/channels/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, description, type, visibility, hasUpdates } = body;

    // Verify channel belongs to tenant
    const check = await prisma.boardChannel.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!check) return new NextResponse("Channel not found", { status: 404 });

    const channel = await prisma.boardChannel.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(type !== undefined && { type }),
        ...(visibility !== undefined && { visibility: visibility ? JSON.stringify(visibility) : null }),
        ...(hasUpdates !== undefined && { hasUpdates }),
      },
    });

    return NextResponse.json({ channel });
  } catch (error) {
    console.error("Error updating channel:", error);
    return new NextResponse("Failed to update channel", { status: 500 });
  }
}

// DELETE /api/board/channels/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);

    // Verify channel belongs to tenant
    const check = await prisma.boardChannel.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!check) return new NextResponse("Channel not found", { status: 404 });

    await prisma.boardChannel.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting channel:", error);
    return new NextResponse("Failed to delete channel", { status: 500 });
  }
}
