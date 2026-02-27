import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getDefaultTemplate } from "@/lib/email-template-defaults";

// POST — reset a template to its default (isCustom: false)
export async function POST(req: Request, props: { params: Promise<{ eventKey: string }> }) {
  const clientId = await getClientId(req);
  const params = await props.params;
  const { eventKey } = params;
  const def = getDefaultTemplate(eventKey);
  if (!def) return NextResponse.json({ error: "No default template for this key" }, { status: 404 });

  const existing = await prisma.emailTemplate.findFirst({ where: { eventKey, clientId } });
  let template;
  if (existing) {
    template = await prisma.emailTemplate.update({
      where: { id: existing.id },
      data: {
        subject: def.subject,
        bodyHtml: def.bodyHtml,
        isCustom: false,
      },
    });
  } else {
    template = await prisma.emailTemplate.create({
      data: {
        eventKey: def.eventKey,
        name: def.name,
        subject: def.subject,
        bodyHtml: def.bodyHtml,
        variables: JSON.stringify(def.variables),
        isCustom: false,
        clientId,
      },
    });
  }

  return NextResponse.json(template);
}
