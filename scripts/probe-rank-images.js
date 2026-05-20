// What's stored in Rank.thumbnail, Rank.pdfDocument, and Style.beltConfig?
// Tells us how big these are and whether they're already URLs or still base64.
//
// Usage: node scripts/probe-rank-images.js "postgres://..."
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

function fmt(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function kind(s) {
  if (!s) return "(empty)";
  if (s.startsWith("data:")) return "base64 data URI";
  if (s.startsWith("http")) return "URL";
  if (s.length > 200) return "long string";
  return "short string";
}

async function main() {
  console.log("=".repeat(72));
  console.log("Rank images + curriculum PDFs probe");
  console.log("=".repeat(72));

  const ranks = await p.rank.findMany({
    select: { id: true, name: true, thumbnail: true, pdfDocument: true, style: { select: { name: true } } },
  });

  let thumbTotal = 0, pdfTotal = 0, thumbCount = 0, pdfCount = 0;
  let thumbUrlCount = 0, pdfUrlCount = 0, thumbDataCount = 0, pdfDataCount = 0;

  console.log("\nRanks with thumbnail or pdfDocument:");
  for (const r of ranks) {
    const tSize = (r.thumbnail || "").length;
    const pSize = (r.pdfDocument || "").length;
    if (tSize) thumbCount++;
    if (pSize) pdfCount++;
    thumbTotal += tSize;
    pdfTotal += pSize;

    if (r.thumbnail) {
      if (r.thumbnail.startsWith("data:")) thumbDataCount++;
      else if (r.thumbnail.startsWith("http")) thumbUrlCount++;
    }
    if (r.pdfDocument) {
      if (r.pdfDocument.startsWith("data:")) pdfDataCount++;
      else if (r.pdfDocument.startsWith("http")) pdfUrlCount++;
    }

    if (tSize > 10000 || pSize > 10000) {
      const label = `  ${(r.style?.name || "?").padEnd(24)} ${r.name.padEnd(20)}`;
      console.log(`${label} thumb: ${fmt(tSize).padStart(8)} (${kind(r.thumbnail)})   pdf: ${fmt(pSize).padStart(8)} (${kind(r.pdfDocument)})`);
    }
  }

  console.log(`\nTotals across ${ranks.length} ranks:`);
  console.log(`  thumbnails:   ${thumbCount} ranks have one, total ${fmt(thumbTotal)}   (data URI: ${thumbDataCount}, URL: ${thumbUrlCount})`);
  console.log(`  pdfDocument:  ${pdfCount} ranks have one, total ${fmt(pdfTotal)}   (data URI: ${pdfDataCount}, URL: ${pdfUrlCount})`);

  // Also check Style.beltConfig — that JSON sometimes embeds belt images
  const styles = await p.style.findMany({ select: { id: true, name: true, beltConfig: true } });
  let beltConfigTotal = 0;
  let beltConfigWithImages = 0;
  for (const s of styles) {
    const size = (s.beltConfig || "").length;
    beltConfigTotal += size;
    if (s.beltConfig && /"data:image/.test(s.beltConfig)) beltConfigWithImages++;
  }
  console.log(`\nStyle.beltConfig (${styles.length} styles):`);
  console.log(`  total: ${fmt(beltConfigTotal)}   styles with embedded images: ${beltConfigWithImages}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
