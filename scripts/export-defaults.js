// Export local styles + beltConfig as a JSON file for default gym setup
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const p = new PrismaClient();

async function main() {
  const styles = await p.style.findMany({
    include: { ranks: { orderBy: { order: "asc" } } },
  });

  const defaults = styles.map(s => {
    let beltConfigRanks = [];
    if (s.beltConfig) {
      try {
        const parsed = JSON.parse(s.beltConfig);
        // Strip IDs that are specific to this DB instance but keep everything else
        beltConfigRanks = (parsed.ranks || []).map((r, i) => ({
          ...r,
          id: `default-${i}`,
          classRequirements: (r.classRequirements || []).map((cr, j) => ({
            ...cr,
            id: `req-${i}-${j}`,
          })),
        }));
      } catch {}
    }

    return {
      name: s.name,
      beltSystemEnabled: s.beltSystemEnabled,
      testNamingConvention: s.testNamingConvention,
      beltConfig: { ranks: beltConfigRanks },
      dbRanks: s.ranks.map(r => ({
        name: r.name,
        order: r.order,
        classRequirement: r.classRequirement,
      })),
    };
  });

  fs.writeFileSync("lib/default-styles.json", JSON.stringify(defaults, null, 2));
  console.log(`Exported ${defaults.length} styles to lib/default-styles.json`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
