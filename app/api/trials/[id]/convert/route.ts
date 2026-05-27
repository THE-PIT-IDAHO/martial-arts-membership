import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getClientId } from "@/lib/tenant";

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = await getClientId(req);
    const { membershipPlanId } = await req.json();
    if (!membershipPlanId) {
      return NextResponse.json({ error: "membershipPlanId required" }, { status: 400 });
    }

    const trial = await prisma.trialPass.findUnique({
      where: { id: params.id },
      include: { member: true },
    });
    // Trial's tenant is its owning member's tenant. Without this guard
    // an admin could convert another gym's trial.
    if (!trial || trial.member.clientId !== clientId) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    // Plan must also be in the same tenant — prevents linking a trial
    // to a plan in a different gym.
    const plan = await prisma.membershipPlan.findFirst({
      where: { id: membershipPlanId, clientId },
    });
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // Create membership
    const membership = await prisma.membership.create({
      data: {
        memberId: trial.memberId,
        membershipPlanId,
        startDate: new Date(),
        status: "ACTIVE",
        nextPaymentDate: new Date(),
      },
    });

    // Update trial status
    await prisma.trialPass.update({
      where: { id: params.id },
      data: { status: "CONVERTED", convertedToMembershipId: membership.id },
    });

    // Update member status to ACTIVE
    const currentStatus = trial.member.status || "";
    if (currentStatus.includes("PROSPECT") || !currentStatus.includes("ACTIVE")) {
      const newStatus = currentStatus.replace("PROSPECT", "ACTIVE") || "ACTIVE";
      await prisma.member.update({
        where: { id: trial.memberId },
        data: { status: newStatus },
      });
    }

    logAudit({
      entityType: "TrialPass",
      entityId: params.id,
      action: "CONVERT",
      summary: `Converted trial to membership "${plan.name}" for ${trial.member.firstName} ${trial.member.lastName}`,
    }).catch(() => {});

    return NextResponse.json({ membership, trial: { status: "CONVERTED" } });
  } catch (error) {
    console.error("Error converting trial:", error);
    return NextResponse.json({ error: "Failed to convert" }, { status: 500 });
  }
}
