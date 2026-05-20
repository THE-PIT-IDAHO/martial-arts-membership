// Quick check for a specific rank's stored pdfDocument value + whether
// the underlying Blob URL still responds.
//
// Usage: node scripts/probe-rank-pdf.js "postgres://..." <rankId>
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
const rankId = args.find((a) => !a.startsWith("postgres") && !a.startsWith("--")) || "cmll58zqx00pod7jem7cnvt2i";
const connStr = args.find((a) => a.startsWith("postgres"));
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

async function main() {
  console.log(`Looking up rank ${rankId}…`);
  const rank = await p.rank.findUnique({
    where: { id: rankId },
    select: { id: true, name: true, pdfDocument: true, style: { select: { name: true } } },
  });

  if (!rank) {
    console.log("Rank not found.");
    await p.$disconnect();
    return;
  }

  console.log(`Rank: ${rank.style?.name} → ${rank.name}`);
  console.log(`pdfDocument length: ${(rank.pdfDocument || "").length}`);
  if (!rank.pdfDocument) {
    console.log("pdfDocument is null/empty.");
    await p.$disconnect();
    return;
  }
  if (rank.pdfDocument.startsWith("http")) {
    console.log(`Format: URL`);
    console.log(`URL: ${rank.pdfDocument}`);
    console.log("\nFetching the URL…");
    try {
      const res = await fetch(rank.pdfDocument);
      console.log(`  status: ${res.status} ${res.statusText}`);
      console.log(`  content-type: ${res.headers.get("content-type")}`);
      console.log(`  content-length: ${res.headers.get("content-length")}`);
    } catch (err) {
      console.log(`  FETCH ERROR: ${err.message}`);
    }
  } else if (rank.pdfDocument.startsWith("data:")) {
    console.log(`Format: base64 data URI (NOT migrated)`);
  } else {
    console.log(`Format: unknown — first 80 chars: ${rank.pdfDocument.slice(0, 80)}`);
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
