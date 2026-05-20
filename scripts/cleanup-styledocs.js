// Strips auto-synced rank-PDF entries (those tagged with `fromRank`) from
// each member's `styleDocuments` JSON. These were duplicated copies of
// Rank.pdfDocument from before the central-serving migration — they're
// no longer rendered (the documents endpoint already filters fromRank
// entries out at line `if (doc.fromRank) continue;`), they're just dead
// weight bloating /api/members and slowing every page that loads it.
//
// Manually-uploaded admin docs (no fromRank tag) are preserved.
//
// Usage:
//   DRY RUN:   node scripts/cleanup-styledocs.js
//   APPLY:     node scripts/cleanup-styledocs.js --apply
//
// Can also pass a DB URL as the first non-flag arg.
const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const connStr = args.find((a) => !a.startsWith("--"));
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  console.log("=".repeat(60));
  console.log(apply ? "APPLY MODE — DB will be updated" : "DRY RUN — no changes");
  console.log("=".repeat(60));

  const members = await p.member.findMany({
    select: { id: true, firstName: true, lastName: true, styleDocuments: true },
  });

  let totalBefore = 0;
  let totalAfter = 0;
  let touched = 0;
  let wholeNulls = 0;
  const plan = [];

  for (const m of members) {
    const raw = m.styleDocuments || "";
    totalBefore += raw.length;
    if (!raw) continue;

    let docs;
    try {
      docs = JSON.parse(raw);
    } catch {
      console.log(`  [skip] ${m.firstName} ${m.lastName}: invalid JSON in styleDocuments`);
      totalAfter += raw.length;
      continue;
    }
    if (!Array.isArray(docs)) {
      totalAfter += raw.length;
      continue;
    }

    const before = docs.length;
    const kept = docs.filter((d) => !d || !d.fromRank);
    const removed = before - kept.length;

    if (removed === 0) {
      totalAfter += raw.length;
      continue;
    }

    const newValue = kept.length === 0 ? null : JSON.stringify(kept);
    const newSize = newValue ? newValue.length : 0;
    totalAfter += newSize;
    touched++;
    if (newValue === null) wholeNulls++;
    plan.push({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      beforeBytes: raw.length,
      afterBytes: newSize,
      removedDocs: removed,
      keptDocs: kept.length,
      newValue,
    });
  }

  for (const p of plan) {
    console.log(`  ${p.name.padEnd(28)} ${fmt(p.beforeBytes)} → ${fmt(p.afterBytes)}   (removed ${p.removedDocs} fromRank docs, kept ${p.keptDocs})`);
  }

  console.log(`\nMembers checked:       ${members.length}`);
  console.log(`Members to be touched: ${touched}`);
  console.log(`Will be nulled:        ${wholeNulls}`);
  console.log(`Total styleDocuments:  ${fmt(totalBefore)} → ${fmt(totalAfter)}  (saves ${fmt(totalBefore - totalAfter)})`);

  if (!apply) {
    console.log("\n(Re-run with --apply to commit these changes.)");
    await p.$disconnect();
    return;
  }

  console.log("\nApplying...");
  for (const item of plan) {
    await p.member.update({
      where: { id: item.id },
      data: { styleDocuments: item.newValue },
    });
  }
  console.log("Done.");
  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
