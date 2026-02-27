import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

// Per-tenant Resend client cache
const resendCache = new Map<string, { client: Resend; apiKey: string }>();

// Load a single setting by key, optionally scoped to a client
export async function getSetting(key: string, clientId?: string): Promise<string | null> {
  if (clientId) {
    const row = await prisma.settings.findUnique({
      where: { key_clientId: { key, clientId } },
    });
    return row?.value ?? null;
  }
  // Fallback: unscoped (backward compat during migration)
  const row = await prisma.settings.findFirst({ where: { key } });
  return row?.value ?? null;
}

// Load multiple settings by keys, optionally scoped to a client
export async function getSettings(keys: string[], clientId?: string): Promise<Record<string, string>> {
  const rows = await prisma.settings.findMany({
    where: {
      key: { in: keys },
      ...(clientId ? { clientId } : {}),
    },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

// Get or create the Resend client (cached per tenant)
async function getResendClient(clientId?: string): Promise<Resend | null> {
  const apiKey = await getSetting("resend_api_key", clientId);
  if (!apiKey) return null;

  const cacheKey = clientId || "__global__";
  const cached = resendCache.get(cacheKey);
  if (cached && cached.apiKey === apiKey) return cached.client;

  const client = new Resend(apiKey);
  resendCache.set(cacheKey, { client, apiKey });
  return client;
}

// Resolve which email addresses to send to for a given member,
// respecting emailOptIn and minorCommsMode routing.
export async function resolveRecipientEmails(memberId: string): Promise<string[]> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      email: true,
      emailOptIn: true,
      minorCommsMode: true,
      relationshipsTo: {
        where: {
          relationship: { in: ["PARENT", "GUARDIAN"] },
        },
        include: {
          fromMember: { select: { email: true, emailOptIn: true } },
        },
      },
    },
  });

  if (!member || !member.emailOptIn) return [];

  const emails: string[] = [];

  if (member.minorCommsMode === "parent_only") {
    // Only send to parent/guardian
    for (const rel of member.relationshipsTo) {
      if (rel.fromMember.email && rel.fromMember.emailOptIn !== false) {
        emails.push(rel.fromMember.email);
      }
    }
  } else {
    // "both" or default: send to member + parent/guardian
    if (member.email) emails.push(member.email);
    for (const rel of member.relationshipsTo) {
      if (rel.fromMember.email && rel.fromMember.emailOptIn !== false) {
        emails.push(rel.fromMember.email);
      }
    }
  }

  return [...new Set(emails)]; // deduplicate
}

// Platform sender address — all emails send FROM this verified domain.
// Client gym email is used as reply-to so member replies go to the gym.
const PLATFORM_SENDER = "notifications@dojostormsoftware.com";

// Core send function — never throws, returns true on success
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
  clientId?: string;
}): Promise<boolean> {
  try {
    const resend = await getResendClient(params.clientId);
    if (!resend) return false;

    const globalEnabled = await getSetting("notify_email_enabled", params.clientId);
    if (globalEnabled === "false") return false;

    const settings = await getSettings(["gymName", "gymEmail"], params.clientId);
    const gymName = settings.gymName || "Our Gym";
    const gymEmail = settings.gymEmail;

    // Gym email is used as reply-to; platform sender handles "from"
    const fromAddress = `${gymName} <${PLATFORM_SENDER}>`;
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    if (recipients.length === 0) return false;

    const emailPayload: Parameters<typeof resend.emails.send>[0] = {
      from: fromAddress,
      to: recipients,
      subject: params.subject,
      html: params.html,
      replyTo: gymEmail || undefined,
    };

    if (params.attachments && params.attachments.length > 0) {
      emailPayload.attachments = params.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "base64"),
      }));
    }

    await resend.emails.send(emailPayload);

    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}
