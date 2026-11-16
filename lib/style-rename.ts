import { prisma } from "@/lib/prisma";

// A style is referenced by NAME in several places (members' stylesNotes +
// primaryStyle, and denormalized labels on classes / tests / events).
// Renaming a style without updating those left members "enrolled" under a
// name that no longer exists -- promotions, eligibility and progress all
// match by name, so those members were silently skipped (e.g. a Finish
// Event that never promoted or charged them).

type Note = { name?: string; [k: string]: unknown };

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function parseArray<T = unknown>(raw: string | null | undefined): T[] | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/** Rewrite every name-based reference to a style after it was renamed. */
export async function renameStyleReferences(opts: {
  clientId: string;
  styleId: string;
  oldName: string;
  newName: string;
}): Promise<{ members: number; classes: number; tests: number; events: number }> {
  const { clientId, styleId, oldName, newName } = opts;
  const counts = { members: 0, classes: 0, tests: 0, events: 0 };
  if (!oldName || !newName || oldName === newName) return counts;

  // Members: stylesNotes entries + primaryStyle.
  const members = await prisma.member.findMany({
    where: {
      clientId,
      OR: [
        { stylesNotes: { contains: oldName, mode: "insensitive" } },
        { primaryStyle: { equals: oldName, mode: "insensitive" } },
      ],
    },
    select: { id: true, stylesNotes: true, primaryStyle: true },
  });
  for (const m of members) {
    const data: { stylesNotes?: string; primaryStyle?: string } = {};
    const notes = parseArray<Note>(m.stylesNotes);
    if (notes) {
      let changed = false;
      for (const n of notes) {
        if (same(n.name, oldName)) {
          n.name = newName;
          changed = true;
        }
      }
      if (changed) data.stylesNotes = JSON.stringify(notes);
    }
    if (same(m.primaryStyle, oldName)) data.primaryStyle = newName;
    if (Object.keys(data).length > 0) {
      await prisma.member.update({ where: { id: m.id }, data });
      counts.members++;
    }
  }

  // Classes: single-style label + multi-style name list (class eligibility
  // matches on these names).
  const classes = await prisma.classSession.findMany({
    where: {
      clientId,
      OR: [
        { styleId },
        { styleIds: { contains: styleId } },
        { styleName: { equals: oldName, mode: "insensitive" } },
        { styleNames: { contains: oldName, mode: "insensitive" } },
      ],
    },
    select: { id: true, styleId: true, styleName: true, styleNames: true },
  });
  for (const c of classes) {
    const data: { styleName?: string; styleNames?: string } = {};
    if (same(c.styleName, oldName)) data.styleName = newName;
    const names = parseArray<string>(c.styleNames);
    if (names && names.some((n) => same(n, oldName))) {
      data.styleNames = JSON.stringify(names.map((n) => (same(n, oldName) ? newName : n)));
    }
    if (Object.keys(data).length > 0) {
      await prisma.classSession.update({ where: { id: c.id }, data });
      counts.classes++;
    }
  }

  // Testing events (test results are matched to styles by this name).
  const tests = await prisma.testingEvent.findMany({
    where: {
      clientId,
      OR: [
        { styleId },
        { styleIds: { contains: styleId } },
        { styleName: { equals: oldName, mode: "insensitive" } },
        { styleNames: { contains: oldName, mode: "insensitive" } },
      ],
    },
    select: { id: true, styleName: true, styleNames: true },
  });
  for (const t of tests) {
    const data: { styleName?: string; styleNames?: string } = {};
    if (same(t.styleName, oldName)) data.styleName = newName;
    const names = parseArray<string>(t.styleNames);
    if (names && names.some((n) => same(n, oldName))) {
      data.styleNames = JSON.stringify(names.map((n) => (same(n, oldName) ? newName : n)));
    }
    if (Object.keys(data).length > 0) {
      await prisma.testingEvent.update({ where: { id: t.id }, data });
      counts.tests++;
    }
  }

  // Promotion events + appointments: label only, keyed by styleId.
  const pe = await prisma.promotionEvent.updateMany({
    where: { clientId, styleId, styleName: { not: newName } },
    data: { styleName: newName },
  });
  const ap = await prisma.appointment.updateMany({
    where: { clientId, styleId, styleName: { not: newName } },
    data: { styleName: newName },
  });
  counts.events = pe.count + ap.count;

  return counts;
}

/**
 * Repair members already stuck from an earlier rename (before
 * renameStyleReferences existed). A member is fixed when:
 *   - one of their ACTIVE membership plans covers this style,
 *   - they have no stylesNotes entry under the style's current name, and
 *   - exactly ONE of their stylesNotes entries names a style that no longer
 *     exists in this gym (the old name).
 * That leftover entry is renamed (rank, dates etc. are kept). Anything
 * ambiguous is left alone.
 */
export async function repairOrphanStyleEntries(opts: {
  clientId: string;
  styleId: string;
  styleName: string;
}): Promise<{ repaired: number }> {
  const { clientId, styleId, styleName } = opts;

  const styles = await prisma.style.findMany({ where: { clientId }, select: { name: true } });
  const existing = new Set(styles.map((s) => s.name.trim().toLowerCase()));

  const members = await prisma.member.findMany({
    where: {
      clientId,
      memberships: {
        some: { status: "ACTIVE", membershipPlan: { allowedStyles: { contains: styleId } } },
      },
    },
    select: { id: true, stylesNotes: true, primaryStyle: true },
  });

  let repaired = 0;
  for (const m of members) {
    const notes = parseArray<Note>(m.stylesNotes);
    if (!notes || notes.some((n) => same(n.name, styleName))) continue;
    const orphans = notes.filter((n) => n.name && !existing.has(n.name.trim().toLowerCase()));
    if (orphans.length !== 1) continue;

    const oldName = orphans[0].name!;
    orphans[0].name = styleName;
    const data: { stylesNotes: string; primaryStyle?: string } = { stylesNotes: JSON.stringify(notes) };
    if (same(m.primaryStyle, oldName)) data.primaryStyle = styleName;
    await prisma.member.update({ where: { id: m.id }, data });
    repaired++;
  }
  return { repaired };
}
