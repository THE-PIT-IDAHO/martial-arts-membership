import { NextResponse } from "next/server";
import { Resend } from "resend";

/**
 * POST /api/marketing/contact
 *
 * Public contact form submission from the marketing landing page.
 * Emails the platform inbox via Resend (same key already used for
 * tenant emails). Bypasses the tenant-scoped sendEmail() wrapper on
 * purpose -- this isn't tenant traffic and doesn't need the per-gym
 * master-toggle / branding lookups.
 *
 * Rate-limit story: none here. If bots become a problem, the next
 * step is a hCaptcha or Cloudflare Turnstile widget in the form.
 * For a low-volume marketing form we're okay without it for now.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const gymName = String(body.gymName || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    // Basic email shape check -- keeps the honeypot fills / obvious
    // typos out of the ops inbox. Full RFC validation isn't needed
    // for a contact form.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[marketing/contact] RESEND_API_KEY not set");
      return NextResponse.json(
        { error: "Server email is not configured. Email hello@dojostormsoftware.com directly." },
        { status: 500 },
      );
    }
    const resend = new Resend(apiKey);

    // Delivery envelope: goes to the operator's platform inbox.
    // MARKETING_CONTACT_TO env override so the destination can be
    // moved without a code change (e.g. team alias, ticketing).
    const to = process.env.MARKETING_CONTACT_TO || "cruzjuliangomez@gmail.com";
    const from = process.env.MARKETING_CONTACT_FROM || "Dojo Storm <noreply@dojostormsoftware.com>";

    const subject = `[Dojo Storm] Demo request — ${name}${gymName ? ` (${gymName})` : ""}`;
    const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111; max-width: 560px;">
  <h2 style="margin: 0 0 12px; font-size: 18px;">New demo request</h2>
  <p style="margin: 4px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
  <p style="margin: 4px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
  ${gymName ? `<p style="margin: 4px 0;"><strong>Gym:</strong> ${escapeHtml(gymName)}</p>` : ""}
  ${message ? `<div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(message)}</div>` : `<p style="margin-top: 12px; color: #666; font-style: italic;">No message included.</p>`}
</div>`.trim();

    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      // Reply-To goes to the visitor so the operator can just hit
      // reply in Gmail without copying the address out of the body.
      replyTo: email,
    });
    if (result.error) {
      console.error("[marketing/contact] Resend error:", result.error);
      return NextResponse.json({ error: "Delivery failed. Please email us directly." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/contact] fatal:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
