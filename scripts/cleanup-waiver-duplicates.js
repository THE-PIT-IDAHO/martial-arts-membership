// Cleanup pass for waiver data after the guardian-waiver dedupe change.
//
// Three things this script does:
//   1. RENAME templateName values that contain "Public" — drop the word.
//      "Public Waiver"            → "Waiver"
//      "Public Waiver (Guardian)" → "Waiver"
//   2. DELETE the guardian-copy duplicate SignedWaiver rows. Background:
//      old code created two SignedWaiver rows from a single guardian
//      submission — one on the child, one on the guardian, with matching
//      pdfData and signedAt within seconds. The guardian copy was
//      redundant (the child's already counts for both via the parent
//      portal's minor-child aggregation). We delete the guardian copy
//      when we can confidently pair it to a child copy.
//   3. STRIP waiver entries from member.styleDocuments where the entry
//      name is literally "Signed Waiver" — those were written by the old
//      savePdfToMember() helper and now double-list the waiver on the
//      portal Documents tab (the SignedWaiver row is the source of truth).
//
// Usage:
//   DRY RUN:  node scripts/cleanup-waiver-duplicates.js "postgres://..."
//   APPLY:    node scripts/cleanup-waiver-duplicates.js --apply "postgres://..."
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
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  console.log("=".repeat(72));
  console.log(apply ? "APPLY — modifying DB" : "DRY RUN — no changes");
  console.log("=".repeat(72));

  // ---- 1) Rename "Public Waiver*" templateNames to "Waiver" ----
  const publicNamed = await p.signedWaiver.findMany({
    where: { templateName: { startsWith: "Public Waiver" } },
    select: { id: true, templateName: true, memberId: true },
  });
  console.log(`\n[1] templateName rename candidates: ${publicNamed.length}`);
  if (publicNamed.length > 0 && apply) {
    const res = await p.signedWaiver.updateMany({
      where: { templateName: { startsWith: "Public Waiver" } },
      data: { templateName: "Waiver" },
    });
    console.log(`    renamed ${res.count} rows → "Waiver"`);
  }

  // ---- 2) Delete guardian-copy duplicates ----
  // Find guardians (members with outgoing parent/guardian relationships)
  // who have a SignedWaiver that matches one of their child's SignedWaivers
  // by pdfData + signedAt close in time. Those are the redundant copies.
  const guardianRels = await p.memberRelationship.findMany({
    where: {
      OR: [
        { relationship: { contains: "parent", mode: "insensitive" } },
        { relationship: { contains: "guardian", mode: "insensitive" } },
      ],
    },
    select: { fromMemberId: true, toMemberId: true },
  });

  let dupesToDelete = [];
  for (const rel of guardianRels) {
    const guardianWaivers = await p.signedWaiver.findMany({
      where: { memberId: rel.fromMemberId },
      select: { id: true, pdfData: true, signedAt: true, templateName: true },
    });
    const childWaivers = await p.signedWaiver.findMany({
      where: { memberId: rel.toMemberId },
      select: { id: true, pdfData: true, signedAt: true },
    });
    for (const gw of guardianWaivers) {
      // Match guardian copy to a child waiver: same pdf bytes (compare
      // first 200 chars for speed) and signedAt within 60 seconds.
      const gwHead = (gw.pdfData || "").slice(0, 200);
      const match = childWaivers.find((cw) => {
        if (!gw.pdfData || !cw.pdfData) return false;
        const cwHead = cw.pdfData.slice(0, 200);
        if (gwHead !== cwHead) return false;
        const dt = Math.abs(new Date(gw.signedAt) - new Date(cw.signedAt));
        return dt < 60_000;
      });
      if (match) {
        dupesToDelete.push({ guardianId: rel.fromMemberId, waiverId: gw.id, childWaiverId: match.id });
      }
    }
  }
  console.log(`\n[2] guardian-copy duplicates to delete: ${dupesToDelete.length}`);
  for (const d of dupesToDelete.slice(0, 10)) {
    console.log(`    delete waiver ${d.waiverId} on member ${d.guardianId} (paired with child waiver ${d.childWaiverId})`);
  }
  if (dupesToDelete.length > 10) {
    console.log(`    … and ${dupesToDelete.length - 10} more`);
  }
  if (apply && dupesToDelete.length > 0) {
    const ids = dupesToDelete.map((d) => d.waiverId);
    const res = await p.signedWaiver.deleteMany({ where: { id: { in: ids } } });
    console.log(`    deleted ${res.count} rows`);
  }

  // ---- 3) Strip "Signed Waiver" entries from styleDocuments ----
  const membersWithDocs = await p.member.findMany({
    where: { styleDocuments: { not: null } },
    select: { id: true, firstName: true, lastName: true, styleDocuments: true },
  });
  let strippedCount = 0;
  let membersAffected = 0;
  for (const m of membersWithDocs) {
    let docs;
    try {
      docs = JSON.parse(m.styleDocuments);
    } catch {
      continue;
    }
    if (!Array.isArray(docs)) continue;
    const kept = docs.filter((d) => {
      if (!d || typeof d !== "object") return true;
      // Drop entries named "Signed Waiver" — those came from the old
      // savePdfToMember helper. Real waivers live on SignedWaiver rows now.
      if (typeof d.name === "string" && d.name.trim().toLowerCase() === "signed waiver") return false;
      return true;
    });
    if (kept.length !== docs.length) {
      strippedCount += docs.length - kept.length;
      membersAffected++;
      if (apply) {
        await p.member.update({
          where: { id: m.id },
          data: { styleDocuments: kept.length > 0 ? JSON.stringify(kept) : null },
        });
      }
    }
  }
  console.log(`\n[3] styleDocuments "Signed Waiver" entries to strip: ${strippedCount} (across ${membersAffected} members)`);

  console.log(`\n${"=".repeat(72)}`);
  console.log(apply ? "Done." : "Re-run with --apply to commit these changes.");
  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
