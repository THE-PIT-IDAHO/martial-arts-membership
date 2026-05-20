const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const styles = await p.style.findMany({
    include: {
      ranks: { orderBy: { order: "asc" } },
    },
  });

  for (const s of styles) {
    console.log(`\n=== ${s.name} ===`);
    console.log("beltSystemEnabled:", s.beltSystemEnabled);
    console.log("testNamingConvention:", s.testNamingConvention);
    if (s.beltConfig) {
      try {
        const config = JSON.parse(s.beltConfig);
        console.log("\nbeltConfig ranks:");
        console.log(JSON.stringify(config.ranks, null, 2));
      } catch {
        console.log("beltConfig: (invalid JSON)");
      }
    } else {
      console.log("beltConfig: null");
    }
    console.log("\nDB Ranks:");
    for (const r of s.ranks) {
      console.log(`  ${r.order}: ${r.name} (classReq: ${r.classRequirement})`);
    }
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
