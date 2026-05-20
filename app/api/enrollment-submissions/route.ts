import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/enrollment-submissions
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const submissions = await prisma.enrollmentSubmission.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
    });

    // Get plan names for submissions with selectedPlanId — scoped to this
    // tenant so a stale or cross-tenant planId can't surface a different
    // gym's plan name.
    const planIds = submissions
      .map((s) => s.selectedPlanId)
      .filter((id): id is string => !!id);

    const plans = planIds.length > 0
      ? await prisma.membershipPlan.findMany({
          where: { id: { in: planIds }, clientId },
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
