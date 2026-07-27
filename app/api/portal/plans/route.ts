import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/portal/plans — public endpoint used by the online-enrollment
// page. Scoped to the calling tenant via the subdomain slug so gymA's
// enrollment page can't list gymB's plans (and, worse, hand back a
// gymB plan-id that the enroll POST would then store on gymA's
// EnrollmentSubmission).
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const plans = await prisma.membershipPlan.findMany({
      where: { isActive: true, clientId },
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        billingCycle: true,
        autoRenew: true,
        trialDays: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json(plans);
  } catch (error) {
    console.error("Error fetching plans:", error);
    return new NextResponse("Failed to load plans", { status: 500 });
  }
}
