import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // adjust path if needed
import { getClientId } from "@/lib/tenant";

// GET /api/styles
export async function GET(req: Request) {
  try {
    await getClientId(req); // validate tenant
    const styles = await prisma.style.findMany({
      include: {
        ranks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            name: true,
            order: true,
            styleId: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ styles });
  } catch (error) {
    console.error("Error fetching styles:", error);
    return new NextResponse("Failed to load styles", { status: 500 });
  }
}

// POST /api/styles
export async function POST(req: Request) {
  try {
    await getClientId(req); // validate tenant
    const body = await req.json();
    const { name, shortName, description, beltSystemEnabled, testNamingConvention } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    const style = await prisma.style.create({
      data: {
        name: name.trim(),
        shortName: shortName?.trim() || null,
        description: description?.trim() || null,
        beltSystemEnabled: beltSystemEnabled ?? false,
        testNamingConvention: testNamingConvention || "INTO_RANK",
      },
    });

    return NextResponse.json({ style }, { status: 201 });
  } catch (error) {
    console.error("Error creating style:", error);
    return new NextResponse("Failed to create style", { status: 500 });
  }
}
