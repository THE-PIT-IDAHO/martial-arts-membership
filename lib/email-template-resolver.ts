import { prisma } from "@/lib/prisma";
import { getDefaultTemplate } from "@/lib/email-template-defaults";

/**
 * Resolve an email template by eventKey:
 * 1. Check DB for a custom template (isCustom: true)
 * 2. Fall back to the hardcoded default
 * 3. Interpolate {{variable}} placeholders with provided values
 */
export async function resolveTemplate(
  eventKey: string,
  variables: Record<string, string>
): Promise<{ subject: string; bodyHtml: string } | null> {
  // Try DB first
  const dbTemplate = await prisma.emailTemplate.findUnique({
    where: { eventKey },
  });

  // If template is disabled, skip sending
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
