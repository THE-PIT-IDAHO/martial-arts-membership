import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/rank-tests - List all rank tests, optionally filtered by styleId or rankId
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const styleId = searchParams.get("styleId");
    const rankId = searchParams.get("rankId");

    const where: Record<string, unknown> = {};
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
    const body = await req.json();
    const { name, description, rankId, styleId } = body;

    if (!name || !rankId || !styleId) {
      return new NextResponse("Name, rankId, and styleId are required", { status: 400 });
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
