// Server-side helpers to push binary content (member photos, rank PDFs, etc.)
// to Vercel Blob. Storing these in Postgres was making backups huge and list
// endpoints slow; Blob keeps them on a CDN with stable public URLs.
import { put } from "@vercel/blob";
import sharp from "sharp";

const PHOTO_TARGET_WIDTH = 400;
const PHOTO_JPEG_QUALITY = 82;

export type PhotoSource =
  | { kind: "buffer"; buffer: Buffer }
  | { kind: "dataUri"; dataUri: string };

function dataUriToBuffer(dataUri: string): Buffer {
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx < 0) throw new Error("Not a data URI");
  return Buffer.from(dataUri.slice(commaIdx + 1), "base64");
}

/**
 * Resize a member photo (any phone-camera input) down to ~400px, strip EXIF,
 * re-encode as JPEG and store on Vercel Blob. Returns the public URL.
 */
export async function resizeAndUploadPhoto(
  source: PhotoSource,
  opts: { memberId: string; clientId: string },
): Promise<{ url: string; bytes: number }> {
  const input =
    source.kind === "buffer" ? source.buffer : dataUriToBuffer(source.dataUri);

  const resized = await sharp(input)
    .rotate()
    .resize({ width: PHOTO_TARGET_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: PHOTO_JPEG_QUALITY })
    .toBuffer();

  const pathname = `members/${opts.clientId}/${opts.memberId}-${Date.now()}.jpg`;

  const blob = await put(pathname, resized, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });

  return { url: blob.url, bytes: resized.length };
}

/**
 * Store a curriculum PDF on Vercel Blob. Source can be a base64 data URI
 * (what the client-side jsPDF generator returns) or a raw Buffer. Returns
 * the public URL — that's what should be saved in `Rank.pdfDocument`.
 */
export async function uploadRankPdf(
  source: { kind: "buffer"; buffer: Buffer } | { kind: "dataUri"; dataUri: string },
  opts: { rankId: string; clientId: string },
): Promise<{ url: string; bytes: number }> {
  const buffer =
    source.kind === "buffer" ? source.buffer : dataUriToBuffer(source.dataUri);

  const pathname = `ranks/${opts.clientId}/${opts.rankId}-${Date.now()}.pdf`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });

  return { url: blob.url, bytes: buffer.length };
}
