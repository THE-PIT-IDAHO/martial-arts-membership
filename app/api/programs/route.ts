import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/programs
export async function GET() {
  try {
    const programs = await prisma.program.findMany({
      where: {
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ programs });
  } catch (error) {
    console.error("Error fetching programs:", error);
    return new NextResponse("Failed to load programs", { status: 500 });
  }
}
