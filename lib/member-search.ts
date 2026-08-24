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
 * Relevance score for a member against a search query. Bigger = better.
 * Use to sort a matched set so prefix hits float above mid-word hits.
 *
 * Example: searching "nic" ranks Nick (firstName starts-with) above
 * Dominick (firstName contains "nic" mid-word) which ranks above a
 * member whose email happens to contain "nic".
 *
 * Score is a per-token sum -- so "nick smith" ranks a member whose
 * firstName is Nick AND lastName is Smith above one who only matches
 * "nick" on lastName.
 *
 * Field weights (per token):
 *   firstName / lastName exact         100
 *   firstName / lastName starts-with    50
 *   firstName / lastName contains       10
 *   memberNumber exact                  40
 *   email starts-with                   20
 *   email contains                       5
 *   phone contains                       3
 */
export function scoreMemberSearchMatch(
  member: SearchableMember,
  query: string,
): number {
  const q = (query || "").trim();
  if (q.length < MIN_QUERY_LEN) return 0;
  const tokens = tokenize(q);
  const first = (member.firstName || "").toLowerCase();
  const last = (member.lastName || "").toLowerCase();
  const email = (member.email || "").toLowerCase();
  const phone = (member.phone || "").toLowerCase();
  const memberNum = member.memberNumber != null ? String(member.memberNumber) : "";

  let total = 0;
  for (const rawTok of tokens) {
    const t = rawTok.toLowerCase();
    let best = 0;

    if (first === t || last === t) best = Math.max(best, 100);
    else if (first.startsWith(t) || last.startsWith(t)) best = Math.max(best, 50);
    else if (first.includes(t) || last.includes(t)) best = Math.max(best, 10);

    if (memberNum === t) best = Math.max(best, 40);

    if (email.startsWith(t)) best = Math.max(best, 20);
    else if (email.includes(t)) best = Math.max(best, 5);

    if (phone.includes(t)) best = Math.max(best, 3);

    total += best;
  }
  return total;
}

/**
 * Convenience: filter + rank in one call. Members not matching the
 * query are dropped; matches are returned sorted by descending score,
 * then alphabetically by lastName/firstName as a stable tie-break.
 */
export function filterAndRankMembers<M extends SearchableMember>(
  members: M[],
  query: string,
): M[] {
  const q = (query || "").trim();
  if (q.length < MIN_QUERY_LEN) return members;
  const matched: Array<{ m: M; score: number }> = [];
  for (const m of members) {
    if (!matchesMemberSearch(m, q)) continue;
    matched.push({ m, score: scoreMemberSearchMatch(m, q) });
  }
  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const al = (a.m.lastName || "").toLowerCase();
    const bl = (b.m.lastName || "").toLowerCase();
    if (al !== bl) return al.localeCompare(bl);
    return (a.m.firstName || "").toLowerCase().localeCompare((b.m.firstName || "").toLowerCase());
  });
  return matched.map((x) => x.m);
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
