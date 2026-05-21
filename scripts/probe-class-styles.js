// Diagnose how a specific ClassSession's style fields are stored in the DB.
// Pass either a class name (partial match) or class ID as the second arg.
//
// Usage:
//   node scripts/probe-class-styles.js "postgres://..." "Fight Team"
//   node scripts/probe-class-styles.js "postgres://..." cmllxxxxxxxx
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
const args = process.argv.slice(2);
const connStr = args.find((a) => a.startsWith("postgres"));
const query = args.find((a) => !a.startsWith("postgres")) || "Fight Team";
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  console.log("=".repeat(72));
  console.log(`Class style probe — searching for "${query}"`);
  console.log("=".repeat(72));

  const sessions = await p.classSession.findMany({
    where: {
      OR: [
        { id: query },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true, name: true, classType: true, classTypes: true,
      styleId: true, styleName: true, styleIds: true, styleNames: true,
      minRankId: true, minRankName: true, minRankIds: true,
      coachId: true, coachName: true, coachAttendsAsStudent: true,
    },
  });

  if (sessions.length === 0) {
    console.log("No classes found matching that query.");
    await p.$disconnect();
    return;
  }

  for (const s of sessions) {
    console.log(`\nClass: "${s.name}"  (id ${s.id})`);
    console.log(`  classType:        ${JSON.stringify(s.classType)}`);
    console.log(`  classTypes:       ${s.classTypes ?? "(null)"}`);
    console.log(`  styleId (legacy): ${JSON.stringify(s.styleId)}`);
    console.log(`  styleName (legacy): ${JSON.stringify(s.styleName)}`);
    console.log(`  styleIds:         ${s.styleIds ?? "(null)"}`);
    console.log(`  styleNames:       ${s.styleNames ?? "(null)"}`);
    console.log(`  minRankId:        ${JSON.stringify(s.minRankId)}`);
    console.log(`  minRankName:      ${JSON.stringify(s.minRankName)}`);
    console.log(`  minRankIds:       ${s.minRankIds ?? "(null)"}`);
    console.log(`  coach:            ${s.coachName ?? "(none)"} (id ${s.coachId ?? "-"}, attendsAsStudent=${s.coachAttendsAsStudent})`);
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
