import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

// Single platform-wide Resend client (API key from environment variable)
let resendClient: Resend | null = null;

// --- Settings cache ---------------------------------------------------------
// In-memory per-process cache keyed by `${clientId}:${key}`. Settings are read
// on most API requests (gym name, email opt-ins, payment processor config),
// so the per-request DB round-trip stacks up. 5-minute TTL matches the slug
// cache in lib/tenant.ts. Writers should call invalidateSettingCache after
// upserting so changes show up immediately for the writer's session.

const settingCache = new Map<string, { value: string | null; expiresAt: number }>();
const SETTING_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(key: string, clientId?: string): string {
  return `${clientId || "_global"}:${key}`;
}

/** Clear cache entries. Omit args to clear everything. */
export function invalidateSettingCache(key?: string, clientId?: string): void {
  if (!key) {
    settingCache.clear();
    return;
  }
  settingCache.delete(cacheKey(key, clientId));
}

// Load a single setting by key, optionally scoped to a client. Cached 5 min.
export async function getSetting(key: string, clientId?: string): Promise<string | null> {
  const ck = cacheKey(key, clientId);
  const hit = settingCache.get(ck);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: string | null = null;
  if (clientId) {
    const row = await prisma.settings.findUnique({
      where: { key_clientId: { key, clientId } },
    });
    value = row?.value ?? null;
  } else {
    // Fallback: unscoped (backward compat during migration)
    const row = await prisma.settings.findFirst({ where: { key } });
    value = row?.value ?? null;
  }
  settingCache.set(ck, { value, expiresAt: Date.now() + SETTING_CACHE_TTL_MS });
  return value;
}

// Load multiple settings by keys, optionally scoped to a client. Cached 5 min
// per key. Misses are batched into one DB query for the keys not in cache.
export async function getSettings(keys: string[], clientId?: string): Promise<Record<string, string>> {
  const now = Date.now();
  const map: Record<string, string> = {};
  const missing: string[] = [];

  for (const k of keys) {
    const ck = cacheKey(k, clientId);
    const hit = settingCache.get(ck);
    if (hit && hit.expiresAt > now) {
      if (hit.value !== null) map[k] = hit.value;
    } else {
      missing.push(k);
    }
  }

  if (missing.length > 0) {
    const rows = await prisma.settings.findMany({
      where: {
        key: { in: missing },
        ...(clientId ? { clientId } : {}),
      },
    });
    const found = new Set<string>();
    for (const r of rows) {
      map[r.key] = r.value;
      settingCache.set(cacheKey(r.key, clientId), {
        value: r.value,
        expiresAt: now + SETTING_CACHE_TTL_MS,
      });
      found.add(r.key);
    }
    // Cache misses (key has no row) as null so we don't re-query them
    for (const k of missing) {
      if (!found.has(k)) {
        settingCache.set(cacheKey(k, clientId), {
          value: null,
          expiresAt: now + SETTING_CACHE_TTL_MS,
        });
      }
    }
  }

  return map;
}

// Get or create the Resend client (single platform-wide key from env)
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY environment variable not set");
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
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

// Core send function — never throws, returns true on success.
// If memberId + eventType are passed, the attempt is recorded in EmailLog
// so admins can see what was sent to a member on the profile activity feed.
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
  clientId?: string;
  memberId?: string;
  eventType?: string;
}): Promise<boolean> {
  let success = false;
  let errorText: string | undefined;

  try {
    const resend = getResendClient();
    if (!resend) {
      errorText = "Resend client not configured (RESEND_API_KEY missing)";
      console.warn(`[Email] skipped: ${errorText} (event=${params.eventType || "?"})`);
      return false;
    }

    const globalEnabled = await getSetting("notify_email_enabled", params.clientId);
    if (globalEnabled === "false") {
      errorText = "Email notifications globally disabled (Account → Preferences master toggle)";
      console.warn(`[Email] skipped: ${errorText} (event=${params.eventType || "?"}, clientId=${params.clientId || "?"})`);
      return false;
    }

    const settings = await getSettings(["gymName", "gymEmail"], params.clientId);
    const gymName = settings.gymName || "Our Gym";
    const gymEmail = settings.gymEmail;

    // Gym email is used as reply-to; platform sender handles "from"
    const fromAddress = `${gymName} <${PLATFORM_SENDER}>`;
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    if (recipients.length === 0) {
      errorText = "No recipients";
      console.warn(`[Email] skipped: ${errorText} (event=${params.eventType || "?"})`);
      return false;
    }

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

    // Resend SDK returns { data, error } and does NOT throw on API
    // errors — only on network/code issues. Without inspecting the
    // return value, suppression-list and validation rejections looked
    // like silent successes (which is how Josh's reset failures got
    // logged as "Email provider rejected" with no Vercel log line).
    const response = await resend.emails.send(emailPayload);
    if (response && typeof response === "object" && "error" in response && response.error) {
      const errObj = response.error as { message?: string; name?: string };
      errorText = errObj.message || errObj.name || JSON.stringify(response.error);
      console.error(`[Email] Resend rejected (event=${params.eventType || "?"}): ${errorText}`);
      return false;
    }
    success = true;
    return true;
  } catch (error) {
    errorText = error instanceof Error ? error.message : "Unknown send error";
    console.error("[Email] Failed to send:", error);
    return false;
  } finally {
    // Best-effort logging — never block or surface failures from email send.
    // Caller must pass eventType to opt in. clientId is looked up from the
    // member if not provided directly.
    if (params.eventType) {
      const recipients = Array.isArray(params.to) ? params.to : [params.to];
      const writeLog = async () => {
        let clientId = params.clientId;
        if (!clientId && params.memberId) {
          const m = await prisma.member.findUnique({
            where: { id: params.memberId },
            select: { clientId: true },
          });
          clientId = m?.clientId || undefined;
        }
        if (!clientId) return; // no tenant scope, skip log rather than orphan
        await prisma.emailLog.create({
          data: {
            clientId,
            memberId: params.memberId || null,
            eventType: params.eventType!,
            subject: params.subject,
            recipients: JSON.stringify(recipients),
            success,
            errorText: errorText || null,
          },
        });
      };
      writeLog().catch((err) => {
        console.error("[Email] Failed to log:", err);
      });
    }
  }
}
