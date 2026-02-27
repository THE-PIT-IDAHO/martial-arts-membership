// Default email templates — extracted from lib/notifications.ts
// HTML uses {{variable}} placeholders that get interpolated at send time.

export interface DefaultEmailTemplate {
  eventKey: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
}

export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  // --- Member Lifecycle ---
  {
    eventKey: "welcome",
    name: "Welcome Email",
    subject: "Welcome to {{gymName}}!",
    bodyHtml: `<h2 style="color:#c41111;">Welcome to {{gymName}}!</h2>
    <p>Hi {{memberName}},</p>
    <p>We're excited to have you join our martial arts family. Your membership account has been created.</p>
    <p>If you have any questions, feel free to reach out to us at {{gymEmail}}.</p>
    <p>See you on the mat!</p>`,
    variables: ["memberName", "gymName", "gymEmail"],
  },
  {
    eventKey: "birthday",
    name: "Birthday Email",
    subject: "Happy Birthday, {{memberName}}!",
    bodyHtml: `<h2 style="margin:0 0 16px;font-size:20px;">Happy Birthday, {{memberName}}!</h2>
    <p>Everyone at {{gymName}} wishes you a wonderful birthday!</p>
    <p>Thank you for being part of our martial arts family. We hope this year brings you great progress on your journey.</p>
    <p>See you on the mats!</p>`,
    variables: ["memberName", "gymName"],
  },
  {
    eventKey: "inactive_reengagement",
    name: "Inactive Re-engagement",
    subject: "We miss you at {{gymName}}!",
    bodyHtml: `<h2 style="margin:0 0 16px;font-size:20px;">We Miss You, {{memberName}}!</h2>
    <p>It has been {{daysSinceLastClass}} days since your last class at {{gymName}}.</p>
    <p>Your training partners and coaches are looking forward to seeing you back! Consistency is the key to progress in martial arts.</p>
    <p>Come join us for your next class.</p>`,
    variables: ["memberName", "daysSinceLastClass", "gymName"],
  },
  {
    eventKey: "promotion_congrats",
    name: "Promotion Congratulations",
    subject: "Congratulations! Promoted to {{newRank}}",
    bodyHtml: `<h2 style="color:#c41111;">Congratulations on Your Promotion!</h2>
    <p>Hi {{memberName}},</p>
    <p>We are proud to announce that you have been promoted to <strong>{{newRank}}</strong> in <strong>{{styleName}}</strong>!</p>
    <p>This is a tremendous achievement that reflects your dedication and hard work. Keep training and reaching for your next goal!</p>`,
    variables: ["memberName", "newRank", "styleName", "gymName"],
  },

  // --- Billing ---
  {
    eventKey: "invoice_created",
    name: "Invoice Created",
    subject: "Invoice {{invoiceNumber}} — {{amount}} Due",
    bodyHtml: `<h2 style="color:#c41111;">New Invoice</h2>
    <p>Hi {{memberName}},</p>
    <p>A new invoice has been generated for your membership:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Invoice</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">{{invoiceNumber}}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Plan</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">{{planName}}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Amount</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">{{amount}}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;">Due Date</td><td style="padding:8px;">{{dueDate}}</td></tr>
    </table>
    <p>Please ensure payment is made by the due date.</p>`,
    variables: ["memberName", "invoiceNumber", "planName", "amount", "dueDate", "gymName"],
  },
  {
    eventKey: "payment_received",
    name: "Payment Received",
    subject: "Payment Received — {{amount}}",
    bodyHtml: `<h2 style="color:#c41111;">Payment Confirmed</h2>
    <p>Hi {{memberName}},</p>
    <p>We've received your payment of <strong>{{amount}}</strong>{{planName}}.</p>
    {{invoiceNumber}}
    <p>Thank you for keeping your account current!</p>`,
    variables: ["memberName", "amount", "planName", "invoiceNumber", "gymName"],
  },
  {
    eventKey: "past_due",
    name: "Past Due Alert",
    subject: "Payment Past Due — {{amount}}",
    bodyHtml: `<h2 style="color:#dc2626;">Payment Past Due</h2>
    <p>Hi {{memberName}},</p>
    <p>Your payment of <strong>{{amount}}</strong> was due on {{dueDate}} and is now past due.</p>
    {{invoiceNumber}}
    <p>Please make your payment as soon as possible to avoid any interruption to your membership.</p>
    <p>If you have already paid or have questions, please contact us at {{gymEmail}}.</p>`,
    variables: ["memberName", "amount", "dueDate", "invoiceNumber", "gymName", "gymEmail"],
  },
  {
    eventKey: "dunning_friendly",
    name: "Dunning — Friendly Reminder",
    subject: "Payment Reminder — {{amount}}",
    bodyHtml: `<h2 style="color:#f59e0b;">Payment Reminder</h2>
    <p>Hi {{memberName}},</p>
    <p>This is a friendly reminder that your payment of <strong>{{amount}}</strong> is past due.</p>
    {{invoiceNumber}}
    <p>Please make your payment at your earliest convenience to keep your membership active.</p>`,
    variables: ["memberName", "amount", "invoiceNumber", "gymName"],
  },
  {
    eventKey: "dunning_urgent",
    name: "Dunning — Urgent Notice",
    subject: "Urgent: Payment Overdue — {{amount}}",
    bodyHtml: `<h2 style="color:#ea580c;">Payment Overdue</h2>
    <p>Hi {{memberName}},</p>
    <p>Your payment of <strong>{{amount}}</strong> is now significantly overdue.</p>
    {{invoiceNumber}}
    <p>Please make your payment immediately to avoid any disruption to your membership.</p>`,
    variables: ["memberName", "amount", "invoiceNumber", "gymName"],
  },
  {
    eventKey: "dunning_final",
    name: "Dunning — Final Notice",
    subject: "Final Notice: Payment Required — {{amount}}",
    bodyHtml: `<h2 style="color:#dc2626;">Final Payment Notice</h2>
    <p>Hi {{memberName}},</p>
    <p><strong>This is your final notice.</strong> Your payment of <strong>{{amount}}</strong> remains unpaid.</p>
    {{invoiceNumber}}
    <p>If payment is not received promptly, your membership will be suspended. Please contact us immediately if you need to discuss payment arrangements.</p>`,
    variables: ["memberName", "amount", "invoiceNumber", "gymName", "gymEmail"],
  },
  {
    eventKey: "dunning_suspension",
    name: "Dunning — Account Suspended",
    subject: "Account Suspended — Payment Required",
    bodyHtml: `<h2 style="color:#dc2626;">Account Suspended</h2>
    <p>Hi {{memberName}},</p>
    <p>Due to non-payment of <strong>{{amount}}</strong>, your membership has been suspended.</p>
    {{invoiceNumber}}
    <p>To reactivate your membership, please make your payment and contact us at {{gymEmail}}.</p>`,
    variables: ["memberName", "amount", "invoiceNumber", "gymName", "gymEmail"],
  },

  // --- Membership ---
  {
    eventKey: "membership_expiry",
    name: "Membership Expiry Warning",
    subject: "Your Membership Expires {{expiryDate}}",
    bodyHtml: `<h2 style="color:#f59e0b;">Membership Expiring Soon</h2>
    <p>Hi {{memberName}},</p>
    <p>Your <strong>{{planName}}</strong> membership is set to expire on <strong>{{expiryDate}}</strong>.</p>
    <p>To continue training without interruption, please contact us to renew your membership.</p>
    <p>We'd love to keep you as part of our martial arts family!</p>`,
    variables: ["memberName", "planName", "expiryDate", "gymName"],
  },
  {
    eventKey: "renewal_reminder",
    name: "Renewal Reminder",
    subject: "Your membership expires in {{daysRemaining}} days",
    bodyHtml: `<h2 style="margin:0 0 16px;font-size:20px;">Membership Renewal Reminder</h2>
    <p>Hi {{memberName}},</p>
    <p>Your <strong>{{planName}}</strong> membership expires in <strong>{{daysRemaining}} days</strong> ({{expiryDate}}).</p>
    <p>To continue training without interruption, please renew your membership before it expires.</p>
    <p>Contact us if you have any questions about renewal options.</p>`,
    variables: ["memberName", "planName", "expiryDate", "daysRemaining", "gymName"],
  },
  {
    eventKey: "cancellation_confirmation",
    name: "Cancellation Confirmation",
    subject: "Cancellation Confirmed — {{planName}}",
    bodyHtml: `<h2 style="color:#dc2626;">Membership Cancellation Confirmed</h2>
    <p>Hi {{memberName}},</p>
    <p>Your <strong>{{planName}}</strong> membership has been scheduled for cancellation.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Effective Date</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">{{effectiveDate}}</td></tr>
      {{earlyTerminationFee}}
    </table>
    <p>Your membership will remain active until the effective date above.</p>
    <p>If you have any questions or would like to reconsider, please contact us at {{gymEmail}}.</p>`,
    variables: ["memberName", "planName", "effectiveDate", "earlyTerminationFee", "gymName", "gymEmail"],
  },
  {
    eventKey: "trial_expiring",
    name: "Trial Expiring",
    subject: "Your trial at {{gymName}} is ending soon",
    bodyHtml: `<h2 style="margin:0 0 16px;font-size:20px;">Your Trial is Ending Soon!</h2>
    <p>Hi {{memberName}},</p>
    <p>Your trial pass at {{gymName}} expires on <strong>{{expiresAt}}</strong>.</p>
    <p>You have <strong>{{classesRemaining}}</strong> remaining.</p>
    <p>Ready to continue your martial arts journey? Ask about our membership plans to keep training!</p>`,
    variables: ["memberName", "expiresAt", "classesRemaining", "gymName"],
  },

  // --- Classes ---
  {
    eventKey: "class_reminder",
    name: "Class Reminder",
    subject: "Class Reminder: {{className}}",
    bodyHtml: `<h2 style="color:#c41111;">Class Reminder</h2>
    <p>Hi {{memberName}},</p>
    <p>This is a reminder that you have an upcoming class:</p>
    <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
      <p style="margin:0;font-weight:600;font-size:18px;">{{className}}</p>
      <p style="margin:4px 0 0;color:#6b7280;">{{classDate}} at {{classTime}}</p>
    </div>
    <p>See you there!</p>`,
    variables: ["memberName", "className", "classDate", "classTime", "gymName"],
  },
  {
    eventKey: "booking_confirmed",
    name: "Booking Confirmed",
    subject: "Booking Confirmed: {{className}}",
    bodyHtml: `<h2 style="color:#c41111;">Booking Confirmed</h2>
    <p>Hi {{memberName}},</p>
    <p>Your spot has been reserved for the following class:</p>
    <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
      <p style="margin:0;font-weight:600;font-size:18px;">{{className}}</p>
      <p style="margin:4px 0 0;color:#6b7280;">{{classDate}} at {{classTime}}</p>
    </div>
    <p>See you there!</p>`,
    variables: ["memberName", "className", "classDate", "classTime", "gymName"],
  },
  {
    eventKey: "booking_waitlisted",
    name: "Booking Waitlisted",
    subject: "Waitlisted: {{className}}",
    bodyHtml: `<h2 style="color:#c41111;">Added to Waitlist</h2>
    <p>Hi {{memberName}},</p>
    <p>You've been added to the waitlist for the following class:</p>
    <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
      <p style="margin:0;font-weight:600;font-size:18px;">{{className}}</p>
      <p style="margin:4px 0 0;color:#6b7280;">{{classDate}} at {{classTime}}</p>
      <p style="margin:4px 0 0;color:#f59e0b;font-weight:600;">Waitlist position: #{{waitlistPosition}}</p>
    </div>
    <p>We'll notify you if a spot opens up.</p>`,
    variables: ["memberName", "className", "classDate", "classTime", "waitlistPosition", "gymName"],
  },
  {
    eventKey: "waitlist_promotion",
    name: "Waitlist Promotion",
    subject: "Spot Confirmed: {{className}}",
    bodyHtml: `<h2 style="color:#16a34a;">You're In!</h2>
    <p>Hi {{memberName}},</p>
    <p>Great news — a spot opened up and your booking has been confirmed:</p>
    <div style="background:#f0fdf4;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #bbf7d0;">
      <p style="margin:0;font-weight:600;font-size:18px;">{{className}}</p>
      <p style="margin:4px 0 0;color:#6b7280;">{{classDate}} at {{classTime}}</p>
    </div>
    <p>See you on the mat!</p>`,
    variables: ["memberName", "className", "classDate", "classTime", "gymName"],
  },

  // --- Enrollment ---
  {
    eventKey: "enrollment_confirmation",
    name: "Enrollment Confirmation",
    subject: "Application Received — {{gymName}}",
    bodyHtml: `<h2 style="color:#c41111;">Application Received!</h2>
    <p>Hi {{firstName}},</p>
    <p>Thank you for your interest in joining {{gymName}}!</p>
    {{planName}}
    <p>We've received your enrollment application and will review it shortly. You'll receive another email once your membership is approved.</p>
    <p>If you have any questions, feel free to contact us at {{gymEmail}}.</p>`,
    variables: ["firstName", "planName", "gymName", "gymEmail"],
  },

  // --- Waiver ---
  {
    eventKey: "waiver_welcome",
    name: "Waiver Welcome / Portal Access",
    subject: "Welcome to {{gymName}} — Your Portal Access",
    bodyHtml: `<h2 style="color:#c41111;">Welcome to {{gymName}}!</h2>
    <p>Hi {{memberName}},</p>
    <p>Thank you for completing your liability waiver. You're all set to start training!</p>
    <div style="background:#fef2f2;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #fecaca;">
      <p style="margin:0 0 8px;font-weight:600;font-size:16px;">Access Your Member Portal</p>
      <p style="margin:0 0 12px;color:#6b7280;">View your classes, track your progress, manage your account, and more.</p>
      <a href="{{portalUrl}}" style="display:inline-block;background:#c41111;color:#ffffff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Go to Member Portal</a>
    </div>
    <p style="font-size:14px;"><strong>How to sign in:</strong></p>
    <ol style="font-size:14px;color:#374151;">
      <li>Click the button above or go to <a href="{{portalUrl}}">{{portalUrl}}</a></li>
      <li>Enter your email address: <strong>{{memberEmail}}</strong></li>
      <li>Click "Send Magic Link"</li>
      <li>Check your inbox for a login link and click it — no password needed!</li>
    </ol>
    <p>If you have any questions, feel free to contact us at {{gymEmail}}.</p>
    <p>See you on the mat!</p>`,
    variables: ["memberName", "memberEmail", "portalUrl", "gymName", "gymEmail"],
  },

  {
    eventKey: "waiver_confirmed",
    name: "Waiver Confirmed / Portal Access",
    subject: "Your Waiver Has Been Confirmed — {{gymName}}",
    bodyHtml: `<h2 style="color:#c41111;">Your Waiver is Confirmed!</h2>
    <p>Hi {{memberName}},</p>
    <p>Great news! Your liability waiver at <strong>{{gymName}}</strong> has been reviewed and confirmed. You're all set to start training!</p>
    <div style="background:#fef2f2;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #fecaca;">
      <p style="margin:0 0 8px;font-weight:600;font-size:16px;">Access Your Member Portal</p>
      <p style="margin:0 0 12px;color:#6b7280;">View your classes, track your progress, manage your account, and more.</p>
      <a href="{{magicLoginUrl}}" style="display:inline-block;background:#c41111;color:#ffffff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Log In Now</a>
    </div>
    <p style="font-size:14px;">This login link expires in 15 minutes. After that, you can always sign in at:</p>
    <ol style="font-size:14px;color:#374151;">
      <li>Go to <a href="{{portalUrl}}">{{portalUrl}}</a></li>
      <li>Enter your email: <strong>{{memberEmail}}</strong></li>
      <li>Click "Send Magic Link" to receive a new login link</li>
    </ol>
    <p>If you have any questions, contact us at {{gymEmail}}.</p>
    <p>See you on the mat!</p>`,
    variables: ["memberName", "memberEmail", "portalUrl", "magicLoginUrl", "gymName", "gymEmail"],
  },

  // --- Auth ---
  {
    eventKey: "magic_link",
    name: "Magic Link Login",
    subject: "Sign in to {{gymName}}",
    bodyHtml: `<h2 style="color:#c41111;">Your Login Link</h2>
    <p>Hi {{memberName}},</p>
    <p>Click the button below to sign in to your member portal:</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="{{loginUrl}}" style="display:inline-block;background:#c41111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Sign In</a>
    </div>
    <p style="color:#6b7280;font-size:14px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
    <p style="color:#6b7280;font-size:12px;word-break:break-all;">Or copy this URL: {{loginUrl}}</p>`,
    variables: ["memberName", "loginUrl", "gymName"],
  },

  // --- Other ---
  {
    eventKey: "custom_message",
    name: "Custom Message",
    subject: "{{subject}}",
    bodyHtml: `<h2 style="color:#c41111;">{{subject}}</h2>
    <p>Hi {{memberName}},</p>
    <div style="white-space:pre-wrap;">{{message}}</div>`,
    variables: ["memberName", "subject", "message", "gymName"],
  },

  // --- Admin Alerts ---
  {
    eventKey: "low_stock_alert",
    name: "Low Stock Alert",
    subject: "Low Stock: {{itemName}} ({{currentQuantity}} remaining)",
    bodyHtml: `<h2 style="color:#f59e0b;">Low Stock Alert</h2>
    <p>The following inventory item is running low:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Item</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;">{{itemName}}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;">Current Stock</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#dc2626;">{{currentQuantity}}</td></tr>
      <tr><td style="padding:8px;color:#6b7280;">Reorder Threshold</td><td style="padding:8px;">{{threshold}}</td></tr>
    </table>
    <p>Please reorder this item to avoid running out of stock.</p>`,
    variables: ["itemName", "currentQuantity", "threshold", "gymName"],
  },
  {
    eventKey: "promotion_eligibility",
    name: "Promotion Eligibility Alert",
    subject: "{{eligibleCount}} member(s) eligible for promotion",
    bodyHtml: `<h2 style="color:#16a34a;">Promotion Eligibility Alert</h2>
    <p>The following members have met all class requirements and are eligible for promotion:</p>
    {{eligibleList}}
    <p>Visit the Promotions page to schedule their grading.</p>`,
    variables: ["eligibleList", "eligibleCount", "gymName"],
  },
];

