import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// Per-tenant Settings lookup. The original getSetting() used
// findFirst({ where: { key } }) with no clientId, so "test
// connection" would validate whatever tenant's Stripe secret key
// it happened to find first -- a config leak that also served as
// an enumeration primitive.
async function getSetting(key: string, tenantId: string): Promise<string | null> {
  const row = await prisma.settings.findUnique({
    where: { key_clientId: { key, clientId: tenantId } },
  });
  return row?.value ?? null;
}

export async function POST(req: Request) {
  const tenantId = await getClientId(req);
  const { processor } = await req.json();

  if (!processor || !["stripe", "paypal", "square"].includes(processor)) {
    return NextResponse.json({ ok: false, message: "Invalid processor" }, { status: 400 });
  }

  try {
    if (processor === "stripe") {
      const secretKey = await getSetting("payment_stripe_secret_key", tenantId);
      if (!secretKey) {
        return NextResponse.json({ ok: false, message: "Secret key not configured" });
      }
      // Dynamic import to avoid issues if stripe package isn't installed
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(secretKey, { typescript: true });
      // Lightweight call to validate the key
      await stripe.balance.retrieve();
      return NextResponse.json({ ok: true, message: "Connected successfully" });
    }

    if (processor === "paypal") {
      const clientId = await getSetting("payment_paypal_client_id", tenantId);
      const clientSecret = await getSetting("payment_paypal_client_secret", tenantId);
      const sandbox = (await getSetting("payment_paypal_sandbox", tenantId)) === "true";
      if (!clientId || !clientSecret) {
        return NextResponse.json({ ok: false, message: "Client ID and Secret required" });
      }
      const baseUrl = sandbox
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";
      const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (authRes.ok) {
        return NextResponse.json({ ok: true, message: "Connected successfully" });
      } else {
        const err = await authRes.json().catch(() => ({}));
        return NextResponse.json({ ok: false, message: err.error_description || "Invalid credentials" });
      }
    }

    if (processor === "square") {
      const accessToken = await getSetting("payment_square_access_token", tenantId);
      const sandbox = (await getSetting("payment_square_sandbox", tenantId)) === "true";
      if (!accessToken) {
        return NextResponse.json({ ok: false, message: "Access token not configured" });
      }
      const baseUrl = sandbox
        ? "https://connect.squareupsandbox.com"
        : "https://connect.squareup.com";
      const locRes = await fetch(`${baseUrl}/v2/locations`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Square-Version": "2024-01-18",
          "Content-Type": "application/json",
        },
      });
      if (locRes.ok) {
        return NextResponse.json({ ok: true, message: "Connected successfully" });
      } else {
        const err = await locRes.json().catch(() => ({}));
        const msg = err.errors?.[0]?.detail || "Invalid credentials";
        return NextResponse.json({ ok: false, message: msg });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ ok: false, message });
  }

  return NextResponse.json({ ok: false, message: "Unknown error" });
}
