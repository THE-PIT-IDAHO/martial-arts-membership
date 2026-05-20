// One-shot migration: moves SignedContract.pdfData (base64 stored in
// Postgres) to the PRIVATE contracts Blob store. Each contract ends up
// with a Blob URL in pdfData; the bytes live in private storage.
//
// Run AFTER:
//   1. The new code is deployed (so reads can handle both formats)
//   2. The private Blob store is created on Vercel
//   3. CONTRACTS_READ_WRITE_TOKEN is in .env.local (vercel env pull)
//
// Usage:
//   DRY RUN:  node scripts/migrate-contracts-to-blob.js
//   APPLY:    node scripts/migrate-contracts-to-blob.js --apply
//   Remote:   node scripts/migrate-contracts-to-blob.js --apply "postgres://..."
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
const { put } = require("@vercel/blob");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const connStr = args.find((a) => !a.startsWith("--"));
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

function fmt(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function base64ToBuffer(s) {
  const commaIdx = s.indexOf(",");
  if (commaIdx >= 0 && s.startsWith("data:")) {
    return Buffer.from(s.slice(commaIdx + 1), "base64");
  }
  return Buffer.from(s, "base64");
}

async function main() {
  console.log("=".repeat(64));
  console.log(apply ? "APPLY — uploading contracts to private Blob + updating DB" : "DRY RUN — no uploads, no DB writes");
  console.log("=".repeat(64));

  const token = process.env.CONTRACTS_READ_WRITE_TOKEN;
  if (apply && !token) {
    console.error("\nERROR: CONTRACTS_READ_WRITE_TOKEN env var not set.");
    console.error("Create a private Blob store on Vercel with CONTRACTS as the env var prefix,");
    console.error("then run `vercel env pull .env.local` to bring it down.\n");
    process.exit(1);
  }

  const contracts = await p.signedContract.findMany({
    select: {
      id: true,
      clientId: true,
      pdfData: true,
      planName: true,
      member: { select: { firstName: true, lastName: true } },
    },
  });

  let totalBefore = 0;
  let totalAfter = 0;
  let migrated = 0;
  let skippedAlreadyUrl = 0;
  let skippedNoPdf = 0;
  let failed = 0;

  for (const c of contracts) {
    const name = `${c.member?.firstName || ""} ${c.member?.lastName || ""}`.trim() || "(unknown)";
    const label = `  ${name.padEnd(28)} ${(c.planName || "").padEnd(20)}`;

    if (!c.pdfData) {
      skippedNoPdf++;
      continue;
    }
    if (c.pdfData.startsWith("http")) {
      console.log(`${label} [skip] already a URL`);
      skippedAlreadyUrl++;
      continue;
    }

    const beforeBytes = c.pdfData.length;
    totalBefore += beforeBytes;

    let buffer;
    try {
      buffer = base64ToBuffer(c.pdfData);
    } catch (err) {
      console.log(`${label} [FAIL] decode: ${err.message}`);
      failed++;
      continue;
    }
    const afterBytes = buffer.length;
    totalAfter += afterBytes;

    console.log(`${label} ${fmt(beforeBytes)} → ${fmt(afterBytes)}`);

    if (!apply) {
      migrated++;
      continue;
    }

    try {
      const pathname = `contracts/${c.clientId}/${c.id}-${Date.now()}.pdf`;
      const blob = await put(pathname, buffer, {
        access: "private",
        contentType: "application/pdf",
        addRandomSuffix: false,
        token,
      });
      await p.signedContract.update({
        where: { id: c.id },
        data: { pdfData: blob.url },
      });
      migrated++;
    } catch (err) {
      console.log(`${label} [FAIL] upload: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`Contracts checked:    ${contracts.length}`);
  console.log(`Migrated:             ${migrated}`);
  console.log(`Skipped (already URL): ${skippedAlreadyUrl}`);
  console.log(`Skipped (no PDF):     ${skippedNoPdf}`);
  console.log(`Failed:               ${failed}`);
  console.log(`Total PDF bytes:      ${fmt(totalBefore)} → ${fmt(totalAfter)}  (saves ${fmt(totalBefore - totalAfter)} from DB)`);

  if (!apply) {
    console.log("\n(Re-run with --apply to commit. Requires CONTRACTS_READ_WRITE_TOKEN.)");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
