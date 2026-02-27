import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/enrollment-submissions
export async function GET() {
  try {
    const submissions = await prisma.enrollmentSubmission.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Get plan names for submissions with selectedPlanId
    const planIds = submissions
      .map((s) => s.selectedPlanId)
      .filter((id): id is string => !!id);

    const plans = planIds.length > 0
      ? await prisma.membershipPlan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, name: true },
        })
      : [];

    const planMap = new Map(plans.map((p) => [p.id, p.name]));

    const result = submissions.map((s) => ({
      ...s,
      planName: s.selectedPlanId ? planMap.get(s.selectedPlanId) || null : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    return new NextResponse("Failed to load enrollments", { status: 500 });
  }
}
