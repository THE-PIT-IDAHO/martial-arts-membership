import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-template-defaults";

// GET — list all templates (lazy-seeds defaults on first call)
export async function GET(req: Request) {
  const clientId = await getClientId(req);

  // Sync defaults on every list. Three things happen:
  //   1. Any default whose eventKey has NO DB row yet gets INSERTED.
  //      Previously we only seeded on first-ever call (count === 0),
  //      so any new default added after a tenant's first visit --
  //      like "purchase_complete" -- never appeared in the editor.
  //   2. Existing rows get their name + variables refreshed so
  //      renames and newly-supported {{tokens}} propagate.
  //   3. Subject/body are NEVER synced here -- a customized template
  //      stays customized.
  const existing = await prisma.emailTemplate.findMany({ where: { clientId } });
  const existingByEventKey = new Map(existing.map((t) => [t.eventKey, t]));

  const toCreate = DEFAULT_EMAIL_TEMPLATES.filter((t) => !existingByEventKey.has(t.eventKey));
  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((t) =>
        prisma.emailTemplate.create({
          data: {
            eventKey: t.eventKey,
            name: t.name,
            subject: t.subject,
            bodyHtml: t.bodyHtml,
            variables: JSON.stringify(t.variables),
            isCustom: false,
            clientId,
          },
        }),
      ),
    );
  }

  const defaultMap = new Map(DEFAULT_EMAIL_TEMPLATES.map((t) => [t.eventKey, t]));
  for (const tpl of existing) {
    const def = defaultMap.get(tpl.eventKey);
    if (!def) continue;
    const defaultVars = JSON.stringify(def.variables);
    const patch: { name?: string; variables?: string } = {};
    if (tpl.name !== def.name) patch.name = def.name;
    if (tpl.variables !== defaultVars) patch.variables = defaultVars;
    if (Object.keys(patch).length > 0) {
      await prisma.emailTemplate.update({ where: { id: tpl.id }, data: patch });
    }
  }

  const templates = await prisma.emailTemplate.findMany({
    where: { clientId },
    orderBy: { eventKey: "asc" },
  });

  return NextResponse.json(templates);
}

// PUT — update a template (sets isCustom: true)
export async function PUT(req: Request) {
  const clientId = await getClientId(req);
  const body = await req.json();
  const { eventKey, subject, bodyHtml } = body;

  if (!eventKey || !subject || !bodyHtml) {
    return NextResponse.json({ error: "eventKey, subject, and bodyHtml are required" }, { status: 400 });
  }

  const existing = await prisma.emailTemplate.findFirst({ where: { eventKey, clientId } });
  let template;
  if (existing) {
    template = await prisma.emailTemplate.update({
      where: { id: existing.id },
      data: {
        subject,
        bodyHtml,
        isCustom: true,
      },
    });
  } else {
    template = await prisma.emailTemplate.create({
      data: {
        eventKey,
        name: body.name || eventKey,
        subject,
        bodyHtml,
        variables: body.variables || "[]",
        isCustom: true,
        clientId,
      },
    });
  }

  return NextResponse.json(template);
}

// PATCH — toggle enabled/disabled for a template
export async function PATCH(req: Request) {
  const clientId = await getClientId(req);
  const body = await req.json();
  const { eventKey, enabled } = body;

  if (!eventKey || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "eventKey and enabled (boolean) are required" }, { status: 400 });
  }

  const existing = await prisma.emailTemplate.findFirst({ where: { eventKey, clientId } });
  if (!existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const template = await prisma.emailTemplate.update({
    where: { id: existing.id },
    data: { enabled },
  });

  return NextResponse.json(template);
}
