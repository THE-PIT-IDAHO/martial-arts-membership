// Backfill parent SignedWaiver rows that the earlier dedupe script
// (cleanup-waiver-duplicates.js) deleted under the old policy of "one
// row per pdf is enough". We've since reverted to "every member gets
// their own row" so both parent and child accounts can render the waiver.
//
// Strategy per guardian/parent → child relationship:
//   For each SignedWaiver on the CHILD, if the parent has no SignedWaiver
//   whose signedAt falls within 60s of the child's signedAt, clone the
//   waiver onto the parent (same pdfData, same signedAt, same confirmed
//   state). Skips parents that already have a paired row.
//
// Usage:
//   DRY RUN:  node scripts/backfill-parent-waivers.js "postgres://..."
//   APPLY:    node scripts/backfill-parent-waivers.js --apply "postgres://..."
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
const apply = args.includes("--apply");
const connStr = args.find((a) => a.startsWith("postgres"));
const p = connStr ? new PrismaClient({ datasources: { db: { url: connStr } } }) : new PrismaClient();

function isGuardianRel(rel) {
  if (!rel) return false;
  const s = rel.toLowerCase();
  return s.includes("parent") || s.includes("guardian");
}

async function main() {
  console.log("=".repeat(72));
  console.log(apply ? "APPLY — creating missing parent SignedWaiver rows" : "DRY RUN — no writes");
  console.log("=".repeat(72));

  const rels = await p.memberRelationship.findMany({
    select: {
      relationship: true,
      fromMember: { select: { id: true, firstName: true, lastName: true, clientId: true } },
      toMember: { select: { id: true, firstName: true, lastName: true, clientId: true } },
    },
  });

  let candidates = 0;
  let toBackfill = 0;
  let backfilled = 0;
  let skipped = 0;

  for (const r of rels) {
    if (!isGuardianRel(r.relationship)) continue;
    if (!r.fromMember || !r.toMember) continue;
    candidates++;

    const parent = r.fromMember;
    const child = r.toMember;

    const childWaivers = await p.signedWaiver.findMany({
      where: { memberId: child.id },
      select: { id: true, templateName: true, waiverContent: true, signatureData: true, pdfData: true, confirmed: true, confirmedAt: true, signedAt: true, clientId: true },
      orderBy: { signedAt: "desc" },
    });
    if (childWaivers.length === 0) continue;

    const parentWaivers = await p.signedWaiver.findMany({
      where: { memberId: parent.id },
      select: { signedAt: true },
    });

    for (const cw of childWaivers) {
      // Already paired? Skip.
      const alreadyHas = parentWaivers.some(
        (pw) => Math.abs(new Date(pw.signedAt) - new Date(cw.signedAt)) < 60_000,
      );
      if (alreadyHas) { skipped++; continue; }

      toBackfill++;
      console.log(`  ${parent.firstName} ${parent.lastName}  ← (clone of child "${child.firstName} ${child.lastName}" waiver from ${cw.signedAt.toISOString()})`);

      if (!apply) continue;
      try {
        await p.signedWaiver.create({
          data: {
            memberId: parent.id,
            templateName: cw.templateName,
            waiverContent: cw.waiverContent,
            signatureData: cw.signatureData,
            pdfData: cw.pdfData,
            confirmed: cw.confirmed,
            confirmedAt: cw.confirmedAt,
            signedAt: cw.signedAt,
            clientId: cw.clientId,
          },
        });
        backfilled++;
      } catch (err) {
        console.log(`    [FAIL] ${err.message}`);
      }
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`Guardian relationships scanned: ${candidates}`);
  console.log(`Parent waivers to backfill:     ${toBackfill}`);
  console.log(`Parent waivers already paired:  ${skipped}`);
  if (apply) console.log(`Created:                        ${backfilled}`);
  else console.log("\n(Re-run with --apply to commit.)");

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
