// Cleanup: find RankTestCategory rows that share a (rankTestId, name)
// composite key and merge them into one. Duplicates are a race-condition
// artifact: two parallel POST /api/rank-tests/[id]/categories requests
// each saw "no duplicate yet" and both inserted.
//
// Strategy per duplicate group:
//   1. Pick the "winner" = the category with the most items (ties broken by
//      earliest createdAt — preserves whichever the user saw first).
//   2. Move every item from the losers into the winner.
//   3. Delete the losers (which should now be empty).
//
// We do NOT touch single-occurrence categories. We do NOT delete anything
// in dry-run mode. Run with --apply to actually mutate.
//
// Usage:
//   DRY RUN:  node scripts/dedupe-rank-test-categories.js "postgres://..."
//   APPLY:    node scripts/dedupe-rank-test-categories.js --apply "postgres://..."
const fs = require("fs");
const path = require("path");
function loadEnvFile(filename) {
  const fp = path.join(process.cwd(), filename);
  if (!fs.existsSync(fp)) return;
  const content = fs.readFileSync(fp, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const { PrismaClient } = require("@prisma/client");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const connStr = args.find((a) => !a.startsWith("--"));
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  console.log("=".repeat(72));
  console.log(apply ? "APPLY — merging duplicate categories + deleting empties" : "DRY RUN — no changes");
  console.log("=".repeat(72));

  // Pull every category with its items in one shot so we can plan locally.
  const categories = await p.rankTestCategory.findMany({
    select: {
      id: true,
      rankTestId: true,
      name: true,
      sortOrder: true,
      createdAt: true,
      items: { select: { id: true, sortOrder: true } },
      rankTest: {
        select: {
          name: true,
          rank: { select: { name: true, style: { select: { name: true } } } },
        },
      },
    },
  });

  // Group by (rankTestId, lowercased trimmed name)
  const groups = new Map();
  for (const c of categories) {
    const key = `${c.rankTestId}::${c.name.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let dupeGroups = 0;
  let totalMoved = 0;
  let totalDeleted = 0;
  let affectedRanks = new Set();

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    dupeGroups++;

    // Winner: most items first, then oldest. Losers get merged into it.
    const sorted = [...group].sort((a, b) => {
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);

    const ctx = winner.rankTest?.rank
      ? `${winner.rankTest.rank.style?.name || "?"} → ${winner.rankTest.rank.name} → "${winner.rankTest.name}"`
      : "(orphaned rankTest)";
    affectedRanks.add(ctx);
    console.log(`\n${ctx}`);
    console.log(`  keeping  ${winner.id}  "${winner.name}"  (${winner.items.length} items, sort ${winner.sortOrder})`);

    // Figure out next free sortOrder inside the winner so re-parented items go on the end.
    let nextSort = winner.items.length === 0
      ? 0
      : Math.max(...winner.items.map((i) => i.sortOrder ?? 0)) + 1;

    for (const loser of losers) {
      const moving = loser.items.length;
      const deleting = 1; // the loser category row
      console.log(`  merging  ${loser.id}  → moves ${moving} items, then deletes empty category`);
      totalMoved += moving;
      totalDeleted += deleting;

      if (!apply) continue;

      // Move each item over, preserving relative order at the tail of winner.
      const itemsSorted = [...loser.items].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );
      for (const item of itemsSorted) {
        await p.rankTestItem.update({
          where: { id: item.id },
          data: { categoryId: winner.id, sortOrder: nextSort++ },
        });
      }

      // Loser is now empty (or was already) — safe to delete.
      await p.rankTestCategory.delete({ where: { id: loser.id } });
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`Duplicate groups found:    ${dupeGroups}`);
  console.log(`Items to move:             ${totalMoved}`);
  console.log(`Empty categories to drop:  ${totalDeleted}`);
  console.log(`Ranks/tests affected:      ${affectedRanks.size}`);

  if (!apply) {
    console.log("\n(Re-run with --apply to commit.)");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
