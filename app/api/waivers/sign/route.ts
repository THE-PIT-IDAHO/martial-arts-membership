import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendWaiverReceivedEmail } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const clientId = await getClientId(request);
    const {
      memberId,
      templateId,
      signatureData,
      waiverContent: bodyWaiverContent,
      templateName: bodyTemplateName,
    } = await request.json();

    if (!memberId || !signatureData) {
      return NextResponse.json(
        { error: "memberId and signatureData are required" },
        { status: 400 }
      );
    }

    // Verify memberId belongs to this tenant before creating the row.
    // Without this, an admin can POST a foreign gym's memberId and
    // the SignedWaiver ends up stamped clientId=A but memberId FK -> B
    // (dangling cross-tenant relationship; audit log leaks the id).
    // Also pull email + firstName so we can fire the "waiver received"
    // acknowledgment email below without a second round-trip.
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { clientId: true, email: true, firstName: true },
    });
    if (!member || member.clientId !== clientId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Get template (or use default) — scoped to this tenant. Without
    // the clientId guard, a member could sign a template that belongs
    // to a different gym entirely.
    let template;
    if (templateId) {
      template = await prisma.waiverTemplate.findFirst({
        where: { id: templateId, clientId },
      });
    } else {
      template = await prisma.waiverTemplate.findFirst({
        where: { isDefault: true, isActive: true, clientId },
      });
    }

    const templateName = bodyTemplateName || template?.name || "General Waiver";
    const waiverContent = bodyWaiverContent || template?.content || "Standard liability waiver";

    const signed = await prisma.signedWaiver.create({
      data: {
        memberId,
        templateId: template?.id || null,
        templateName,
        waiverContent,
        signatureData,
        // Waivers auto-confirm on submit -- admin confirmation flow
        // was removed. See prisma/migrations/20260821_waiver_auto_confirm.
        confirmed: true,
        confirmedAt: new Date(),
        clientId,
      },
    });

    logAudit({
      entityType: "SignedWaiver",
      entityId: signed.id,
      action: "CREATE",
      summary: `Waiver signed for member ${memberId}: ${templateName}`,
      clientId,
    }).catch(() => {});

    // Fire the "waiver received" acknowledgment the instant they hit
    // submit -- most people expect an immediate confirmation email
    // after signing an online form, not silence until an admin
    // manually clicks Confirm on the Waivers page. Fire-and-forget:
    // Resend failure doesn't block the signed-waiver response.
    if (member.email) {
      sendWaiverReceivedEmail({
        email: member.email,
        firstName: member.firstName || "there",
        memberId,
        clientId,
      }).catch((err) => {
        console.error("[waivers/sign] acknowledgment email failed:", err);
      });
    }

    return NextResponse.json({ signedWaiver: signed }, { status: 201 });
  } catch (error) {
    console.error("Error signing waiver:", error);
    return NextResponse.json({ error: "Failed to sign waiver" }, { status: 500 });
  }
}
