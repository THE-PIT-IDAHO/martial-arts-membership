// POST /api/waiver-templates/[id]/duplicate
//
// Clones an existing template with a unique slug. The duplicate is never
// marked isDefault — only the seeded originals carry that flag.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { slugify, uniqueSlug } from "@/lib/waiver-templates";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const clientId = await getClientId(req);
    const { id } = await params;

    const source = await prisma.waiverTemplate.findFirst({
      where: { id, clientId },
    });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const name = `${source.name} (Copy)`;
    const slug = await uniqueSlug(clientId, slugify(name));

    const copy = await prisma.waiverTemplate.create({
      data: {
        clientId,
        name,
        slug,
        audience: source.audience,
        type: source.type,
        content: source.content,
        options: source.options,
        isActive: true,
        isDefault: false,
      },
    });

    return NextResponse.json({ template: copy }, { status: 201 });
  } catch (err) {
    console.error("Error duplicating waiver template:", err);
    return new NextResponse("Failed to duplicate template", { status: 500 });
  }
}
