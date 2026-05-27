import { prisma } from "@/lib/prisma";
import { getDefaultTemplate } from "@/lib/email-template-defaults";

/**
 * Resolve an email template by eventKey for a specific tenant:
 * 1. Check DB for a custom template scoped to this tenant
 * 2. Fall back to the hardcoded default
 * 3. Interpolate {{variable}} placeholders with provided values
 *
 * clientId is REQUIRED — previously this ran an unscoped findFirst,
 * which meant tenant A's disabled template would silently cancel
 * tenant B's emails (and tenant B would receive tenant A's custom
 * subject/body if it existed). Symptom: "Send Portal Access" button
 * appearing to succeed but no email actually arriving for a new gym.
 */
export async function resolveTemplate(
  eventKey: string,
  variables: Record<string, string>,
  clientId: string,
): Promise<{ subject: string; bodyHtml: string } | null> {
  const dbTemplate = await prisma.emailTemplate.findFirst({
    where: { eventKey, clientId },
  });

  // If THIS tenant explicitly disabled the template, skip sending.
  if (dbTemplate && dbTemplate.enabled === false) {
    return null;
  }

  let subject: string;
  let bodyHtml: string;

  if (dbTemplate && dbTemplate.isCustom) {
    subject = dbTemplate.subject;
    bodyHtml = dbTemplate.bodyHtml;
  } else {
    const defaultTpl = getDefaultTemplate(eventKey);
    if (!defaultTpl) {
      throw new Error(`No email template found for eventKey: ${eventKey}`);
    }
    subject = defaultTpl.subject;
    bodyHtml = defaultTpl.bodyHtml;
  }

  // Interpolate all {{key}} placeholders
  subject = interpolate(subject, variables);
  bodyHtml = interpolate(bodyHtml, variables);

  return { subject, bodyHtml };
}

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] !== undefined ? variables[key] : "";
  });
}
