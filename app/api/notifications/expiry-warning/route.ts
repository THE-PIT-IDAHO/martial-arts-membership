import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMembershipExpiryWarningEmail } from "@/lib/notifications";

// POST /api/notifications/expiry-warning
// Sends warning emails for non-recurring memberships expiring within N days.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const daysAhead = body.daysAhead || 14;

    const now = new Date();
    const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const expiringMemberships = await prisma.membership.findMany({
      where: {
        status: "ACTIVE",
        endDate: { gte: now, lte: cutoff },
        membershipPlan: { autoRenew: false },
      },
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, email: true, emailOptIn: true },
        },
        membershipPlan: {
          select: { name: true },
        },
      },
    });

    let sent = 0;
    for (const ms of expiringMemberships) {
      if (!ms.member.emailOptIn || !ms.member.email || !ms.endDate) continue;

      sendMembershipExpiryWarningEmail({
        memberId: ms.member.id,
        memberName: `${ms.member.firstName} ${ms.member.lastName}`,
        planName: ms.membershipPlan.name,
        expiryDate: ms.endDate,
      }).catch(() => {});
      sent++;
    }

    return NextResponse.json({ sent, expiring: expiringMemberships.length });
  } catch (error) {
    console.error("Error sending expiry warnings:", error);
    return new NextResponse("Failed to send expiry warnings", { status: 500 });
  }
}
