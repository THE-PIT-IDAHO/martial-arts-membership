/**
 * Environment-level flags shared across the codebase.
 *
 * IS_STAGING is set as an environment variable ONLY on the staging
 * Vercel deployment (Vercel > Settings > Environment Variables >
 * Preview or Production, scoped to the `staging` git branch). Prod
 * never has it, local dev doesn't have it -- so any code that gates
 * on isStaging() is a no-op everywhere except staging.
 *
 * Use isStaging() to fence off actions we don't want happening on
 * staging with real customer data: cron auto-billing, real emails to
 * real member addresses, notifications to gym owners, external webhook
 * fan-out, etc. The staging DB is a Neon branch of prod, so member
 * emails there ARE real production email addresses -- one accidental
 * "notification test" and every real customer gets the email.
 */

export function isStaging(): boolean {
  const v = process.env.IS_STAGING;
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true";
}

/**
 * Optional sandbox address. When set on staging, ALL outbound email
 * gets rerouted here instead of the intended recipient(s). Subject
 * gains a "[STAGING → original@…]" prefix so it's obvious in the
 * inbox which real address the send would have gone to.
 *
 * When unset, staging still adds a "[STAGING]" subject prefix but
 * lets the email flow to its original recipient. Keep this SET on
 * staging so a stray notification doesn't hit a real gym member.
 */
export function stagingEmailSandbox(): string | null {
  return process.env.EMAIL_SANDBOX_TO?.trim() || null;
}
