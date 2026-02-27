import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);

    const pendingWaivers = await prisma.signedWaiver.findMany({
      where: { confirmed: false, clientId },
      orderBy: { signedAt: "desc" },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({ pendingWaivers });
  } catch (error) {
    console.error("Error fetching pending waivers:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
