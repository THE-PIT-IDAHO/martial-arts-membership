import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-template-defaults";

// GET — list all templates (lazy-seeds defaults on first call)
export async function GET(req: Request) {
  const clientId = await getClientId(req);

  // Lazy-seed: if no templates in DB yet for this tenant, insert all defaults
  const count = await prisma.emailTemplate.count({ where: { clientId } });
  if (count === 0) {
    await prisma.$transaction(
      DEFAULT_EMAIL_TEMPLATES.map((t) =>
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
        })
      )
    );
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
