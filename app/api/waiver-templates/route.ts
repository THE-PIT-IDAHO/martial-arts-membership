// Admin CRUD for WaiverTemplate.
//
// GET  /api/waiver-templates             — list active templates for tenant
// POST /api/waiver-templates             — create new template
//
// First call per-tenant lazily seeds two default templates from the
// existing waiver_content / waiver_options settings so nothing visibly
// changes for current gyms.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { ensureSeedTemplates, slugify, uniqueSlug } from "@/lib/waiver-templates";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const clientId = await getClientId(req);
    await ensureSeedTemplates(clientId);

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("includeArchived") === "1";

    const templates = await prisma.waiverTemplate.findMany({
      where: {
        clientId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        audience: true,
        type: true,
        isDefault: true,
        isActive: true,
        archivedAt: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("Error listing waiver templates:", err);
    return new NextResponse("Failed to list templates", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json();
    const name: string = (body.name || "").trim();
    const audience: string = body.audience === "guardian" ? "guardian" : "adult";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const slug = await uniqueSlug(clientId, slugify(body.slug || name));

    const template = await prisma.waiverTemplate.create({
      data: {
        clientId,
        name,
        slug,
        audience,
        type: typeof body.type === "string" && body.type.trim() ? body.type.trim() : null,
        content: body.content || "[]",
        options: body.options || JSON.stringify({ includeMinorSignature: true, includeMinorEmail: true }),
        isActive: true,
        isDefault: false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    console.error("Error creating waiver template:", err);
    return new NextResponse("Failed to create template", { status: 500 });
  }
}
