// Usage: node scripts/check-rank-categories.js "<DB url or omit>" [styleNameLike] [rankNameLike]
// Example: node scripts/check-rank-categories.js "" "hawaiian kempo" "yellow"
const { PrismaClient } = require("@prisma/client");
const args = process.argv.slice(2);
const connStr = args[0] && args[0].startsWith("postgres") ? args[0] : undefined;
const styleNeedle = (args[connStr ? 1 : 0] || "").toLowerCase();
const rankNeedle = (args[connStr ? 2 : 1] || "").toLowerCase();

const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  const styles = await p.style.findMany({
    where: styleNeedle ? { name: { contains: styleNeedle, mode: "insensitive" } } : undefined,
    include: {
      ranks: {
        where: rankNeedle ? { name: { contains: rankNeedle, mode: "insensitive" } } : undefined,
        include: {
          rankTests: {
            include: {
              categories: {
                include: { _count: { select: { items: true } } },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  for (const style of styles) {
    if (style.ranks.length === 0) continue;
    console.log(`\n=== Style: ${style.name} ===`);
    for (const rank of style.ranks) {
      console.log(`\n  Rank: ${rank.name} (id ${rank.id.slice(0, 8)}…)`);
      if (rank.rankTests.length === 0) {
        console.log("    (no rankTests)");
        continue;
      }
      for (const test of rank.rankTests) {
        console.log(`    Test ${test.id.slice(0, 8)}… (${test.name || "unnamed"})  ${test.categories.length} categor${test.categories.length === 1 ? "y" : "ies"}`);
        for (const cat of test.categories) {
          const flag = test.categories.filter(c => c.name.trim().toLowerCase() === cat.name.trim().toLowerCase()).length > 1
            ? "  ⚠ DUPLICATE NAME WITHIN TEST"
            : "";
          console.log(`      • ${cat.name}  (sortOrder=${cat.sortOrder}, ${cat._count.items} items, id ${cat.id.slice(0, 8)}…)${flag}`);
        }
      }
      // Cross-test duplicates
      const allCats = rank.rankTests.flatMap(t => t.categories);
      const nameCounts = new Map();
      for (const cat of allCats) {
        const key = cat.name.trim().toLowerCase();
        nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
      }
      const dupes = [...nameCounts.entries()].filter(([, n]) => n > 1);
      if (dupes.length) {
        console.log("    ⚠ Names appearing in multiple tests on this rank:");
        for (const [name, count] of dupes) console.log(`      ${name}: ${count} copies`);
      }
    }
  }

  await p.$disconnect();
}
main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
