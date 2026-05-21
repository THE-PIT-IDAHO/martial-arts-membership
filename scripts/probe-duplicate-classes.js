// Find ClassSession rows that look like duplicates from repeated calendar
// edits in "single occurrence" mode. Each save in that mode creates a new
// non-recurring class — over time you end up with N stacked classes at the
// same name + day + time.
//
// Groups by (name, day-of-week, start-time). Reports any group with >1 row.
// Read-only — does not delete anything.
//
// Usage: node scripts/probe-duplicate-classes.js "postgres://..."
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

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function main() {
  console.log("=".repeat(72));
  console.log("Duplicate ClassSession scan");
  console.log("=".repeat(72));

  const sessions = await p.classSession.findMany({
    select: {
      id: true, name: true, startsAt: true, endsAt: true,
      isRecurring: true, isOngoing: true,
      coachName: true, classType: true,
      attendances: { select: { id: true } },
    },
  });

  const groups = new Map();
  for (const s of sessions) {
    const d = new Date(s.startsAt);
    const key = [
      s.name.trim().toLowerCase(),
      d.getDay(),
      d.toTimeString().slice(0, 5),
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  let totalDupes = 0;
  let groupsWithDupes = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    groupsWithDupes++;
    totalDupes += group.length - 1;

    const first = group[0];
    const day = DAY[new Date(first.startsAt).getDay()];
    const time = new Date(first.startsAt).toTimeString().slice(0, 5);
    console.log(`\n"${first.name}"  ${day} ${time}  (${group.length} rows)`);
    for (const s of group) {
      const r = s.isRecurring ? "recurring" : "one-off";
      const att = s.attendances.length;
      console.log(`  ${s.id}  ${r}  coach=${s.coachName || "-"}  attendance=${att}`);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`Duplicate groups:      ${groupsWithDupes}`);
  console.log(`Extra classes to drop: ${totalDupes}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
