// One-shot migration: takes the legacy base64-encoded photoUrl values out of
// the Member table and replaces them with Vercel Blob URLs (resized to 400px
// jpgs). Run AFTER you've created the Blob store in Vercel and set
// BLOB_READ_WRITE_TOKEN locally (vercel env pull, or paste into .env).
//
// Usage:
//   DRY RUN:  node scripts/migrate-photos-to-blob.js
//   APPLY:    node scripts/migrate-photos-to-blob.js --apply
//   With a remote DB:
//             node scripts/migrate-photos-to-blob.js --apply "postgres://..."
const { PrismaClient } = require("@prisma/client");
const { put } = require("@vercel/blob");
const sharp = require("sharp");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const connStr = args.find((a) => !a.startsWith("--"));
const p = connStr
  ? new PrismaClient({ datasources: { db: { url: connStr } } })
  : new PrismaClient();

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function dataUriToBuffer(dataUri) {
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx < 0) throw new Error("Not a data URI");
  return Buffer.from(dataUri.slice(commaIdx + 1), "base64");
}

async function main() {
  console.log("=".repeat(64));
  console.log(apply ? "APPLY — uploading to Blob + updating DB" : "DRY RUN — no uploads, no DB writes");
  console.log("=".repeat(64));

  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("\nERROR: BLOB_READ_WRITE_TOKEN env var not set.");
    console.error("Set it from your Vercel project's Blob store (Storage → Blob → .env.local tab),");
    console.error("or run `vercel env pull .env.development.local` and source it.\n");
    process.exit(1);
  }

  const members = await p.member.findMany({
    select: { id: true, firstName: true, lastName: true, photoUrl: true, clientId: true },
  });

  let totalBefore = 0;
  let totalAfter = 0;
  let migrated = 0;
  let skippedAlreadyUrl = 0;
  let skippedNoPhoto = 0;
  let failed = 0;

  for (const m of members) {
    const name = `${m.firstName} ${m.lastName}`.padEnd(28);

    if (!m.photoUrl) {
      skippedNoPhoto++;
      continue;
    }

    // Already a URL? Skip — already migrated.
    if (!m.photoUrl.startsWith("data:")) {
      console.log(`  ${name} [skip] already a URL (${fmt(m.photoUrl.length)})`);
      skippedAlreadyUrl++;
      continue;
    }

    const beforeBytes = m.photoUrl.length;
    totalBefore += beforeBytes;

    let resized;
    try {
      const inputBuf = dataUriToBuffer(m.photoUrl);
      resized = await sharp(inputBuf)
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch (err) {
      console.log(`  ${name} [FAIL] resize: ${err.message}`);
      failed++;
      continue;
    }

    const afterBytes = resized.length;
    totalAfter += afterBytes;
    console.log(`  ${name} ${fmt(beforeBytes)} → ${fmt(afterBytes)}`);

    if (!apply) {
      migrated++;
      continue;
    }

    try {
      const pathname = `members/${m.clientId}/${m.id}-${Date.now()}.jpg`;
      const blob = await put(pathname, resized, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
      });
      await p.member.update({
        where: { id: m.id },
        data: { photoUrl: blob.url },
      });
      migrated++;
    } catch (err) {
      console.log(`  ${name} [FAIL] upload: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`Members checked:    ${members.length}`);
  console.log(`Migrated:           ${migrated}`);
  console.log(`Skipped (already URL): ${skippedAlreadyUrl}`);
  console.log(`Skipped (no photo):    ${skippedNoPhoto}`);
  console.log(`Failed:             ${failed}`);
  console.log(`Total photo bytes:  ${fmt(totalBefore)} → ${fmt(totalAfter)}  (saves ${fmt(totalBefore - totalAfter)})`);

  if (!apply) {
    console.log("\n(Re-run with --apply to commit. Requires BLOB_READ_WRITE_TOKEN.)");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
