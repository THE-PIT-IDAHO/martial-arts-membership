// Run this script to push schema changes to production Neon
// Usage: node scripts/push-production.js
// It will prompt you to paste your Neon connection string

const { execSync } = require("child_process");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Paste your Neon connection string: ", (connStr) => {
  rl.close();
  connStr = connStr.trim();
  if (!connStr.startsWith("postgresql://")) {
    console.error("Invalid connection string. Must start with postgresql://");
    process.exit(1);
  }

  console.log("\n--- Step 1: Pushing schema to Neon ---");
  try {
    execSync(`npx prisma db push --accept-data-loss`, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connStr },
    });
  } catch {
    console.error("Schema push failed.");
    process.exit(1);
  }

  console.log("\n--- Step 2: Marking existing waivers as confirmed ---");
  // Use a child process with the correct DATABASE_URL
  const script = `
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    p.signedWaiver.updateMany({ where: { confirmed: false }, data: { confirmed: true, confirmedAt: new Date() } })
      .then(r => { console.log("Marked", r.count, "existing waivers as confirmed"); return p.$disconnect(); })
      .catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
  `;
  try {
    execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, " ")}"`, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connStr },
    });
  } catch {
    console.error("Waiver migration failed.");
    process.exit(1);
  }

  console.log("\nDone! Schema updated and existing waivers marked as confirmed.");
});
