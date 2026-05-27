import { prisma } from "@/lib/prisma";

/**
 * Normalize an email for storage / comparison: trim whitespace, lowercase.
 * Returns null for empty input so the DB still stores NULL rather than "".
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

// Family relationship types that are allowed to share an email with the
// existing holder. Anything else is treated as a strict duplicate.
const FAMILY_TYPES = new Set([
  "PARENT", "CHILD", "GUARDIAN", "DEPENDENT",
  "HUSBAND", "WIFE", "PARTNER",
  // Legacy labels still in the DB
  "SPOUSE", "SIGNIFICANT_OTHER", "SIBLING",
]);

export type EmailCheckResult =
  | { ok: true }
  | { ok: false; reason: string; existingMemberId: string; existingName: string };

/**
 * Enforce "one email, one member" with a household-aware exception.
 *
 * Returns ok when the email is unused inside this tenant, OR when the
 * existing holder is family-linked to the member being created/updated.
 * That covers the common gym case of a parent's email being attached to
 * multiple kid profiles — the kid can adopt the parent's email at signup,
 * then later swap it for their own email (which goes through this check
 * again and will be rejected if it collides with a non-relative).
 *
 * - email: the candidate email (will be normalized internally)
 * - clientId: tenant scope
 * - excludeMemberId: when updating, the member being updated (so we don't
 *   flag them as conflicting with themselves)
 * - allowedRelatedMemberIds: caller-supplied list of members it's OK to
 *   share with (used by the add-child flow, where the family link is
 *   being created in the same request as the member)
 */
export async function checkEmailAvailable(opts: {
  email: string | null | undefined;
  clientId: string;
  excludeMemberId?: string;
  allowedRelatedMemberIds?: string[];
}): Promise<EmailCheckResult> {
  const normalized = normalizeEmail(opts.email);
  if (!normalized) return { ok: true };

  // Postgres collation on the column is case-sensitive by default, but we
  // store the lowercased form everywhere through this helper. The mode:
  // "insensitive" is belt-and-suspenders for any legacy rows that slipped
  // through with mixed case.
  const existing = await prisma.member.findFirst({
    where: {
      clientId: opts.clientId,
      email: { equals: normalized, mode: "insensitive" },
      ...(opts.excludeMemberId ? { id: { not: opts.excludeMemberId } } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!existing) return { ok: true };

  // Caller-asserted relationship (add-child: parent is on the allowlist
  // even though no DB row links them yet).
  if (opts.allowedRelatedMemberIds?.includes(existing.id)) return { ok: true };

  // Existing family link between the conflicting member and the member
  // being updated (PATCH path).
  if (opts.excludeMemberId) {
    const rel = await prisma.memberRelationship.findFirst({
      where: {
        relationship: { in: Array.from(FAMILY_TYPES) },
        OR: [
          { fromMemberId: opts.excludeMemberId, toMemberId: existing.id },
          { fromMemberId: existing.id, toMemberId: opts.excludeMemberId },
        ],
      },
      select: { id: true },
    });
    if (rel) return { ok: true };
  }

  const name = `${existing.firstName} ${existing.lastName}`.trim() || "another member";
  return {
    ok: false,
    reason: `Email already used by ${name}. Add them as a family relationship first if this is a household member.`,
    existingMemberId: existing.id,
    existingName: name,
  };
}
