import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get("admin_session");
  const hasSecret = !!process.env.JWT_SECRET;
  const secretLength = process.env.JWT_SECRET?.length || 0;
  const secretFirst4 = process.env.JWT_SECRET?.slice(0, 4) || "NONE";

  if (!cookie?.value) {
    return NextResponse.json({ error: "No admin_session cookie found", hasSecret, secretLength, secretFirst4 });
  }

  const token = cookie.value;
  const parts = token.split(".");
  if (parts.length !== 2) {
    return NextResponse.json({ error: "Token format invalid", partsCount: parts.length, hasSecret, secretLength, secretFirst4 });
  }

  const [encoded, sig] = parts;

  // Try to decode payload
  let payload: unknown = null;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(atob(padded));
  } catch (e) {
    return NextResponse.json({ error: "Failed to decode payload", encoded: encoded.slice(0, 20), hasSecret, secretLength, secretFirst4 });
  }

  // Try to verify signature
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(process.env.JWT_SECRET!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(encoded));
    const expectedSig = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const sigMatch = expectedSig === sig;

    return NextResponse.json({
      hasSecret,
      secretLength,
      secretFirst4,
      sigMatch,
      expectedSigFirst10: expectedSig.slice(0, 10),
      actualSigFirst10: sig.slice(0, 10),
      payload,
      tokenLength: token.length,
    });
  } catch (e) {
    return NextResponse.json({ error: "Signature verification crashed", message: String(e), hasSecret, secretLength, secretFirst4 });
  }
}
