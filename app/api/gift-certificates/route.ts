import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/gift-certificates - List all gift certificates
export async function GET() {
  try {
    const certificates = await prisma.giftCertificate.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ certificates });
  } catch (error) {
    console.error("Error fetching gift certificates:", error);
    return new NextResponse("Failed to fetch gift certificates", { status: 500 });
  }
}
