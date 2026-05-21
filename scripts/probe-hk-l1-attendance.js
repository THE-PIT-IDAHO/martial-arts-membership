// Diagnose missing Hawaiian Kempo Level 1 attendance on specific dates.
// Lists every ClassSession matching HK Level 1, then the attendance for
// each on the dates the user said had losses.
//
// Usage: node scripts/probe-hk-l1-attendance.js "postgres://..."
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

const TARGET_DATES = ["2026-05-11", "2026-05-13", "2026-05-15", "2026-05-18", "2026-05-20"];

async function main() {
  console.log("=".repeat(72));
  console.log("Hawaiian Kempo Level 1 attendance probe");
  console.log("=".repeat(72));

  // Find every classSession matching HK Level 1 by name (broad — picks up
  // any naming variation: "Level 1", "Lvl 1", etc.)
  const sessions = await prisma.classSession.findMany({
    where: {
      OR: [
        { name: { contains: "level 1", mode: "insensitive" } },
        { name: { contains: "lvl 1", mode: "insensitive" } },
      ],
    },
    select: {
      id: true, name: true, classType: true, classTypes: true,
      styleName: true, styleNames: true, coachId: true, coachName: true,
      coachAttendsAsStudent: true,
    },
  });

  console.log(`\nFound ${sessions.length} ClassSession(s) matching "level 1":`);
  for (const s of sessions) {
    console.log(`  ${s.id}  "${s.name}"  type=${s.classType || "?"}  style=${s.styleName || s.styleNames || "?"}  coach=${s.coachName || "(none)"}  coachAttendsAsStudent=${s.coachAttendsAsStudent}`);
  }

  if (sessions.length === 0) {
    console.log("\n(no matching classes — adjust search term in script)");
    await p.$disconnect();
    return;
  }

  // For each target date, show all attendance rows on these sessions.
  console.log("\nAttendance per target date:");
  for (const dateStr of TARGET_DATES) {
    const [y, m, d] = dateStr.split("-").map(Number);
    // Look at a wide window since attendanceDate timezone can vary.
    const dayStart = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, m - 1, d + 1, 23, 59, 59));

    const atts = await prisma.attendance.findMany({
      where: {
        classSessionId: { in: sessions.map((s) => s.id) },
        attendanceDate: { gte: dayStart, lte: dayEnd },
      },
      include: {
        member: { select: { firstName: true, lastName: true } },
        classSession: { select: { name: true } },
      },
      orderBy: { attendanceDate: "asc" },
    });

    console.log(`\n  ${dateStr}: ${atts.length} attendance row(s)`);
    for (const a of atts) {
      const dt = new Date(a.attendanceDate).toISOString();
      const name = a.member ? `${a.member.firstName} ${a.member.lastName}` : "?";
      console.log(`    ${a.id.slice(0,8)}  ${dt}  class="${a.classSession?.name}"  member="${name}"  src=${a.source}  conf=${a.confirmed}  override=${a.requirementOverride}`);
    }
  }

  await prisma.$disconnect();
}

const prisma = p;
main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
