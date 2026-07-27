import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Every method now scopes WeeklyFocus reads / writes by clientId.
// Before this fix, getClientId was called only for validation and
// the queries themselves saw the whole platform -- GET returned the
// most recent active focus from ANY gym, POST deactivated every
// other gym's active focus, DELETE cleared them all, and CREATE
// left clientId as the default-client fallback.

// GET /api/board/focus — get the current active weekly focus
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const focus = await prisma.weeklyFocus.findFirst({
      where: { isActive: true, clientId },
      orderBy: { createdAt: "desc" },
    });

    if (focus) {
      // Auto-deactivate if pinnedUntil has passed
      if (focus.pinnedUntil && new Date(focus.pinnedUntil) < new Date()) {
        await prisma.weeklyFocus.update({
          where: { id: focus.id },
          data: { isActive: false },
        });
        return NextResponse.json({ focus: null });
      }

      // If marked as posted, verify the board post still exists AND
      // belongs to the same tenant.
      if (focus.boardPostId) {
        const postExists = await prisma.boardPost.findFirst({
          where: { id: focus.boardPostId, channel: { clientId } },
          select: { id: true },
        });

        if (!postExists) {
          // Board post was deleted — clear posted state
          await prisma.weeklyFocus.update({
            where: { id: focus.id },
            data: { postedAt: null, pinnedUntil: null, boardPostId: null },
          });
          focus.postedAt = null;
          focus.pinnedUntil = null;
          focus.boardPostId = null;
        }
      }
    }

    return NextResponse.json({ focus });
  } catch (error) {
    console.error("Error fetching weekly focus:", error);
    return new NextResponse("Failed to load weekly focus", { status: 500 });
  }
}

// POST /api/board/focus — create a new weekly focus (deactivates previous)
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { title, description, videoUrl, rankTestItemId } = body;

    if (!title || typeof title !== "string") {
      return new NextResponse("Title is required", { status: 400 });
    }

    // Deactivate current active focuses for THIS tenant only.
    await prisma.weeklyFocus.updateMany({
      where: { isActive: true, clientId },
      data: { isActive: false },
    });

    // Create the new active focus
    const focus = await prisma.weeklyFocus.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        videoUrl: videoUrl?.trim() || null,
        rankTestItemId: rankTestItemId || null,
        isActive: true,
        clientId,
      },
    });

    return NextResponse.json({ focus }, { status: 201 });
  } catch (error) {
    console.error("Error creating weekly focus:", error);
    return new NextResponse("Failed to create weekly focus", { status: 500 });
  }
}

// DELETE /api/board/focus — clear the current weekly focus
export async function DELETE(req: Request) {
  try {
    const clientId = await getClientId(req);
    await prisma.weeklyFocus.updateMany({
      where: { isActive: true, clientId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing weekly focus:", error);
    return new NextResponse("Failed to clear weekly focus", { status: 500 });
  }
}
