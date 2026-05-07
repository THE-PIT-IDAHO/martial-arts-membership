import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/contracts — list all signed contracts
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const url = new URL(req.url);
    const search = url.searchParams.get("search");

    const contracts = await prisma.signedContract.findMany({
      where: {
        clientId,
        ...(search ? {
          member: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          },
        } : {}),
      },
      select: {
        id: true,
        planName: true,
        fileName: true,
        signedAt: true,
        pdfData: false, // Don't send PDF data in list — fetch per contract
        member: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { signedAt: "desc" },
    });

    return NextResponse.json({ contracts });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return new NextResponse("Failed to fetch contracts", { status: 500 });
  }
}
