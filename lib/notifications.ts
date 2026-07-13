import { sendEmail, resolveRecipientEmails, getSettings } from "@/lib/email";
import { resolveTemplate as _resolveTemplate } from "@/lib/email-template-resolver";
import { prisma } from "@/lib/prisma";
import { generateMagicLinkToken } from "@/lib/portal-auth";

// Wrapper: returns { subject, bodyHtml } or null if the template is disabled
// for this tenant — OR if we can't resolve which tenant to send for, since
// running unscoped would leak / inherit another tenant's template state.
//
// scope can be either an explicit clientId or a memberId we derive it from.
async function resolveTemplate(
  eventKey: string,
  variables: Record<string, string>,
  scope: { clientId?: string; memberId?: string },
): Promise<{ subject: string; bodyHtml: string } | null> {
  const clientId = await resolveClientId(scope);
  if (!clientId) return null;
  return _resolveTemplate(eventKey, variables, clientId);
}

// Derive the acting tenant from a memberId when the caller didn't pass
// clientId explicitly. Returns null if the member isn't found.
async function resolveClientId(opts: {
  clientId?: string;
  memberId?: string;
}): Promise<string | null> {
  if (opts.clientId) return opts.clientId;
  if (!opts.memberId) return null;
  const m = await prisma.member.findUnique({
    where: { id: opts.memberId },
    select: { clientId: true },
  });
  return m?.clientId || null;
}

// --- Branding ---

async function getGymBranding(clientId?: string) {
  // Refuse to fall back to an unscoped Settings read. Without a clientId,
  // getSettings will hand back the first Settings row it finds across
  // every tenant — which is how a test gym's receipt started arriving
  // branded as "THE PIT". Return generic values instead so nothing
  // leaks, and let the caller notice + pass a clientId.
  if (!clientId) {
    console.error("[getGymBranding] called without clientId — returning generic branding to avoid cross-tenant leak");
    return {
      gymName: "Our Gym",
      gymEmail: "",
      gymPhone: "",
      gymLogo: "",
    };
  }
  const s = await getSettings(["gymName", "gymEmail", "gymPhone", "gymLogo"], clientId);
  return {
    gymName: s.gymName || "Our Gym",
    gymEmail: s.gymEmail || "",
    gymPhone: s.gymPhone || "",
    gymLogo: s.gymLogo || "",
  };
}

