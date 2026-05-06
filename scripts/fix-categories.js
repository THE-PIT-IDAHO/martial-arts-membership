const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // Delete all "Workout" categories (and their items)
  const workouts = await p.rankTestCategory.findMany({ where: { name: "Workout" } });
  for (const cat of workouts) {
    await p.rankTestItem.deleteMany({ where: { categoryId: cat.id } });
    await p.rankTestCategory.delete({ where: { id: cat.id } });
  }
  console.log(`Deleted ${workouts.length} Workout categories`);

  // Rename "Breaking" to "Board Breaking" and "Forms/Kata" to "Forms/Katas"
  const breaking = await p.rankTestCategory.updateMany({ where: { name: "Breaking" }, data: { name: "Board Breaking" } });
  console.log(`Renamed ${breaking.count} Breaking -> Board Breaking`);
  const forms = await p.rankTestCategory.updateMany({ where: { name: "Forms/Kata" }, data: { name: "Forms/Katas" } });
  console.log(`Renamed ${forms.count} Forms/Kata -> Forms/Katas`);

  // Fix sort order for all categories to match desired order
  const desiredOrder = ["Knowledge", "Techniques", "Combos", "Fitness", "Sparring", "Forms/Katas", "Board Breaking"];

  // Get all rank tests
  const tests = await p.rankTest.findMany({ select: { id: true } });
  for (const test of tests) {
    const cats = await p.rankTestCategory.findMany({ where: { rankTestId: test.id } });
    for (const cat of cats) {
      const idx = desiredOrder.indexOf(cat.name);
      const newOrder = idx >= 0 ? idx : 100; // unknown categories go to end
      if (cat.sortOrder !== newOrder) {
        await p.rankTestCategory.update({ where: { id: cat.id }, data: { sortOrder: newOrder } });
      }
    }
  }
  console.log(`Updated sort order for ${tests.length} tests`);

  // Remove duplicates
  const allCats = await p.rankTestCategory.findMany({ orderBy: { sortOrder: "asc" } });
  const seen = new Map();
  let deleted = 0;
  for (const cat of allCats) {
    const key = `${cat.rankTestId}-${cat.name}`;
    if (seen.has(key)) {
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
