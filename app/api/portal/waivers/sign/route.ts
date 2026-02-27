import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMember } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

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
    select: { id: true, templateName: true, signedAt: true },
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

    const signed = await prisma.signedWaiver.create({
      data: {
        memberId: auth.memberId,
        templateId: template?.id || null,
        templateName: template?.name || "General Waiver",
        waiverContent: template?.content || "Standard liability waiver",
        signatureData,
        clientId: "default-client",
      },
    });

    await prisma.member.update({
      where: { id: auth.memberId },
      data: { waiverSigned: true, waiverSignedAt: new Date() },
    });

    return NextResponse.json({ signedWaiver: signed }, { status: 201 });
  } catch (error) {
    console.error("Portal waiver sign error:", error);
    return NextResponse.json({ error: "Failed to sign" }, { status: 500 });
  }
}
