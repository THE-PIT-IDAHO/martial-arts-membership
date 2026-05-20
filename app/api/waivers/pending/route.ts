import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);

    // Lean select — pdfData and signatureData can each be multi-MB base64.
    // List page only needs to show the row + a link/button to view; the PDF
    // itself loads on demand from /api/portal/documents/[id]/pdf.
    const pendingWaivers = await prisma.signedWaiver.findMany({
      where: { confirmed: false, clientId },
      orderBy: { signedAt: "desc" },
      select: {
        id: true,
        memberId: true,
        templateName: true,
        signedAt: true,
        ipAddress: true,
        confirmed: true,
        confirmedAt: true,
        clientId: true,
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
