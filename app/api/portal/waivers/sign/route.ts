import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedMember(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scope template lookup to the member's tenant so we don't surface
  // another gym's default waiver to this member.
  const me = await prisma.member.findUnique({
    where: { id: auth.memberId },
    select: { clientId: true },
  });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await prisma.waiverTemplate.findFirst({
    where: { isDefault: true, isActive: true, clientId: me.clientId },
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

    const clientId = await getClientId(request);

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

    return NextResponse.json({ signedWaiver: signed }, { status: 201 });
  } catch (error) {
    console.error("Portal waiver sign error:", error);
    return NextResponse.json({ error: "Failed to sign" }, { status: 500 });
  }
}
