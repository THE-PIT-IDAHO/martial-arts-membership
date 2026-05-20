// Server-side helper to resize a member photo and upload it to Vercel Blob.
//
// Photos are stored full-resolution by phones — a single iPhone photo is
// 3-4 MB at 4032×3024. Stored as base64 in Postgres, that's 5+ MB per row
// and was making /api/members ship 34 MB on a 15-member gym. So:
//   1) Resize to ~400px max (face is recognizable, ~50 KB jpg)
//   2) Store the image on Vercel Blob (CDN-cached, separate from the DB)
//   3) Save only the resulting URL in Member.photoUrl
//
// Used by both the admin photo-upload endpoint and the migration script.
import { put } from "@vercel/blob";
import sharp from "sharp";

const TARGET_WIDTH = 400;
const JPEG_QUALITY = 82;

export type PhotoSource =
  | { kind: "buffer"; buffer: Buffer }
  | { kind: "dataUri"; dataUri: string };

function dataUriToBuffer(dataUri: string): Buffer {
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx < 0) throw new Error("Not a data URI");
  return Buffer.from(dataUri.slice(commaIdx + 1), "base64");
}

export async function resizeAndUploadPhoto(
  source: PhotoSource,
  opts: { memberId: string; clientId: string },
): Promise<{ url: string; bytes: number }> {
  const input =
    source.kind === "buffer" ? source.buffer : dataUriToBuffer(source.dataUri);

  // Resize, strip metadata (EXIF can hold MB of data + privacy concerns),
  // re-encode as JPEG. .rotate() honors EXIF orientation BEFORE we strip it.
  const resized = await sharp(input)
    .rotate()
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  // Path includes clientId so different tenants stay separated in blob storage.
  // Suffix with timestamp so updates don't collide on the CDN cache.
  const pathname = `members/${opts.clientId}/${opts.memberId}-${Date.now()}.jpg`;

  const blob = await put(pathname, resized, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });

  return { url: blob.url, bytes: resized.length };
}
