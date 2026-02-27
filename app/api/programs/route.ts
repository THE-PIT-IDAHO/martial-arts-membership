import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/programs
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const programs = await prisma.program.findMany({
      where: {
        isActive: true,
        clientId,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ programs });
  } catch (error) {
    console.error("Error fetching programs:", error);
    return new NextResponse("Failed to load programs", { status: 500 });
  }
}
