// Storage helpers for SIGNED CONTRACT PDFs — the highest-security tier of
// our document storage because contracts contain signatures, member PII,
// and financial obligations.
//
// Design choices vs. how we store member photos / rank curriculum PDFs:
//   - Contracts go in a DEDICATED PRIVATE Blob store (different token).
//   - The stored URL is never exposed to the client browser.
//   - Reads go through a server proxy that re-checks tenant + ownership
//     on every request and fetches the bytes server-side using the token.
//   - Result: even if a DB dump leaked, the Blob URLs in it cannot be
//     used to download the PDFs without the private token.
import { put } from "@vercel/blob";

// Token is on a separate env var so it's only available in places that
// explicitly opt in (this file). Leaking the photos token wouldn't grant
// access to contracts and vice versa.
function getContractToken(): string {
  // Vercel names the token <PREFIX>_READ_WRITE_TOKEN when you set a custom
  // prefix on the Blob store (replacing "BLOB" rather than prepending).
  const token = process.env.CONTRACTS_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "CONTRACTS_READ_WRITE_TOKEN env var not set. " +
      "Create a private Blob store on Vercel and connect it with CONTRACTS as the env var prefix.",
    );
  }
  return token;
}

function base64ToBuffer(b64OrDataUri: string): Buffer {
  const commaIdx = b64OrDataUri.indexOf(",");
  if (commaIdx >= 0 && b64OrDataUri.startsWith("data:")) {
    return Buffer.from(b64OrDataUri.slice(commaIdx + 1), "base64");
  }
  return Buffer.from(b64OrDataUri, "base64");
}

/**
 * Upload a signed contract PDF to the private Blob store. Accepts either
 * a raw base64 string (no data: prefix) or a full data URI. Returns the
 * stored URL — save that in SignedContract.pdfData, replacing the old
 * base64 blob.
 */
export async function uploadContractPdf(
  source: { kind: "buffer"; buffer: Buffer } | { kind: "base64"; base64: string },
  opts: { contractId: string; clientId: string },
): Promise<{ url: string; bytes: number }> {
  const buffer =
    source.kind === "buffer" ? source.buffer : base64ToBuffer(source.base64);

  const pathname = `contracts/${opts.clientId}/${opts.contractId}-${Date.now()}.pdf`;

  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
    token: getContractToken(),
  });

  return { url: blob.url, bytes: buffer.length };
}

/**
 * Fetch a contract PDF from the private Blob store. Called only by the
 * server-side proxy route after auth + tenant + ownership checks pass.
 * Returns a Buffer the route can stream back to the browser.
 */
export async function fetchContractPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getContractToken()}` },
  });
  if (!res.ok) {
    throw new Error(`Contract Blob fetch failed: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
