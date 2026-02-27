import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getDefaultTemplate } from "@/lib/email-template-defaults";
import { getSettings } from "@/lib/email";

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

// POST — render a preview of a template with sample data
export async function POST(req: Request) {
  const clientId = await getClientId(req);
  const { eventKey, subject: overrideSubject, bodyHtml: overrideBody } = await req.json();

  if (!eventKey) {
    return NextResponse.json({ error: "eventKey is required" }, { status: 400 });
  }

  // Get subject + body from override or DB or default
  let subject: string;
  let bodyHtml: string;

  if (overrideSubject && overrideBody) {
    subject = overrideSubject;
    bodyHtml = overrideBody;
  } else {
    const dbTpl = await prisma.emailTemplate.findFirst({ where: { eventKey, clientId } });
    if (dbTpl) {
      subject = dbTpl.subject;
      bodyHtml = dbTpl.bodyHtml;
    } else {
      const def = getDefaultTemplate(eventKey);
      if (!def) return NextResponse.json({ error: "Template not found" }, { status: 404 });
      subject = def.subject;
      bodyHtml = def.bodyHtml;
    }
  }

  // Build sample variables
  const s = await getSettings(["gymName", "gymEmail", "gymLogo"]);
  const gymName = s.gymName || "Our Gym";
  const gymEmail = s.gymEmail || "info@ourgym.com";
  const gymLogo = s.gymLogo || "";

  const sampleVars: Record<string, string> = {
    memberName: "John Doe",
    firstName: "John",
    gymName,
    gymEmail,
    gymPhone: "(555) 123-4567",
    invoiceNumber: "INV-2026-0001",
    planName: "Unlimited Monthly",
    amount: "$149.00",
    dueDate: "March 1, 2026",
    expiryDate: "April 15, 2026",
    expiresAt: "March 30, 2026",
    daysRemaining: "14",
    daysSinceLastClass: "21",
    newRank: "Blue Belt",
    styleName: "Brazilian Jiu-Jitsu",
    className: "Advanced BJJ",
    classDate: "Mon, Mar 2",
    classTime: "6:00 PM",
    waitlistPosition: "3",
    loginUrl: "https://example.com/portal/verify?token=sample",
    subject: "Important Update",
    message: "This is a sample custom message body.",
    effectiveDate: "April 1, 2026",
    earlyTerminationFee: "",
    classesRemaining: "3 classes",
    itemName: "White Gi (Size M)",
    currentQuantity: "2",
    threshold: "5",
    eligibleList: `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr style="background:#f3f4f6;">
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Member</th>
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Style</th>
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Promotion</th>
      </tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;">John Doe</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">BJJ</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">White → Blue</td></tr>
    </table>`,
    eligibleCount: "1",
  };

  const renderedSubject = interpolate(subject, sampleVars);
  const renderedBody = interpolate(bodyHtml, sampleVars);

  // Wrap in email chrome
  const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#c41111;padding:20px;text-align:center;">
      ${gymLogo ? `<img src="${gymLogo}" alt="${gymName}" style="max-height:60px;">` : `<h1 style="color:#fff;margin:0;font-size:24px;">${gymName}</h1>`}
    </div>
    <div style="padding:24px;">
      ${renderedBody}
    </div>
    <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
      ${gymName}
    </div>
  </div>
</body>
</html>`;

  return NextResponse.json({ subject: renderedSubject, html: fullHtml });
}
