import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const templates = await prisma.waiverTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { signedWaivers: true } } },
  });
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  try {
    const { name, content, isDefault } = await request.json();
    if (!name || !content) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.waiverTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await prisma.waiverTemplate.create({
      data: { name, content, isDefault: !!isDefault, clientId: "default-client" },
    });

    logAudit({
      entityType: "WaiverTemplate",
      entityId: template.id,
      action: "CREATE",
      summary: `Created waiver template "${name}"`,
    }).catch(() => {});

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Error creating waiver template:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
