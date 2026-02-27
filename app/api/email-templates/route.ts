import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-template-defaults";

// GET — list all templates (lazy-seeds defaults on first call)
export async function GET() {
  // Lazy-seed: if no templates in DB yet, insert all defaults
  const count = await prisma.emailTemplate.count();
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
          },
        })
      )
    );
  }

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { eventKey: "asc" },
  });

  return NextResponse.json(templates);
}

// PUT — update a template (sets isCustom: true)
export async function PUT(req: Request) {
  const body = await req.json();
  const { eventKey, subject, bodyHtml } = body;

  if (!eventKey || !subject || !bodyHtml) {
    return NextResponse.json({ error: "eventKey, subject, and bodyHtml are required" }, { status: 400 });
  }

  const template = await prisma.emailTemplate.upsert({
    where: { eventKey },
    update: {
      subject,
      bodyHtml,
      isCustom: true,
    },
    create: {
      eventKey,
      name: body.name || eventKey,
      subject,
      bodyHtml,
      variables: body.variables || "[]",
      isCustom: true,
    },
  });

  return NextResponse.json(template);
}

// PATCH — toggle enabled/disabled for a template
export async function PATCH(req: Request) {
  const body = await req.json();
  const { eventKey, enabled } = body;

  if (!eventKey || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "eventKey and enabled (boolean) are required" }, { status: 400 });
  }

  const template = await prisma.emailTemplate.update({
    where: { eventKey },
    data: { enabled },
  });

  return NextResponse.json(template);
}
