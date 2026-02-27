import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const clientId = await getClientId(request);
    const { memberId, templateId, signatureData } = await request.json();

    if (!memberId || !signatureData) {
      return NextResponse.json(
        { error: "memberId and signatureData are required" },
        { status: 400 }
      );
    }

    // Get template (or use default)
    let template;
    if (templateId) {
      template = await prisma.waiverTemplate.findUnique({ where: { id: templateId } });
    } else {
      template = await prisma.waiverTemplate.findFirst({
        where: { isDefault: true, isActive: true },
      });
    }

    const templateName = template?.name || "General Waiver";
    const waiverContent = template?.content || "Standard liability waiver";

    const signed = await prisma.signedWaiver.create({
      data: {
        memberId,
        templateId: template?.id || null,
        templateName,
        waiverContent,
        signatureData,
        clientId,
      },
    });

    // Update member waiver status
    await prisma.member.update({
      where: { id: memberId },
      data: { waiverSigned: true, waiverSignedAt: new Date() },
    });

    logAudit({
      entityType: "SignedWaiver",
      entityId: signed.id,
      action: "CREATE",
      summary: `Waiver signed for member ${memberId}: ${templateName}`,
    }).catch(() => {});

    return NextResponse.json({ signedWaiver: signed }, { status: 201 });
  } catch (error) {
    console.error("Error signing waiver:", error);
    return NextResponse.json({ error: "Failed to sign waiver" }, { status: 500 });
  }
}
