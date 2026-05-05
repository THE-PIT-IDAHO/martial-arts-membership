// Migrate styles to have the correct clientId
// Run AFTER schema push: node scripts/migrate-styles.js
// This assigns all existing styles to the "app" client (The Pit)

const { PrismaClient } = require("@prisma/client");

async function main() {
  const connStr = process.argv[2];
  const p = connStr
    ? new PrismaClient({ datasources: { db: { url: connStr } } })
    : new PrismaClient();

  try {
    // Find the "app" client (The Pit)
    const appClient = await p.client.findUnique({ where: { slug: "app" } });
    if (!appClient) {
      console.log("No 'app' client found. Skipping migration.");
      return;
    }

    // Update all styles with default-client to use the app client
    const result = await p.style.updateMany({
      where: { clientId: "default-client" },
      data: { clientId: appClient.id },
    });

    console.log(`Migrated ${result.count} styles to client "${appClient.name}" (${appClient.id})`);
  } catch (e) {
    console.error("Migration error:", e.message);
  } finally {
    await p.$disconnect();
  }
}

main();