function wrapInTemplate(brand: { gymName: string; gymLogo: string }, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:20px;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#c41111;padding:20px;text-align:center;">
      ${brand.gymLogo ? `<img src="${brand.gymLogo}" alt="${brand.gymName}" style="max-height:60px;">` : `<h1 style="color:#fff;margin:0;font-size:24px;">${brand.gymName}</h1>`}
    </div>
    <div style="padding:24px;">
      ${body}
    </div>
    <div style="background:#f3f4f6;padding:16px;text-align:center;font-size:12px;color:#6b7280;">
      ${brand.gymName}
    </div>
  </div>
</body>
</html>`;
}

// --- Helpers ---

async function isEnabled(settingKey: string): Promise<boolean> {
  const s = await getSettings([settingKey]);
  return s[settingKey] !== "false";
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Resolve the portal base URL. Used to build magic-link URLs from server-side
// jobs (cron, webhook handlers) that don't have a request context.
function getPortalBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "https://app.dojostormsoftware.com";
}

// Build the "Open My Portal" CTA block included in welcome / waiver-confirm
// / contract-signed emails. Returns empty string when the member has no
// email (no token can be minted). expiresInMinutes defaults to 7 days for
// account-setup emails — much longer than the 15-min default for regular
// login magic links since these may sit unopened for days.
export async function buildPortalSection(params: {
  memberId: string;
  expiresInMinutes?: number;
  blurb?: string;
}): Promise<string> {
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { email: true },
  });
  if (!member?.email) return "";

  try {
    const token = await generateMagicLinkToken(
      params.memberId,
      member.email,
      params.expiresInMinutes ?? 60 * 24 * 7, // 7 days
    );
    const portalUrl = `${getPortalBaseUrl()}/portal/verify?token=${token}`;
    const expiryDays = Math.round((params.expiresInMinutes ?? 60 * 24 * 7) / (60 * 24));
    const blurb =
      params.blurb
      ?? "Use the button below to sign in to your member portal — book classes, view payments, and update your profile.";
    return `
      <div style="margin:24px 0;padding:18px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <h3 style="margin:0 0 8px;color:#111;">Access your member portal</h3>
        <p style="margin:0 0 14px;color:#444;font-size:14px;">${blurb}</p>
        <p style="margin:0;">
          <a href="${portalUrl}" style="display:inline-block;padding:10px 20px;background:#c41111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
            Open My Portal
          </a>
        </p>
        <p style="margin:12px 0 0;color:#777;font-size:12px;">
          This link works for the next ${expiryDays} day${expiryDays === 1 ? "" : "s"}. Once you're in, you can set a permanent password under Profile.
        </p>
      </div>
    `;
  } catch (err) {
    console.error("Failed to build portal section:", err);
    return "";
  }
}

// --- 1. Welcome Email ---

export async function sendWelcomeEmail(params: {
  memberId: string;
  memberName: string;
}) {
  if (!(await isEnabled("notify_welcome_email"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const portalSection = await buildPortalSection({ memberId: params.memberId });
  const resolved = await resolveTemplate("welcome", {
    memberName: params.memberName,
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
    portalSection,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "WELCOME" });
}

// --- 2. Invoice Created ---

export async function sendInvoiceCreatedEmail(params: {
  memberId: string;
  memberName: string;
  invoiceNumber: string;
  amountCents: number;
  dueDate: Date;
  planName: string;
}) {
  if (!(await isEnabled("notify_invoice_created"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("invoice_created", {
    memberName: params.memberName,
    invoiceNumber: params.invoiceNumber,
    planName: params.planName,
    amount: formatCents(params.amountCents),
    dueDate: formatDate(params.dueDate),
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "INVOICE_CREATED" });
}

// --- 3. Payment Received ---

export async function sendPaymentReceivedEmail(params: {
  memberId: string;
  memberName: string;
  amountCents: number;
  invoiceNumber?: string;
  planName?: string;
}) {
  if (!(await isEnabled("notify_payment_received"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("payment_received", {
    memberName: params.memberName,
    amount: formatCents(params.amountCents),
    planName: params.planName ? ` for ${params.planName}` : "",
    invoiceNumber: params.invoiceNumber ? `<p style="color:#6b7280;">Invoice: ${params.invoiceNumber}</p>` : "",
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "PAYMENT_RECEIVED" });
}

// --- 4. Past Due Alert ---

export async function sendPastDueAlertEmail(params: {
  memberId: string;
  memberName: string;
  amountCents: number;
  invoiceNumber?: string;
  dueDate: Date;
}) {
  if (!(await isEnabled("notify_past_due"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("past_due", {
    memberName: params.memberName,
    amount: formatCents(params.amountCents),
    dueDate: formatDate(params.dueDate),
    invoiceNumber: params.invoiceNumber ? `<p style="color:#6b7280;">Invoice: ${params.invoiceNumber}</p>` : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "PAST_DUE" });
}

// --- 5. Promotion Congrats ---

export async function sendPromotionCongratsEmail(params: {
  memberId: string;
  memberName: string;
  newRank: string;
  styleName: string;
}) {
  if (!(await isEnabled("notify_promotion"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("promotion_congrats", {
    memberName: params.memberName,
    newRank: params.newRank,
    styleName: params.styleName,
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "PROMOTION_CONGRATS" });
}

// --- 6. Class Reminder ---

export async function sendClassReminderEmail(params: {
  memberId: string;
  memberName: string;
  className: string;
  classDate: string;
  classTime: string;
}) {
  if (!(await isEnabled("notify_class_reminder"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("class_reminder", {
    memberName: params.memberName,
    className: params.className,
    classDate: params.classDate,
    classTime: params.classTime,
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "CLASS_REMINDER" });
}

// --- 7. Membership Expiry Warning ---

export async function sendMembershipExpiryWarningEmail(params: {
  memberId: string;
  memberName: string;
  planName: string;
  expiryDate: Date;
}) {
  if (!(await isEnabled("notify_membership_expiry"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("membership_expiry", {
    memberName: params.memberName,
    planName: params.planName,
    expiryDate: formatDate(params.expiryDate),
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "MEMBERSHIP_EXPIRY" });
}

// --- 8. Magic Link Login ---

export async function sendMagicLinkEmail(params: {
  email: string;
  memberName: string;
  loginUrl: string;
  memberId?: string;
  clientId?: string;  // pass when memberId isn't available (e.g. before member is loaded)
  linkExpiry?: string; // Human-readable expiry shown in the email body (default "15 minutes")
}): Promise<{ ok: boolean; error?: string }> {
  const clientId = await resolveClientId({ clientId: params.clientId, memberId: params.memberId });
  if (!clientId) return { ok: false, error: "Could not determine tenant for this email" };
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("magic_link", {
    memberName: params.memberName,
    loginUrl: params.loginUrl,
    linkExpiry: params.linkExpiry || "15 minutes",
    gymName: brand.gymName,
  }, { clientId });
  if (!resolved) {
    return { ok: false, error: "Magic-link email template is disabled for this gym" };
  }
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  const sent = await sendEmail({ to: [params.email], subject, html, memberId: params.memberId, clientId, eventType: "MAGIC_LINK" });
  return sent ? { ok: true } : { ok: false, error: "Email provider rejected the send (check RESEND_API_KEY and notifications setting)" };
}

// --- 8b. Password Reset Email ---

export async function sendPasswordResetEmail(params: {
  email: string;
  memberName: string;
  resetUrl: string;
  memberId?: string;
  clientId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const clientId = await resolveClientId({ clientId: params.clientId, memberId: params.memberId });
  if (!clientId) return { ok: false, error: "Could not determine tenant for this email" };
  const brand = await getGymBranding(clientId);
  let resolved = null;
  try {
    resolved = await resolveTemplate("password_reset", {
      memberName: params.memberName,
      resetUrl: params.resetUrl,
      gymName: brand.gymName,
    }, { clientId });
  } catch { /* no template, use fallback */ }
  if (resolved) {
    const html = wrapInTemplate(brand, resolved.bodyHtml);
    const sent = await sendEmail({ to: [params.email], subject: resolved.subject, html, memberId: params.memberId, clientId, eventType: "PASSWORD_RESET" });
    return sent ? { ok: true } : { ok: false, error: "Email provider rejected the send" };
  }
  // Fallback if no template configured
  const subject = `Reset your ${brand.gymName} portal password`;
  const bodyHtml = `
    <p>Hi ${params.memberName},</p>
    <p>A password reset was requested for your member portal account at <strong>${brand.gymName}</strong>.</p>
    <p>Click the button below to set a new password. This link expires in 15 minutes.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${params.resetUrl}" style="display:inline-block;padding:12px 24px;background-color:#c41111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
        Reset Password
      </a>
    </p>
    <p style="font-size:13px;color:#666;">If you didn't request this, you can safely ignore this email.</p>
  `;
  const html = wrapInTemplate(brand, bodyHtml);
  const sent = await sendEmail({ to: [params.email], subject, html, memberId: params.memberId, clientId, eventType: "PASSWORD_RESET" });
  return sent ? { ok: true } : { ok: false, error: "Email provider rejected the send" };
}

// --- 9. Booking Confirmation ---

export async function sendBookingConfirmationEmail(params: {
  memberId: string;
  memberName: string;
  className: string;
  classDate: string;
  classTime: string;
  status: string;
  waitlistPosition?: number;
}) {
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const isWaitlisted = params.status === "WAITLISTED";
  const eventKey = isWaitlisted ? "booking_waitlisted" : "booking_confirmed";
  const vars: Record<string, string> = {
    memberName: params.memberName,
    className: params.className,
    classDate: params.classDate,
    classTime: params.classTime,
    gymName: brand.gymName,
  };
  if (isWaitlisted && params.waitlistPosition) {
    vars.waitlistPosition = String(params.waitlistPosition);
  }
  const resolved = await resolveTemplate(eventKey, vars, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: isWaitlisted ? "BOOKING_WAITLISTED" : "BOOKING_CONFIRMED" });
}

// --- 10. Waitlist Promotion ---

export async function sendWaitlistPromotionEmail(params: {
  memberId: string;
  memberName: string;
  className: string;
  classDate: string;
  classTime: string;
}) {
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("waitlist_promotion", {
    memberName: params.memberName,
    className: params.className,
    classDate: params.classDate,
    classTime: params.classTime,
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "WAITLIST_PROMOTION" });
}

// --- 11. Waiver Confirmation (sent to submitter after waiver submission) ---

export async function sendWaiverReceivedEmail(params: {
  email: string;
  firstName: string;
  clientId?: string;
  memberId?: string;
}) {
  const brand = await getGymBranding(params.clientId);
  const portalSection = params.memberId
    ? await buildPortalSection({ memberId: params.memberId })
    : "";
  const resolved = await resolveTemplate("enrollment_confirmation", {
    firstName: params.firstName,
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
    portalSection,
  }, { memberId: params.memberId, clientId: params.clientId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({
    to: [params.email],
    subject,
    html,
    clientId: params.clientId,
    memberId: params.memberId,
    eventType: "WAIVER_CONFIRMED",
  });
}

// Keep old name as alias for backwards compatibility
export const sendEnrollmentConfirmationEmail = sendWaiverReceivedEmail;

// --- 11d. Contract Signed (sent to member after POS contract sign) ---

export async function sendContractSignedEmail(params: {
  memberId: string;
  memberName: string;
  planName: string;
  pdfBase64: string;
  fileName: string;
  clientId?: string;
}) {
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(params.clientId);
  const portalSection = await buildPortalSection({ memberId: params.memberId });
  const resolved = await resolveTemplate("contract_signed", {
    memberName: params.memberName,
    planName: params.planName,
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
    portalSection,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({
    to: emails,
    subject,
    html,
    attachments: [{ filename: params.fileName, content: params.pdfBase64 }],
    clientId: params.clientId,
    memberId: params.memberId,
    eventType: "CONTRACT_SIGNED",
  });
}

// --- 11b. Waiver Welcome (portal access email sent after waiver submission) ---

export async function sendWaiverWelcomeEmail(params: {
  email: string;
  memberName: string;
  portalUrl: string;
  memberId?: string;
  clientId?: string;
}) {
  const clientId = await resolveClientId({ clientId: params.clientId, memberId: params.memberId });
  if (!clientId) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("waiver_welcome", {
    memberName: params.memberName,
    memberEmail: params.email,
    portalUrl: params.portalUrl,
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  }, { memberId: params.memberId, clientId: params.clientId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: [params.email], subject, html, memberId: params.memberId, clientId, eventType: "WAIVER_WELCOME" });
}

// --- 11c. Waiver Confirmed (sent after admin confirms waiver) ---

export async function sendWaiverConfirmationEmail(params: {
  email: string;
  memberName: string;
  portalUrl: string;
  magicLoginUrl: string;
  clientId?: string;
  memberId?: string;
}) {
  const brand = await getGymBranding(params.clientId);
  const resolved = await resolveTemplate("waiver_confirmed", {
    memberName: params.memberName,
    memberEmail: params.email,
    portalUrl: params.portalUrl,
    magicLoginUrl: params.magicLoginUrl,
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  }, { memberId: params.memberId, clientId: params.clientId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: [params.email], subject, html, clientId: params.clientId, memberId: params.memberId, eventType: "WAIVER_CONFIRMED" });
}

// --- 12. Custom Message (for calendar "message attendees") ---

export async function sendCustomMessageEmail(params: {
  memberId: string;
  memberName: string;
  subject: string;
  message: string;
}) {
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("custom_message", {
    memberName: params.memberName,
    subject: params.subject,
    message: params.message,
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "CUSTOM_MESSAGE" });
}

// --- 13. Cancellation Confirmation ---

export async function sendCancellationConfirmationEmail(params: {
  memberId: string;
  memberName: string;
  planName: string;
  effectiveDate: Date;
  earlyTerminationFeeCents?: number;
}) {
  if (!(await isEnabled("notify_cancellation"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("cancellation_confirmation", {
    memberName: params.memberName,
    planName: params.planName,
    effectiveDate: formatDate(params.effectiveDate),
    earlyTerminationFee: params.earlyTerminationFeeCents
      ? `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Early Termination Fee</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${formatCents(params.earlyTerminationFeeCents)}</td></tr>`
      : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: "CANCELLATION_CONFIRMED" });
}

// --- 14. Low Stock Alert (sent to admin) ---

export async function sendLowStockAlertEmail(params: {
  itemName: string;
  currentQuantity: number;
  threshold: number;
  clientId: string;
}) {
  if (!(await isEnabled("notify_low_stock"))) return;
  const brand = await getGymBranding(params.clientId);
  const gymEmail = brand.gymEmail;
  if (!gymEmail) return;
  const resolved = await resolveTemplate("low_stock_alert", {
    itemName: params.itemName,
    currentQuantity: String(params.currentQuantity),
    threshold: String(params.threshold),
    gymName: brand.gymName,
  }, { clientId: params.clientId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: [gymEmail], subject, html });
}

// --- 15. Dunning / Payment Retry ---

export async function sendDunningEmail(params: {
  memberId: string;
  memberName: string;
  amountCents: number;
  invoiceNumber?: string;
  level: "friendly" | "urgent" | "final" | "suspension";
}) {
  if (!(await isEnabled("notify_dunning"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate(`dunning_${params.level}`, {
    memberName: params.memberName,
    amount: formatCents(params.amountCents),
    invoiceNumber: params.invoiceNumber ? `<p style="color:#6b7280;">Invoice: ${params.invoiceNumber}</p>` : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html, memberId: params.memberId, clientId, eventType: `DUNNING_${params.level.toUpperCase()}` });
}

// --- 16. Promotion Eligibility Alert (sent to admin) ---

export async function sendPromotionEligibilityAlertEmail(params: {
  eligible: Array<{
    memberName: string;
    styleName: string;
    currentRank: string;
    nextRank: string;
  }>;
  clientId: string;
}) {
  if (!(await isEnabled("notify_promotion_eligible"))) return;
  if (params.eligible.length === 0) return;
  const brand = await getGymBranding(params.clientId);
  const gymEmail = brand.gymEmail;
  if (!gymEmail) return;

  const rows = params.eligible
    .map(
      (e) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${e.memberName}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${e.styleName}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${e.currentRank} → ${e.nextRank}</td></tr>`
    )
    .join("");

  const eligibleList = `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr style="background:#f3f4f6;">
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Member</th>
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Style</th>
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Promotion</th>
      </tr>
      ${rows}
    </table>`;

  const resolved = await resolveTemplate("promotion_eligibility", {
    eligibleList,
    eligibleCount: String(params.eligible.length),
    gymName: brand.gymName,
  }, { clientId: params.clientId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: [gymEmail], subject, html });
}

