import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTemplate } from "@/lib/email-template-defaults";

// POST — reset a template to its default (isCustom: false)
export async function POST(_req: Request, props: { params: Promise<{ eventKey: string }> }) {
  const params = await props.params;
  const { eventKey } = params;
  const def = getDefaultTemplate(eventKey);
  if (!def) return NextResponse.json({ error: "No default template for this key" }, { status: 404 });

  const template = await prisma.emailTemplate.upsert({
    where: { eventKey },
    update: {
      subject: def.subject,
      bodyHtml: def.bodyHtml,
      isCustom: false,
    },
    create: {
      eventKey: def.eventKey,
      name: def.name,
      subject: def.subject,
      bodyHtml: def.bodyHtml,
      variables: JSON.stringify(def.variables),
      isCustom: false,
    },
  });

  return NextResponse.json(template);
}
