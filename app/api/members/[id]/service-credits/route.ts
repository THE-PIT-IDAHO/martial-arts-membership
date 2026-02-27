import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/members/[id]/service-credits
export async function GET(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

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
