const { PrismaClient } = require("@prisma/client");
const connStr = process.argv[2];
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  const styles = await p.style.findMany({
    include: { ranks: { orderBy: { order: "asc" } } },
  });
  for (const s of styles) {
    console.log(`\nStyle: ${s.name} (clientId: ${s.clientId})`);
    if (s.ranks.length === 0) {
      console.log("  No ranks");
    } else {
      for (const r of s.ranks) {
        console.log(`  ${r.order}: ${r.name}`);
      }
    }
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
