const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // Find all categories grouped by rankTestId + name
  const cats = await p.rankTestCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const seen = new Map(); // key: rankTestId-name, value: first category id
  let deleted = 0;

  for (const cat of cats) {
    const key = `${cat.rankTestId}-${cat.name}`;
    if (seen.has(key)) {
      // Duplicate — delete it (and its items)
      await p.rankTestItem.deleteMany({ where: { categoryId: cat.id } });
      await p.rankTestCategory.delete({ where: { id: cat.id } });
      deleted++;
    } else {
      seen.set(key, cat.id);
    }
  }

  console.log(`Deleted ${deleted} duplicate categories`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });
