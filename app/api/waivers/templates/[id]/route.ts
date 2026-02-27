import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const template = await prisma.waiverTemplate.findUnique({ where: { id: params.id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await req.json();
    const { name, content, isActive, isDefault } = body;

    if (isDefault) {
      await prisma.waiverTemplate.updateMany({
        where: { isDefault: true, id: { not: params.id } },
        data: { isDefault: false },
      });
    }

    const existing = await prisma.waiverTemplate.findUnique({ where: { id: params.id } });
    const newVersion = content && content !== existing?.content ? (existing?.version || 1) + 1 : undefined;

    const template = await prisma.waiverTemplate.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(content !== undefined && { content }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
        ...(newVersion !== undefined && { version: newVersion }),
      },
    });

    logAudit({
      entityType: "WaiverTemplate",
      entityId: params.id,
      action: "UPDATE",
      summary: `Updated waiver template "${template.name}"`,
    }).catch(() => {});

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error updating waiver template:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Soft delete — mark inactive
    await prisma.waiverTemplate.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    logAudit({
      entityType: "WaiverTemplate",
      entityId: params.id,
      action: "DELETE",
      summary: "Deactivated waiver template",
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting waiver template:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
