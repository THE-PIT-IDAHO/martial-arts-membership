import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/board/channels
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const channels = await prisma.boardChannel.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: { posts: true, polls: true },
        },
      },
    });

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("Error fetching channels:", error);
    return new NextResponse("Failed to load channels", { status: 500 });
  }
}

// POST /api/board/channels
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, description, type, visibility } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    const channel = await prisma.boardChannel.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        type: type || "custom",
        visibility: visibility ? JSON.stringify(visibility) : null,
        clientId,
      },
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    console.error("Error creating channel:", error);
    return new NextResponse("Failed to create channel", { status: 500 });
  }
}
