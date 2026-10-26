import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

/**
 * GET /api/reports/belt-order
 *
 * Simple belt order sheet: Belt | Size | Count, plus the list of exactly
 * who was counted (and who was skipped, with the reason) so it's never
 * a mystery what the numbers came from.
 *
 * Sources (pick one):
 *   ?testingEventId=ID   belt = the rank each participant is testing FOR
 *       &include=all|passed   all = everyone signed up except failed /
 *                             no-show / cancelled (default); passed = PASSED only
 *   ?styleId=ID          every member enrolled (active) in that style
 *       &belt=current|next    current belt (default) or the next belt up
 *       &members=active|all   active members only (default) or everyone
 *
 * Optional for both: &onlyStyleId=ID narrows a multi-style test to one style.
 */

type Row = { belt: string; size: string; count: number; order: number };
type Counted = { memberId: string; name: string; style: string; belt: string; size: string };
type Skipped = { memberId: string; name: string; reason: string };

type StyleDef = { id: string; name: string; ranks: Array<{ name: string; order: number }> };

function parseNotes(raw: string | null): Array<{ name?: string; rank?: string; beltSize?: string; active?: boolean }> {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function styleRanks(style: { beltConfig: string | null; ranks: Array<{ name: string; order: number }> }) {
  // beltConfig is the source of truth for rank order; Rank rows are the fallback.
  if (style.beltConfig) {
    try {
      const cfg = JSON.parse(style.beltConfig);
      if (Array.isArray(cfg?.ranks) && cfg.ranks.length > 0) {
        return (cfg.ranks as Array<{ name?: string; order?: number }>)
          .filter((r) => r?.name)
          .map((r, i) => ({ name: r.name as string, order: typeof r.order === "number" ? r.order : i }))
          .sort((a, b) => a.order - b.order);
      }
    } catch { /* fall through */ }
  }
  return [...style.ranks].sort((a, b) => a.order - b.order);
}

const eq = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const testingEventId = searchParams.get("testingEventId");
    const styleId = searchParams.get("styleId");
    const onlyStyleId = searchParams.get("onlyStyleId");

    const allStyles = await prisma.style.findMany({
      where: { clientId },
      select: { id: true, name: true, beltConfig: true, ranks: { select: { name: true, order: true } } },
    });
    const styles: StyleDef[] = allStyles.map((s) => ({ id: s.id, name: s.name, ranks: styleRanks(s) }));
    const styleByName = new Map(styles.map((s) => [s.name.toLowerCase(), s]));
    const styleById = new Map(styles.map((s) => [s.id, s]));
    const rankOrder = (styleName: string, rank: string) => {
      const s = styleByName.get(styleName.toLowerCase());
      const r = s?.ranks.find((x) => eq(x.name, rank));
      return r ? r.order : 9999;
    };

    const counted: Counted[] = [];
    const skipped: Skipped[] = [];
    let title = "";

    if (testingEventId) {
      const include = searchParams.get("include") === "passed" ? "passed" : "all";
      const ev = await prisma.testingEvent.findFirst({
        where: { id: testingEventId, clientId },
        select: {
          name: true,
          styleName: true,
          styleNames: true,
          participants: { select: { memberId: true, memberName: true, currentRank: true, testingForRank: true, status: true } },
        },
      });
      if (!ev) return NextResponse.json({ error: "Testing event not found" }, { status: 404 });
      title = ev.name;

      let evStyles: string[] = [];
      if (ev.styleNames) {
        try { const p = JSON.parse(ev.styleNames); if (Array.isArray(p)) evStyles = p; } catch { /* ignore */ }
      }
      if (evStyles.length === 0 && ev.styleName) evStyles = [ev.styleName];
      if (onlyStyleId) {
        const only = styleById.get(onlyStyleId);
        evStyles = only ? evStyles.filter((s) => eq(s, only.name)) : [];
      }

      const members = await prisma.member.findMany({
        where: { id: { in: ev.participants.map((p) => p.memberId) }, clientId },
        select: { id: true, firstName: true, lastName: true, stylesNotes: true },
      });
      const memberById = new Map(members.map((m) => [m.id, m]));
      const SKIP_ALL = new Set(["FAILED", "NO_SHOW", "CANCELLED", "CANCELED"]);

      for (const p of ev.participants) {
        const m = memberById.get(p.memberId);
        const name = m ? `${m.firstName} ${m.lastName}`.trim() : p.memberName;
        const status = (p.status || "").toUpperCase();
        if (include === "passed" && status !== "PASSED") {
          skipped.push({ memberId: p.memberId, name, reason: `Not passed (${status || "no result"})` });
          continue;
        }
        if (include === "all" && SKIP_ALL.has(status)) {
          skipped.push({ memberId: p.memberId, name, reason: `Marked ${status.toLowerCase().replace("_", "-")}` });
          continue;
        }
        if (!p.testingForRank) {
          skipped.push({ memberId: p.memberId, name, reason: "No 'testing for' belt set on their registration" });
          continue;
        }
        // Which of the test's styles is this person testing in? The style
        // whose belt list contains the belt they're testing for.
        const byRank = evStyles.filter((s) => styleByName.get(s.toLowerCase())?.ranks.some((r) => eq(r.name, p.testingForRank)));
        const notes = parseNotes(m?.stylesNotes ?? null);
        let style: string | undefined;
        if (byRank.length === 1) style = byRank[0];
        else {
          const pool = byRank.length > 1 ? byRank : evStyles;
          const enrolled = pool.filter((s) => notes.some((n) => eq(n.name, s)));
          const byCurrent = enrolled.find((s) => notes.some((n) => eq(n.name, s) && eq(n.rank, p.currentRank)));
          style = byCurrent || (enrolled.length === 1 ? enrolled[0] : undefined) || (pool.length === 1 ? pool[0] : undefined);
        }
        if (!style) {
          skipped.push({
            memberId: p.memberId,
            name,
            reason: evStyles.length === 0 ? "Not in the selected style" : "Couldn't tell which style they're testing in",
          });
          continue;
        }
        const entry = notes.find((n) => eq(n.name, style));
        counted.push({
          memberId: p.memberId,
          name,
          style,
          belt: p.testingForRank,
          size: (entry?.beltSize || "").trim() || "No size",
        });
      }
    } else if (styleId) {
      const style = styleById.get(styleId);
      if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });
      const which = searchParams.get("belt") === "next" ? "next" : "current";
      const activeOnly = searchParams.get("members") !== "all";
      title = `${style.name} — ${which === "next" ? "next belt" : "current belt"}`;

      const members = await prisma.member.findMany({
        where: { clientId },
        select: { id: true, firstName: true, lastName: true, status: true, stylesNotes: true, primaryStyle: true, rank: true },
      });
      for (const m of members) {
        const name = `${m.firstName} ${m.lastName}`.trim();
        const notes = parseNotes(m.stylesNotes);
        const entry = notes.find((n) => eq(n.name, style.name) && n.active !== false);
        const legacy = !entry && notes.length === 0 && eq(m.primaryStyle, style.name);
        if (!entry && !legacy) continue; // not enrolled in this style -- not listed at all
        if (activeOnly) {
          const s = (m.status || "").toUpperCase();
          if (!(s.includes("ACTIVE") && !s.includes("INACTIVE"))) continue;
        }
        const currentRank = entry?.rank || (legacy ? m.rank : null) || "";
        let belt = currentRank;
        if (which === "next") {
          const idx = style.ranks.findIndex((r) => eq(r.name, currentRank));
          if (idx < 0) {
            skipped.push({ memberId: m.id, name, reason: currentRank ? `Current belt "${currentRank}" isn't in ${style.name}'s belt list` : "No current belt set" });
            continue;
          }
          if (idx >= style.ranks.length - 1) {
            skipped.push({ memberId: m.id, name, reason: "Already at the top belt" });
            continue;
          }
          belt = style.ranks[idx + 1].name;
        }
        if (!belt) {
          skipped.push({ memberId: m.id, name, reason: "No current belt set" });
          continue;
        }
        counted.push({ memberId: m.id, name, style: style.name, belt, size: (entry?.beltSize || "").trim() || "No size" });
      }
    } else {
      return NextResponse.json({ error: "Pick a testing event or a style" }, { status: 400 });
    }

    // Tally Belt + Size. A test can span styles, so the belt label carries
    // the style only when more than one style is present.
    const multiStyle = new Set(counted.map((c) => c.style.toLowerCase())).size > 1;
    const tally = new Map<string, Row>();
    for (const c of counted) {
      const belt = multiStyle ? `${c.belt} (${c.style})` : c.belt;
      const key = `${belt}|||${c.size}`;
      const row = tally.get(key);
      if (row) row.count++;
      else tally.set(key, { belt, size: c.size, count: 1, order: rankOrder(c.style, c.belt) });
    }
    const sizeKey = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    const rows = [...tally.values()].sort(
      (a, b) => a.order - b.order || a.belt.localeCompare(b.belt) || sizeKey(a.size) - sizeKey(b.size) || a.size.localeCompare(b.size),
    );

    counted.sort((a, b) => rankOrder(a.style, a.belt) - rankOrder(b.style, b.belt) || a.name.localeCompare(b.name));
    skipped.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      title,
      rows: rows.map(({ belt, size, count }) => ({ belt, size, count })),
      total: counted.length,
      counted,
      skipped,
    });
  } catch (err) {
    console.error("[belt-order] error:", err);
    return NextResponse.json({ error: "Failed to build belt order" }, { status: 500 });
  }
}
