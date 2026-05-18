// Minimal TOTP (RFC 6238) + backup-code helpers using Node's built-in crypto.
// No external dependencies. Compatible with Google Authenticator / Authy /
// 1Password and any other standard TOTP app.

import { createHmac, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const STEP_SECONDS = 30;
const CODE_DIGITS = 6;
const SECRET_BYTES = 20; // 160 bits — the common standard for TOTP secrets

// --- Base32 (RFC 4648) ---------------------------------------------------
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const cleaned = s.replace(/=+$/, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// --- TOTP -----------------------------------------------------------------

/** Generate a fresh random base32 secret to store on a user. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Compute the 6-digit TOTP code for a given secret + time window. */
function totpCode(secretBase32: string, timeWindow: number): string {
  const key = base32Decode(secretBase32);
  const counter = Buffer.alloc(8);
  // Big-endian 64-bit counter. JS safe-int covers ~2^53, plenty for time/30.
  counter.writeBigUInt64BE(BigInt(timeWindow));
  // Cast to Uint8Array for compatibility with newer @types/node strictness.
  const hmac = createHmac("sha1", new Uint8Array(key)).update(new Uint8Array(counter)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = (binary % 10 ** CODE_DIGITS).toString().padStart(CODE_DIGITS, "0");
  return code;
}

/**
 * Verify a user-submitted code against the secret. Accepts the current 30-second
 * window plus ±1 window of drift (clock skew between server and phone).
 */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const cleaned = (code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const window = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    if (totpCode(secretBase32, window + offset) === cleaned) return true;
  }
  return false;
}

/**
 * Build the otpauth:// URL used by Google Authenticator-compatible apps.
 * `qrcode.toDataURL(otpauthUrl(...))` produces the QR image to render in the
 * setup UI.
 */
export function otpauthUrl(opts: { secret: string; label: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.label}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// --- Backup codes ---------------------------------------------------------

/**
 * Generate N single-use recovery codes. Returned in plain text so they can be
 * shown to the user once at setup; only the bcrypt-hashed forms should be
 * persisted via hashBackupCodes().
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 10 hex chars, formatted as XXXXX-XXXXX for readability
    const buf = randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${buf.slice(0, 5)}-${buf.slice(5, 10)}`);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c.replace(/-/g, "").toUpperCase(), 10)));
}

/**
 * Check a user-submitted backup code against the stored hash list.
 * Returns the index of the matching hash (so the caller can remove that one
 * entry — backup codes are single-use), or -1 if no match.
 */
export async function verifyBackupCode(submitted: string, hashedList: string[]): Promise<number> {
  const normalized = (submitted || "").replace(/[-\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{10}$/.test(normalized)) return -1;
  for (let i = 0; i < hashedList.length; i++) {
    if (await bcrypt.compare(normalized, hashedList[i])) return i;
  }
  return -1;
}
