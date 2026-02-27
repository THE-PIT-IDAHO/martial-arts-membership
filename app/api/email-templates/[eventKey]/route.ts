import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTemplate } from "@/lib/email-template-defaults";

// GET — get a single template by eventKey
export async function GET(_req: Request, props: { params: Promise<{ eventKey: string }> }) {
  const params = await props.params;
  const { eventKey } = params;

  const dbTpl = await prisma.emailTemplate.findUnique({ where: { eventKey } });
  if (dbTpl) return NextResponse.json(dbTpl);

  // Fall back to default
  const def = getDefaultTemplate(eventKey);
  if (!def) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({
    eventKey: def.eventKey,
    name: def.name,
    subject: def.subject,
    bodyHtml: def.bodyHtml,
    variables: JSON.stringify(def.variables),
    isCustom: false,
  });
}
