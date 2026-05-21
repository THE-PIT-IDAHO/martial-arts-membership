// GET    /api/waiver-templates/[id]  — fetch full template (with content + options)
// PATCH  /api/waiver-templates/[id]  — update fields (name, audience, content, options, slug, isActive)
// DELETE /api/waiver-templates/[id]  — archive (soft delete) unless ?hard=1 and not isDefault
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { slugify, uniqueSlug } from "@/lib/waiver-templates";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const template = await prisma.waiverTemplate.findFirst({
      where: { id, clientId },
    });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ template });
  } catch (err) {
    console.error("Error fetching waiver template:", err);
    return new NextResponse("Failed to fetch template", { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const existing = await prisma.waiverTemplate.findFirst({
      where: { id, clientId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body.audience === "adult" || body.audience === "guardian") data.audience = body.audience;
    if (typeof body.content === "string") data.content = body.content;
    if (typeof body.options === "string") data.options = body.options;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    if (typeof body.slug === "string" && body.slug.trim() && body.slug !== existing.slug) {
      data.slug = await uniqueSlug(clientId, slugify(body.slug), existing.id);
    }

    const template = await prisma.waiverTemplate.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json({ template });
  } catch (err) {
    console.error("Error updating waiver template:", err);
    return new NextResponse("Failed to update template", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const existing = await prisma.waiverTemplate.findFirst({
      where: { id, clientId },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.isDefault) {
      return NextResponse.json(
        { error: "Cannot delete the default template — duplicate it and edit instead." },
        { status: 400 },
      );
    }

    // Soft delete: archive so SignedWaiver rows that reference this template
    // keep resolving. Existing signed waivers reference templateId as a
    // foreign key; deleting the row would break those references.
    await prisma.waiverTemplate.update({
      where: { id: existing.id },
      data: { archivedAt: new Date(), isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error archiving waiver template:", err);
    return new NextResponse("Failed to delete template", { status: 500 });
  }
}
