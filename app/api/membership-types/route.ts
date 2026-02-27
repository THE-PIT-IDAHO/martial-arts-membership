import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/membership-types
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const membershipTypes = await prisma.membershipType.findMany({
      where: { clientId },
      include: {
        _count: {
          select: { membershipPlans: true },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ membershipTypes });
  } catch (error) {
    console.error("Error fetching membership types:", error);
    return new NextResponse("Failed to load membership types", { status: 500 });
  }
}

// POST /api/membership-types
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, description, color, sortOrder, isActive } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    const membershipType = await prisma.membershipType.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        isActive: isActive ?? true,
        clientId,
      },
    });

    return NextResponse.json({ membershipType }, { status: 201 });
  } catch (error) {
    console.error("Error creating membership type:", error);
    return new NextResponse("Failed to create membership type", { status: 500 });
  }
}
