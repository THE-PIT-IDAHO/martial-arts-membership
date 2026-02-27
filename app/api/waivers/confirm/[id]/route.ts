import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendWaiverReceivedEmail } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const clientId = await getClientId(req);

    const waiver = await prisma.signedWaiver.findUnique({
      where: { id },
      include: {
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!waiver || waiver.clientId !== clientId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (waiver.confirmed) {
      return NextResponse.json({ error: "Already confirmed" }, { status: 400 });
    }

    // 1. Mark waiver as confirmed
    await prisma.signedWaiver.update({
      where: { id },
      data: { confirmed: true, confirmedAt: new Date() },
    });

    // 2. Update member's waiver status
    await prisma.member.update({
      where: { id: waiver.memberId },
      data: { waiverSigned: true, waiverSignedAt: new Date() },
    });

    // 3. Send waiver confirmation email
    if (waiver.member.email) {
      sendWaiverReceivedEmail({
        email: waiver.member.email,
        firstName: waiver.member.firstName,
        clientId,
      }).catch(() => {});
    }

    // 4. Audit log
    logAudit({
      entityType: "SignedWaiver",
      entityId: id,
      action: "UPDATE",
      summary: `Waiver confirmed for ${waiver.member.firstName} ${waiver.member.lastName}`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error confirming waiver:", error);
    return NextResponse.json({ error: "Failed to confirm" }, { status: 500 });
  }
}