// --- 17. Birthday Email ---

export async function sendBirthdayEmail(params: {
  memberId: string;
  memberName: string;
}) {
  if (!(await isEnabled("notify_birthday"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("birthday", {
    memberName: params.memberName,
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html, memberId: params.memberId, clientId, eventType: "BIRTHDAY" });
  }
}

// --- 18. Inactive Re-engagement Email ---

export async function sendInactiveReengagementEmail(params: {
  memberId: string;
  memberName: string;
  daysSinceLastClass: number;
}) {
  if (!(await isEnabled("notify_inactive_reengagement"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("inactive_reengagement", {
    memberName: params.memberName,
    daysSinceLastClass: String(params.daysSinceLastClass),
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html, memberId: params.memberId, clientId, eventType: "INACTIVE_REENGAGEMENT" });
  }
}

// --- 19. Renewal Reminder Email ---

export async function sendRenewalReminderEmail(params: {
  memberId: string;
  memberName: string;
  planName: string;
  expiryDate: Date;
  daysRemaining: number;
}) {
  if (!(await isEnabled("notify_renewal_reminder"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const resolved = await resolveTemplate("renewal_reminder", {
    memberName: params.memberName,
    planName: params.planName,
    expiryDate: formatDate(params.expiryDate),
    daysRemaining: String(params.daysRemaining),
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html, memberId: params.memberId, clientId, eventType: "RENEWAL_REMINDER" });
  }
}

// --- 20. Trial Expiring Email ---

export async function sendTrialExpiringEmail(params: {
  memberId: string;
  memberName: string;
  expiresAt: Date;
  classesUsed: number;
  maxClasses: number;
}) {
  if (!(await isEnabled("notify_trial_expiring"))) return;
  const clientId = await resolveClientId({ memberId: params.memberId });
  if (!clientId) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);
  const remaining = params.maxClasses - params.classesUsed;
  const resolved = await resolveTemplate("trial_expiring", {
    memberName: params.memberName,
    expiresAt: formatDate(params.expiresAt),
    classesRemaining: `${remaining} class${remaining === 1 ? "" : "es"}`,
    gymName: brand.gymName,
  }, { memberId: params.memberId });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html, memberId: params.memberId, clientId, eventType: "TRIAL_EXPIRING" });
  }
}

// ─── Receipt Email ─────────────────────────────────────────────
export async function sendReceiptEmail(params: {
  memberId: string;
  memberName: string;
  transactionNumber: string;
  totalCents: number;
  pdfBase64: string;
  fileName: string;
  clientId?: string;
}): Promise<void> {
  // Resolve the tenant before anything else so branding and the email
  // template come from the correct gym. Without this, a test-gym sale
  // ends up branded/sent-from THE PIT because getGymBranding falls back
  // to the first Settings row it finds across all tenants.
  const clientId = await resolveClientId({ clientId: params.clientId, memberId: params.memberId });
  if (!clientId) return;

  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding(clientId);

  const html = wrapInTemplate(brand, `
    <h2 style="color: #333; margin-bottom: 16px;">Your Receipt</h2>
    <p>Thank you for your purchase, ${params.memberName}!</p>
    <p>Transaction #: <strong>${params.transactionNumber}</strong></p>
    <p>Total: <strong>$${(params.totalCents / 100).toFixed(2)}</strong></p>
    <p>Your receipt is attached as a PDF.</p>
    <p style="color: #666; font-size: 12px; margin-top: 24px;">
      This is an automated message. If you have questions, please contact us directly.
    </p>
  `);

  for (const to of emails) {
    await sendEmail({
      to,
      subject: `Your Receipt from ${brand.gymName}`,
      html,
      attachments: [{ filename: params.fileName, content: params.pdfBase64 }],
      memberId: params.memberId,
      clientId,
      eventType: "RECEIPT",
    });
  }
}
