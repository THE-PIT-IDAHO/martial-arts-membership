const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  // 1. Custom class types Settings rows
  const rows = await p.settings.findMany({
    where: { key: "custom_class_types" },
  });
  console.log("=== Settings rows with key=custom_class_types ===");
  if (rows.length === 0) {
    console.log("(none) — the modal's save never persisted, OR clientId differs.");
  }
  for (const r of rows) {
    console.log(`  id=${r.id.slice(0, 8)}…  clientId=${r.clientId}  value=${r.value}`);
    try {
      const parsed = JSON.parse(r.value);
      console.log(`    parsed: ${JSON.stringify(parsed)}`);
    } catch {
      console.log("    !! value is not valid JSON");
    }
  }

  // 2. Distinct classType values currently attached to ClassSession rows
  const classes = await p.classSession.findMany({
    select: { classType: true, classTypes: true },
  });
  const seen = new Set();
  for (const c of classes) {
    if (c.classType) seen.add(c.classType);
    if (c.classTypes) {
      try {
        const arr = JSON.parse(c.classTypes);
        for (const t of arr) if (t) seen.add(t);
      } catch { /* ignore */ }
    }
  }
  console.log("\n=== Class types from saved ClassSession rows ===");
  console.log([...seen].sort());

  // 3. All clientIds in the system (helps spot mismatches)
  const clients = await p.client.findMany({ select: { id: true, name: true, slug: true } });
  console.log("\n=== Clients ===");
  for (const c of clients) console.log(`  ${c.id}  ${c.name}  ${c.slug}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
