import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/members/[id]/test-results - Get test results for a member
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const styleName = searchParams.get("styleName");
    const limit = searchParams.get("limit");

    // Get test results for this member, optionally filtered by style
    const testResults = await prisma.testingParticipant.findMany({
      where: {
        memberId: id,
        ...(styleName && {
          testingEvent: {
            styleName: {
              equals: styleName,
            },
          },
        }),
      },
      include: {
        testingEvent: {
          select: {
            id: true,
            name: true,
            date: true,
            styleName: true,
            status: true,
          },
        },
      },
      orderBy: {
        testingEvent: {
          date: "desc",
        },
      },
      ...(limit && { take: parseInt(limit, 10) }),
    });

    return NextResponse.json({ testResults });
  } catch (error) {
    console.error("Error fetching member test results:", error);
    return new NextResponse("Failed to load test results", { status: 500 });
  }
}
