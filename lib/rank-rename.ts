import { prisma } from "@/lib/prisma";

// "Orange Belt" / "orange" / "Orange  belt" all compare equal.
export function rankKey(name: string | null | undefined): string {
  return (name || "")
    .replace(/\bbelt\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type Note = { name?: string; rank?: string; [k: string]: unknown };

function parseNotes(raw: string | null): Note[] | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Bring every member's saved belt for one style in line with the
 * style's current belt list. A member's rank is stored by NAME (in
 * stylesNotes, plus Member.rank for their primary style), so renaming a
 * belt in the style left members pointing at a name that no longer
 * exists -- their attendance / progress stopped lining up.
 *
 * Two ways a member's belt gets fixed:
 *   - renames: explicit old -> new pairs from this save
 *   - repair:  any belt not in the style's list is matched to the list
 *              ignoring the word "belt" and case ("Orange" -> "Orange Belt")
 * Belts that can't be matched are left untouched and reported.
 */
export async function syncMemberRankNames(opts: {
  clientId: string;
  styleName: string;
  rankNames: string[];
  renames?: Array<{ from: string; to: string }>;
}): Promise<{ updatedMembers: number; unmatched: Array<{ memberId: string; name: string; rank: string }> }> {
  const { clientId, styleName, rankNames } = opts;
  const renames = (opts.renames || []).filter((r) => r.from && r.to && r.from !== r.to);
  // Exact names (case included) -- "orange belt" gets tidied to "Orange Belt".
  const valid = new Set(rankNames.map((n) => n.trim()));
  const byKey = new Map<string, string>();
  for (const n of rankNames) {
    const k = rankKey(n);
    // Only map a key that's unique in the list -- never guess between two belts.
    byKey.set(k, byKey.has(k) ? "" : n);
  }

  const resolve = (current: string): string | null => {
    const exact = renames.find((r) => same(r.from, current));
    if (exact) return exact.to;
    if (valid.has(current.trim())) return null; // already exactly right
    const match = byKey.get(rankKey(current));
    return match ? match : null;
  };

  const members = await prisma.member.findMany({
    where: {
      clientId,
      OR: [{ stylesNotes: { contains: styleName } }, { primaryStyle: styleName }],
    },
    select: { id: true, firstName: true, lastName: true, stylesNotes: true, primaryStyle: true, rank: true },
  });

  let updatedMembers = 0;
  const unmatched: Array<{ memberId: string; name: string; rank: string }> = [];

  for (const m of members) {
    const data: { stylesNotes?: string; rank?: string } = {};
    const notes = parseNotes(m.stylesNotes);
    if (notes) {
      let changed = false;
      for (const n of notes) {
        if (!same(n.name, styleName) || !n.rank) continue;
        const next = resolve(n.rank);
        if (next && next !== n.rank) {
          n.rank = next;
          changed = true;
        } else if (!next && !valid.has(n.rank.trim())) {
          unmatched.push({ memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), rank: n.rank });
        }
      }
      if (changed) data.stylesNotes = JSON.stringify(notes);
    }
    if (same(m.primaryStyle, styleName) && m.rank) {
      const next = resolve(m.rank);
      if (next && next !== m.rank) data.rank = next;
    }
    if (Object.keys(data).length > 0) {
      await prisma.member.update({ where: { id: m.id }, data });
      updatedMembers++;
    }
  }

  // Open testing registrations in this style carry rank names too.
  if (renames.length > 0) {
    const openParticipants = await prisma.testingParticipant.findMany({
      where: {
        testingEvent: { clientId, status: { not: "COMPLETED" }, OR: [{ styleName }, { styleNames: { contains: styleName } }] },
      },
      select: { id: true, currentRank: true, testingForRank: true },
    });
    for (const p of openParticipants) {
      const cur = p.currentRank ? renames.find((r) => same(r.from, p.currentRank))?.to : undefined;
      const tgt = p.testingForRank ? renames.find((r) => same(r.from, p.testingForRank))?.to : undefined;
      if (cur || tgt) {
        await prisma.testingParticipant.update({
          where: { id: p.id },
          data: { ...(cur ? { currentRank: cur } : {}), ...(tgt ? { testingForRank: tgt } : {}) },
        });
      }
    }
  }

  return { updatedMembers, unmatched };
}
