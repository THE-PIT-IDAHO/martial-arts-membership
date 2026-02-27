import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/gift-certificates - List all gift certificates
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const certificates = await prisma.giftCertificate.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ certificates });
  } catch (error) {
    console.error("Error fetching gift certificates:", error);
    return new NextResponse("Failed to fetch gift certificates", { status: 500 });
  }
}
