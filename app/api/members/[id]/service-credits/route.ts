import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/members/[id]/service-credits
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const clientId = await getClientId(_req);

    // Verify member belongs to this tenant
    const member = await prisma.member.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!member || member.clientId !== clientId) {
      return new NextResponse("Member not found", { status: 404 });
    }

    // Auto-expire any appointment credits that are past their expiresAt
    await prisma.memberServiceCredit.updateMany({
      where: {
        memberId: id,
        status: "ACTIVE",
        expiresAt: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });

    const credits = await prisma.memberServiceCredit.findMany({
      where: { memberId: id },
      include: {
        servicePackage: {
          include: {
            appointment: { select: { id: true, title: true, duration: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ credits });
  } catch (error) {
    console.error("Error fetching member appointment credits:", error);
    return new NextResponse("Failed to load appointment credits", { status: 500 });
  }
}
