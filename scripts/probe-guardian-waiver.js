// Verify that a recent guardian waiver submission landed correctly:
//   - Child member exists with SignedWaiver
//   - Parent member exists with SignedWaiver
//   - MemberRelationship links them
//
// Usage:
//   node scripts/probe-guardian-waiver.js "postgres://..." "ParentLastName"
//   node scripts/probe-guardian-waiver.js "postgres://..." <memberId>
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
const query = args.find((a) => !a.startsWith("postgres")) || "";
const p = connStr ? new PrismaClient({ datasources: { db: { url: connStr } } }) : new PrismaClient();

async function main() {
  console.log("=".repeat(72));
  console.log(`Guardian-waiver probe — looking up "${query || "(recent submissions)"}"`);
  console.log("=".repeat(72));

  const candidates = await p.member.findMany({
    where: query
      ? {
          OR: [
            { id: query },
            { lastName: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
          ],
        }
      : { signedWaivers: { some: { signedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, firstName: true, lastName: true, dateOfBirth: true, status: true,
      emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelationship: true,
      signedWaivers: {
        select: { id: true, templateName: true, signedAt: true, confirmed: true, pdfData: true },
        orderBy: { signedAt: "desc" },
      },
      relationshipsFrom: {
        select: { relationship: true, toMember: { select: { id: true, firstName: true, lastName: true } } },
      },
      relationshipsTo: {
        select: { relationship: true, fromMember: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (candidates.length === 0) {
    console.log("\nNo members matched.");
    await p.$disconnect();
    return;
  }

  for (const m of candidates) {
    console.log(`\n${m.firstName} ${m.lastName}  (id ${m.id})`);
    console.log(`  status:           ${m.status}`);
    console.log(`  dateOfBirth:      ${m.dateOfBirth ? m.dateOfBirth.toISOString().split("T")[0] : "(none)"}`);
    console.log(`  emergencyContact: ${m.emergencyContactName || "-"}  ${m.emergencyContactPhone || ""}  ${m.emergencyContactRelationship ? `(${m.emergencyContactRelationship})` : ""}`);
    console.log(`  signedWaivers:    ${m.signedWaivers.length}`);
    for (const w of m.signedWaivers) {
      console.log(`    - id ${w.id}  "${w.templateName}"  signed=${w.signedAt.toISOString()}  confirmed=${w.confirmed}  pdf=${w.pdfData ? `${w.pdfData.length} chars` : "(none)"}`);
    }
    if (m.relationshipsFrom.length > 0) {
      console.log(`  outgoing rels:`);
      for (const r of m.relationshipsFrom) {
        console.log(`    - ${r.relationship} → ${r.toMember.firstName} ${r.toMember.lastName} (${r.toMember.id})`);
      }
    }
    if (m.relationshipsTo.length > 0) {
      console.log(`  incoming rels:`);
      for (const r of m.relationshipsTo) {
        console.log(`    - ${r.relationship} ← ${r.fromMember.firstName} ${r.fromMember.lastName} (${r.fromMember.id})`);
      }
    }
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
