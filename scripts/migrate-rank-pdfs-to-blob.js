// One-shot migration: moves Rank.pdfDocument values (base64 data URIs holding
// curriculum PDFs) to Vercel Blob. Each rank ends up with a public Blob URL
// in its pdfDocument column instead of a 3-4 MB base64 string.
//
// Run AFTER the routes that read pdfDocument know how to handle both formats
// (the deploy that wires up uploadRankPdf must already be live).
//
// Usage:
//   DRY RUN:  node scripts/migrate-rank-pdfs-to-blob.js
//   APPLY:    node scripts/migrate-rank-pdfs-to-blob.js --apply
//   With a remote DB:
//             node scripts/migrate-rank-pdfs-to-blob.js --apply "postgres://..."
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

function dataUriToBuffer(dataUri) {
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx < 0) throw new Error("Not a data URI");
  return Buffer.from(dataUri.slice(commaIdx + 1), "base64");
}

async function main() {
  console.log("=".repeat(64));
  console.log(apply ? "APPLY — uploading PDFs to Blob + updating DB" : "DRY RUN — no uploads, no DB writes");
  console.log("=".repeat(64));

  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("\nERROR: BLOB_READ_WRITE_TOKEN env var not set.");
    console.error("Run `vercel env pull .env.local` first.\n");
    process.exit(1);
  }

  const ranks = await p.rank.findMany({
    select: {
      id: true,
      name: true,
      pdfDocument: true,
      style: { select: { name: true, clientId: true } },
    },
  });

  let totalBefore = 0;
  let totalAfter = 0;
  let migrated = 0;
  let skippedAlreadyUrl = 0;
  let skippedNoPdf = 0;
  let failed = 0;

  for (const r of ranks) {
    const label = `  ${(r.style?.name || "?").padEnd(24)} ${r.name.padEnd(20)}`;

    if (!r.pdfDocument) {
      skippedNoPdf++;
      continue;
    }

    if (!r.pdfDocument.startsWith("data:")) {
      console.log(`${label} [skip] already a URL`);
      skippedAlreadyUrl++;
      continue;
    }

    if (!r.style?.clientId) {
      console.log(`${label} [skip] missing style.clientId`);
      failed++;
      continue;
    }

    const beforeBytes = r.pdfDocument.length;
    totalBefore += beforeBytes;

    let buffer;
    try {
      buffer = dataUriToBuffer(r.pdfDocument);
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
      const pathname = `ranks/${r.style.clientId}/${r.id}-${Date.now()}.pdf`;
      const blob = await put(pathname, buffer, {
        access: "public",
        contentType: "application/pdf",
        addRandomSuffix: false,
      });
      await p.rank.update({
        where: { id: r.id },
        data: { pdfDocument: blob.url },
      });
      migrated++;
    } catch (err) {
      console.log(`${label} [FAIL] upload: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`Ranks checked:        ${ranks.length}`);
  console.log(`Migrated:             ${migrated}`);
  console.log(`Skipped (already URL): ${skippedAlreadyUrl}`);
  console.log(`Skipped (no PDF):     ${skippedNoPdf}`);
  console.log(`Failed:               ${failed}`);
  console.log(`Total PDF bytes:      ${fmt(totalBefore)} → ${fmt(totalAfter)}  (saves ${fmt(totalBefore - totalAfter)} from DB)`);

  if (!apply) {
    console.log("\n(Re-run with --apply to commit. Requires BLOB_READ_WRITE_TOKEN.)");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
