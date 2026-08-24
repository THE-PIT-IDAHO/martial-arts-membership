import type { Prisma } from "@prisma/client";

/**
 * Shared "does this member match a search query?" logic. Every
 * name-search input in the app (POS picker, kiosk lookup, global
 * header search, /api/members?search=, dashboard add-to-class, DM
 * new-conversation, etc.) should route through here so a member
 * found in one place is also findable in the others.
 *
 * Match rules (case-insensitive, tokens AND-combined):
 *   - "John"           -> firstName OR lastName OR email OR phone
 *                        OR memberNumber (if numeric) contains "John"
 *   - "John Smith"     -> both tokens must each match somewhere in
 *                        firstName / lastName / email / phone. So
 *                        "Smith John" finds the same member because
 *                        each token independently matches SOMEWHERE.
 *   - "Mary Jane Smith" -> each of the three tokens must match. Works
 *                        when firstName="Mary Jane" and lastName="Smith"
 *                        (the old implementation asserted parts[0]
 *                        matches firstName exactly and split the rest
 *                        into lastName, breaking multi-word firsts).
 *
 * Two entry points:
 *   buildMemberSearchWhere(query, clientId, extra) -> Prisma where
 *     input, for /api/members?search=. Combines with any status /
 *     style filters passed via `extra`.
 *   matchesMemberSearch(member, query) -> boolean, for client-side
 *     filters (kiosk, POS, DM picker, etc.) that already have the
 *     full member list in memory.
 */

const MIN_QUERY_LEN = 2;

/** Public "member shape" the client-side matcher needs. */
export interface SearchableMember {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  memberNumber?: number | null;
}

function tokenize(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Build a Prisma where clause for a search query. Returns the clause
 * to merge into a wider where object -- callers combine it with
 * clientId / status / other filters via AND.
 *
 * Returns `null` if the query is too short to search on.
 */
export function buildMemberSearchWhere(
  query: string,
): Prisma.MemberWhereInput | null {
  const q = (query || "").trim();
  if (q.length < MIN_QUERY_LEN) return null;

  const tokens = tokenize(q);
  // Each token must independently match SOMEWHERE. AND across tokens,
  // OR across the fields a single token can match on.
  const perTokenConditions: Prisma.MemberWhereInput[] = tokens.map((tok) => {
    const conds: Prisma.MemberWhereInput[] = [
      { firstName: { contains: tok, mode: "insensitive" } },
      { lastName:  { contains: tok, mode: "insensitive" } },
      { email:     { contains: tok, mode: "insensitive" } },
      { phone:     { contains: tok, mode: "insensitive" } },
    ];
    const asNum = parseInt(tok, 10);
    if (!Number.isNaN(asNum)) conds.push({ memberNumber: asNum });
    return { OR: conds };
  });

  return { AND: perTokenConditions };
}

/**
 * Client-side predicate mirroring buildMemberSearchWhere. Every UI
 * that has the full member list preloaded (kiosk, POS, DM picker,
 * etc.) should use this so its filter agrees with the API.
 */
export function matchesMemberSearch(
  member: SearchableMember,
  query: string,
): boolean {
  const q = (query || "").trim();
  if (q.length < MIN_QUERY_LEN) return true; // no query -> everyone visible
  const tokens = tokenize(q);
  const fields = [
    member.firstName || "",
    member.lastName || "",
    member.email || "",
    member.phone || "",
    member.memberNumber != null ? String(member.memberNumber) : "",
  ].map((f) => f.toLowerCase());
  return tokens.every((tok) => {
    const t = tok.toLowerCase();
    return fields.some((f) => f.includes(t));
  });
}

/**
 * Shared "does this member have this status?" test. Member.status is
 * a comma-separated string ("ACTIVE,COACH"), so exact equality
 * (`m.status === "ACTIVE"`) drops anyone with a compound status.
 * Communications "Send to all" and other status filters were losing
 * members this way.
 *
 * Returns true when `status` appears as one of the comma-separated
 * tokens (case-insensitive). Handles the "ACTIVE" special-case: does
 * NOT match "INACTIVE" (they share the substring).
 */
export function memberHasStatus(
  memberStatus: string | null | undefined,
  status: string,
): boolean {
  if (!memberStatus) return false;
  const tokens = memberStatus
    .toUpperCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return tokens.includes(status.toUpperCase());
}
