import { NextResponse } from "next/server";
import { sendEmail, getSettings } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";
import { getDefaultTemplate } from "@/lib/email-template-defaults";

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

// POST — send a test email to a specified address
export async function POST(req: Request) {
  const clientId = await getClientId(req);
  const { eventKey, toEmail } = await req.json();

  if (!eventKey || !toEmail) {
    return NextResponse.json({ error: "eventKey and toEmail are required" }, { status: 400 });
  }

  // Get template
  let subject: string;
  let bodyHtml: string;

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

  // Sample variables
  const s = await getSettings(["gymName", "gymEmail", "gymLogo"]);
  const gymName = s.gymName || "Our Gym";
  const gymEmail = s.gymEmail || "info@ourgym.com";
  const gymLogo = s.gymLogo || "";

  const sampleVars: Record<string, string> = {
    memberName: "Test User",
    firstName: "Test",
    gymName,
    gymEmail,
    gymPhone: "(555) 123-4567",
    invoiceNumber: "INV-TEST-0001",
    planName: "Test Plan",
    amount: "$99.00",
    dueDate: "March 1, 2026",
    expiryDate: "April 15, 2026",
    expiresAt: "March 30, 2026",
    daysRemaining: "14",
    daysSinceLastClass: "21",
    newRank: "Blue Belt",
    styleName: "Brazilian Jiu-Jitsu",
    className: "Test Class",
    classDate: "Mon, Mar 2",
    classTime: "6:00 PM",
    waitlistPosition: "3",
    loginUrl: "https://example.com/portal/verify?token=test",
    subject: "Test Subject",
    message: "This is a test email message.",
    effectiveDate: "April 1, 2026",
    earlyTerminationFee: "",
    classesRemaining: "3 classes",
    itemName: "Test Item",
    currentQuantity: "2",
    threshold: "5",
    eligibleList: "<p><em>Sample eligibility list</em></p>",
    eligibleCount: "1",
  };

  const renderedSubject = `[TEST] ${interpolate(subject, sampleVars)}`;
  const renderedBody = interpolate(bodyHtml, sampleVars);

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

  try {
    await sendEmail({ to: [toEmail], subject: renderedSubject, html: fullHtml });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
