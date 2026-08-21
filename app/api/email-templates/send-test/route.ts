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
  const s = await getSettings(["gymName", "gymEmail", "gymLogo"], clientId);
  const gymName = s.gymName || "Our Gym";
  const gymEmail = s.gymEmail || "info@ourgym.com";
  const gymLogo = s.gymLogo || "";

  // Sample values used to render {{variables}} in a test send. Any key
  // that appears in a template body but is NOT in this map renders as
  // the literal "{{key}}" text in the email (per interpolate() below),
  // which is exactly what "Send Test" is supposed to demonstrate --
  // real sends supply their own values. Add sample values here as new
  // template variables are introduced.
  const samplePortalUrl = "https://app.example.com/portal/verify?token=test-token-not-real";
  const samplePortalSection = `
    <div style="margin:24px 0;padding:18px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <h3 style="margin:0 0 8px;color:#111;">Access your member portal</h3>
      <p style="margin:0 0 14px;color:#444;font-size:14px;">This is a preview of the "Open My Portal" card. In real sends this button uses a fresh 7-day magic-link URL.</p>
      <p style="margin:0;">
        <a href="${samplePortalUrl}" style="display:inline-block;padding:10px 20px;background:#c41111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
          Open My Portal
        </a>
      </p>
    </div>`;

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
    loginUrl: samplePortalUrl,
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
    // Portal-access + purchase variables. Test sends were rendering
    // {{portalSection}} and {{portalLoginUrl}} as literal text
    // because these weren't in the sample map -- real sends supply
    // them via mintPortalUrl().
    portalSection: samplePortalSection,
    portalLoginUrl: samplePortalUrl,
    portalUrl: samplePortalUrl,
    memberEmail: toEmail,
    magicLoginUrl: samplePortalUrl,
    transactionNumber: "TXN-TEST-2001",
    totalAmount: "$99.00",
    contractSuffix: " and your signed contract",
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
    await sendEmail({ to: [toEmail], subject: renderedSubject, html: fullHtml, clientId });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
