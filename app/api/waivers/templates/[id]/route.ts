import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const clientId = await getClientId(_req);
  const template = await prisma.waiverTemplate.findFirst({ where: { id: params.id, clientId } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const { name, content, isActive, isDefault } = body;

    // Verify template belongs to tenant
    const check = await prisma.waiverTemplate.findFirst({ where: { id: params.id, clientId }, select: { id: true } });
    if (!check) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (isDefault) {
      await prisma.waiverTemplate.updateMany({
        where: { isDefault: true, id: { not: params.id }, clientId },
        data: { isDefault: false },
      });
    }

    // Verify the template belongs to this tenant before reading old
    // content or applying updates. The PATCH used to operate on any
    // template by id with no tenant check.
    const existing = await prisma.waiverTemplate.findFirst({
      where: { id: params.id, clientId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const newVersion = content && content !== existing.content ? (existing.version || 1) + 1 : undefined;

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
      clientId,
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
    const clientId = await getClientId(_req);
    // Verify template belongs to tenant
    const check = await prisma.waiverTemplate.findFirst({ where: { id: params.id, clientId }, select: { id: true } });
    if (!check) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      clientId,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting waiver template:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
