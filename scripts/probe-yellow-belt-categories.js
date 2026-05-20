// Diagnostic: list RankTestCategory rows for the Hawaiian Kempo Yellow Belt
// so we can see whether duplicates exist at the data layer or only at render.
//
// Usage: node scripts/probe-yellow-belt-categories.js "postgres://..."
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
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  console.log("=".repeat(72));
  console.log("Yellow Belt Hawaiian Kempo — category audit");
  console.log("=".repeat(72));

  // Find the Yellow Belt rank under Hawaiian Kempo (any variant of the style name)
  const ranks = await p.rank.findMany({
    where: {
      name: { contains: "yellow", mode: "insensitive" },
      style: { name: { contains: "hawaiian kempo", mode: "insensitive" } },
    },
    select: {
      id: true,
      name: true,
      style: { select: { name: true } },
      rankTests: {
        select: {
          id: true,
          name: true,
          categories: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
              createdAt: true,
              items: { select: { id: true, name: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  for (const r of ranks) {
    console.log(`\n${r.style?.name} → ${r.name}  (rank id: ${r.id})`);
    for (const t of r.rankTests) {
      console.log(`  Test "${t.name}" (${t.id}) — ${t.categories.length} categories:`);
      for (const c of t.categories) {
        console.log(`    [${String(c.sortOrder).padStart(3)}] "${c.name}" (id ${c.id}, ${c.items.length} items, created ${c.createdAt.toISOString()})`);
      }

      // Group by lowercased trimmed name to spot duplicates.
      const byName = new Map();
      for (const c of t.categories) {
        const key = c.name.trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(c);
      }
      let dupesFound = 0;
      for (const [name, group] of byName) {
        if (group.length > 1) {
          dupesFound++;
          console.log(`    ⚠ DUPLICATE: "${name}" appears ${group.length} times → ids ${group.map(g => g.id).join(", ")}`);
        }
      }
      if (dupesFound === 0) console.log(`    ✓ no duplicate names in this test`);
    }
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
