import { sendEmail, resolveRecipientEmails, getSettings } from "@/lib/email";
import { resolveTemplate as _resolveTemplate } from "@/lib/email-template-resolver";

// Wrapper: returns { subject, bodyHtml } or null if the template is disabled
async function resolveTemplate(
  eventKey: string,
  variables: Record<string, string>
): Promise<{ subject: string; bodyHtml: string } | null> {
  return _resolveTemplate(eventKey, variables);
}

// --- Branding ---

async function getGymBranding() {
  const s = await getSettings(["gymName", "gymEmail", "gymPhone", "gymLogo"]);
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

// --- 1. Welcome Email ---

export async function sendWelcomeEmail(params: {
  memberId: string;
  memberName: string;
}) {
  if (!(await isEnabled("notify_welcome_email"))) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("welcome", {
    memberName: params.memberName,
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("invoice_created", {
    memberName: params.memberName,
    invoiceNumber: params.invoiceNumber,
    planName: params.planName,
    amount: formatCents(params.amountCents),
    dueDate: formatDate(params.dueDate),
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("payment_received", {
    memberName: params.memberName,
    amount: formatCents(params.amountCents),
    planName: params.planName ? ` for ${params.planName}` : "",
    invoiceNumber: params.invoiceNumber ? `<p style="color:#6b7280;">Invoice: ${params.invoiceNumber}</p>` : "",
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("past_due", {
    memberName: params.memberName,
    amount: formatCents(params.amountCents),
    dueDate: formatDate(params.dueDate),
    invoiceNumber: params.invoiceNumber ? `<p style="color:#6b7280;">Invoice: ${params.invoiceNumber}</p>` : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 5. Promotion Congrats ---

export async function sendPromotionCongratsEmail(params: {
  memberId: string;
  memberName: string;
  newRank: string;
  styleName: string;
}) {
  if (!(await isEnabled("notify_promotion"))) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("promotion_congrats", {
    memberName: params.memberName,
    newRank: params.newRank,
    styleName: params.styleName,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("class_reminder", {
    memberName: params.memberName,
    className: params.className,
    classDate: params.classDate,
    classTime: params.classTime,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 7. Membership Expiry Warning ---

export async function sendMembershipExpiryWarningEmail(params: {
  memberId: string;
  memberName: string;
  planName: string;
  expiryDate: Date;
}) {
  if (!(await isEnabled("notify_membership_expiry"))) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("membership_expiry", {
    memberName: params.memberName,
    planName: params.planName,
    expiryDate: formatDate(params.expiryDate),
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 8. Magic Link Login ---

export async function sendMagicLinkEmail(params: {
  email: string;
  memberName: string;
  loginUrl: string;
}) {
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("magic_link", {
    memberName: params.memberName,
    loginUrl: params.loginUrl,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: [params.email], subject, html });
}

// --- 8b. Password Reset Email ---

export async function sendPasswordResetEmail(params: {
  email: string;
  memberName: string;
  resetUrl: string;
}) {
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("password_reset", {
    memberName: params.memberName,
    resetUrl: params.resetUrl,
    gymName: brand.gymName,
  });
  if (resolved) {
    const html = wrapInTemplate(brand, resolved.bodyHtml);
    await sendEmail({ to: [params.email], subject: resolved.subject, html });
    return;
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
  await sendEmail({ to: [params.email], subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
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
  const resolved = await resolveTemplate(eventKey, vars);
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 10. Waitlist Promotion ---

export async function sendWaitlistPromotionEmail(params: {
  memberId: string;
  memberName: string;
  className: string;
  classDate: string;
  classTime: string;
}) {
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("waitlist_promotion", {
    memberName: params.memberName,
    className: params.className,
    classDate: params.classDate,
    classTime: params.classTime,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 11. Enrollment Confirmation (to applicant) ---

export async function sendEnrollmentConfirmationEmail(params: {
  email: string;
  firstName: string;
  planName?: string;
}) {
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("enrollment_confirmation", {
    firstName: params.firstName,
    planName: params.planName ? `<p>Plan selected: <strong>${params.planName}</strong></p>` : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: [params.email], subject, html });
}

// --- 12. Custom Message (for calendar "message attendees") ---

export async function sendCustomMessageEmail(params: {
  memberId: string;
  memberName: string;
  subject: string;
  message: string;
}) {
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("custom_message", {
    memberName: params.memberName,
    subject: params.subject,
    message: params.message,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("cancellation_confirmation", {
    memberName: params.memberName,
    planName: params.planName,
    effectiveDate: formatDate(params.effectiveDate),
    earlyTerminationFee: params.earlyTerminationFeeCents
      ? `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Early Termination Fee</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${formatCents(params.earlyTerminationFeeCents)}</td></tr>`
      : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 14. Low Stock Alert (sent to admin) ---

export async function sendLowStockAlertEmail(params: {
  itemName: string;
  currentQuantity: number;
  threshold: number;
}) {
  if (!(await isEnabled("notify_low_stock"))) return;
  const brand = await getGymBranding();
  const gymEmail = brand.gymEmail;
  if (!gymEmail) return;
  const resolved = await resolveTemplate("low_stock_alert", {
    itemName: params.itemName,
    currentQuantity: String(params.currentQuantity),
    threshold: String(params.threshold),
    gymName: brand.gymName,
  });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate(`dunning_${params.level}`, {
    memberName: params.memberName,
    amount: formatCents(params.amountCents),
    invoiceNumber: params.invoiceNumber ? `<p style="color:#6b7280;">Invoice: ${params.invoiceNumber}</p>` : "",
    gymName: brand.gymName,
    gymEmail: brand.gymEmail,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  await sendEmail({ to: emails, subject, html });
}

// --- 16. Promotion Eligibility Alert (sent to admin) ---

export async function sendPromotionEligibilityAlertEmail(params: {
  eligible: Array<{
    memberName: string;
    styleName: string;
    currentRank: string;
    nextRank: string;
  }>;
}) {
  if (!(await isEnabled("notify_promotion_eligible"))) return;
  if (params.eligible.length === 0) return;
  const brand = await getGymBranding();
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
  });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("birthday", {
    memberName: params.memberName,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html });
  }
}

// --- 18. Inactive Re-engagement Email ---

export async function sendInactiveReengagementEmail(params: {
  memberId: string;
  memberName: string;
  daysSinceLastClass: number;
}) {
  if (!(await isEnabled("notify_inactive_reengagement"))) return;
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("inactive_reengagement", {
    memberName: params.memberName,
    daysSinceLastClass: String(params.daysSinceLastClass),
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const resolved = await resolveTemplate("renewal_reminder", {
    memberName: params.memberName,
    planName: params.planName,
    expiryDate: formatDate(params.expiryDate),
    daysRemaining: String(params.daysRemaining),
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html });
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
  const emails = await resolveRecipientEmails(params.memberId);
  if (emails.length === 0) return;
  const brand = await getGymBranding();
  const remaining = params.maxClasses - params.classesUsed;
  const resolved = await resolveTemplate("trial_expiring", {
    memberName: params.memberName,
    expiresAt: formatDate(params.expiresAt),
    classesRemaining: `${remaining} class${remaining === 1 ? "" : "es"}`,
    gymName: brand.gymName,
  });
  if (!resolved) return;
  const { subject, bodyHtml } = resolved;
  const html = wrapInTemplate(brand, bodyHtml);
  for (const to of emails) {
    await sendEmail({ to, subject, html });
  }
}