export function getDefaultTemplate(eventKey: string): DefaultEmailTemplate | undefined {
  return DEFAULT_EMAIL_TEMPLATES.find((t) => t.eventKey === eventKey);
}

// Template category groupings for the UI
export const TEMPLATE_CATEGORIES: { label: string; keys: string[] }[] = [
  {
    label: "Member Lifecycle",
    keys: ["welcome", "birthday", "inactive_reengagement", "promotion_congrats"],
  },
  {
    label: "Billing",
    keys: ["invoice_created", "payment_received", "past_due", "dunning_friendly", "dunning_urgent", "dunning_final", "dunning_suspension"],
  },
  {
    label: "Membership",
    keys: ["membership_expiry", "renewal_reminder", "cancellation_confirmation", "trial_expiring"],
  },
  {
    label: "Classes",
    keys: ["class_reminder", "booking_confirmed", "booking_waitlisted", "waitlist_promotion"],
  },
  {
    label: "Enrollment",
    keys: ["enrollment_confirmation", "waiver_welcome", "waiver_confirmed"],
  },
  {
    label: "Auth",
    keys: ["magic_link"],
  },
  {
    label: "Other",
    keys: ["custom_message"],
  },
  {
    label: "Admin Alerts",
    keys: ["low_stock_alert", "promotion_eligibility"],
  },
];
