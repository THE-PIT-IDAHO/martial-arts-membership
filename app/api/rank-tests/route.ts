import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/rank-tests - List all rank tests, optionally filtered by styleId or rankId.
// Scoped to the caller's tenant via rank.style.clientId -- without
// this filter, GET with no styleId returned every gym's curriculum.
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const styleId = searchParams.get("styleId");
    const rankId = searchParams.get("rankId");

    // Always constrain by tenant via the rank->style relation.
    // styleId / rankId are AND-ed on top when provided.
    const where: Record<string, unknown> = {
      rank: { style: { clientId } },
    };
    if (styleId) where.styleId = styleId;
    if (rankId) where.rankId = rankId;

    const rankTests = await prisma.rankTest.findMany({
      where,
      include: {
        rank: {
          select: {
            id: true,
            name: true,
            order: true,
          },
        },
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ rankTests });
  } catch (error) {
    console.error("Error fetching rank tests:", error);
    return new NextResponse("Failed to load rank tests", { status: 500 });
  }
}

// POST /api/rank-tests - Create a new rank test
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, description, rankId, styleId } = body;

    if (!name || !rankId || !styleId) {
      return new NextResponse("Name, rankId, and styleId are required", { status: 400 });
    }

    // Verify BOTH the style and the rank belong to this tenant, and
    // that the rank actually belongs to that style. Prevents smuggling
    // a foreign styleId / rankId on POST.
    const style = await prisma.style.findUnique({
      where: { id: styleId },
      select: { clientId: true },
    });
    if (!style || style.clientId !== clientId) {
      return new NextResponse("Style not found in this tenant", { status: 404 });
    }
    const rank = await prisma.rank.findUnique({
      where: { id: rankId },
      select: { styleId: true },
    });
    if (!rank || rank.styleId !== styleId) {
      return new NextResponse("Rank does not belong to this style", { status: 400 });
    }

    // Get count for sort order
    const count = await prisma.rankTest.count({ where: { rankId } });

    const rankTest = await prisma.rankTest.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        rankId,
        styleId,
        sortOrder: count,
      },
      include: {
        rank: {
          select: {
            id: true,
            name: true,
            order: true,
          },
        },
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    return NextResponse.json({ rankTest }, { status: 201 });
  } catch (error) {
    console.error("Error creating rank test:", error);
    return new NextResponse("Failed to create rank test", { status: 500 });
  }
}
