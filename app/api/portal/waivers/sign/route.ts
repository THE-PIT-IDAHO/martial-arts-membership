import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { sendWaiverReceivedEmail } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get default active template
  const template = await prisma.waiverTemplate.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true, name: true, content: true },
  });

  // Get already-signed waivers
  const signed = await prisma.signedWaiver.findMany({
    where: { memberId: auth.memberId },
    orderBy: { signedAt: "desc" },
    select: { id: true, templateName: true, signedAt: true, confirmed: true },
  });

  return NextResponse.json({ template, signed });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { templateId, signatureData } = await request.json();
    if (!signatureData) {
      return NextResponse.json({ error: "Signature required" }, { status: 400 });
    }

    let template;
    if (templateId) {
      template = await prisma.waiverTemplate.findUnique({ where: { id: templateId } });
    } else {
      template = await prisma.waiverTemplate.findFirst({
        where: { isDefault: true, isActive: true },
      });
    }

    const clientId = await getClientId(request);

    const signed = await prisma.signedWaiver.create({
      data: {
        memberId: auth.memberId,
        templateId: template?.id || null,
        templateName: template?.name || "General Waiver",
        waiverContent: template?.content || "Standard liability waiver",
        signatureData,
        confirmed: false,
        clientId,
      },
    });

    // Send waiver received confirmation email
    const member = await prisma.member.findUnique({
      where: { id: auth.memberId },
      select: { firstName: true, email: true },
    });
    if (member?.email) {
      sendWaiverReceivedEmail({
        email: member.email,
        firstName: member.firstName,
        clientId,
      }).catch(() => {});
    }

    return NextResponse.json({ signedWaiver: signed }, { status: 201 });
  } catch (error) {
    console.error("Portal waiver sign error:", error);
    return NextResponse.json({ error: "Failed to sign" }, { status: 500 });
  }
}
