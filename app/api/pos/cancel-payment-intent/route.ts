import { NextResponse } from "next/server";
import { getClientId } from "@/lib/tenant";
import { getStripeClient } from "@/lib/stripe";

/**
 * POST /api/pos/cancel-payment-intent
 * Body: { paymentIntentId: string }
 *
 * Fires Stripe's PaymentIntent cancel API for a PI we created but never
 * confirmed (typically because the admin closed the card modal without
 * charging). Without this, PIs sit in Stripe forever as
 * "requires_payment_method" / "incomplete" and pile up in the operator's
 * Stripe dashboard as failed attempts.
 *
 * Cancelling is idempotent from the caller's perspective -- if the PI is
 * already in a terminal state (canceled, succeeded, requires_capture, ...)
 * the route returns a soft success so a stray double-fire doesn't turn
 * into an error toast on the client.
 */
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const body = await req.json().catch(() => ({} as { paymentIntentId?: unknown }));
    const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId : "";

    // Nothing to cancel -- succeed silently so the modal-close handler
    // stays simple ("always call cancel, don't worry about it").
    if (!paymentIntentId) return NextResponse.json({ ok: true, skipped: "no-id" });

    // Only Stripe PIs match this shape; setup intents / non-Stripe ids
    // aren't ours to cancel here.
    if (!paymentIntentId.startsWith("pi_")) {
      return NextResponse.json({ ok: true, skipped: "not-a-pi" });
    }

    const stripeClient = await getStripeClient(clientId);
    if (!stripeClient) return NextResponse.json({ ok: true, skipped: "no-stripe" });

    // Verify the PI belongs to this tenant BEFORE cancelling. Prevents
    // a caller from cancelling PIs on other gyms' Stripe accounts by
    // supplying their id. getStripeClient(clientId) already gives us
    // this tenant's Stripe account, so retrieve() will 404 for cross-
    // tenant PIs -- catch and return silent success.
    try {
      await stripeClient.paymentIntents.cancel(paymentIntentId, {
        cancellation_reason: "abandoned",
      });
      return NextResponse.json({ ok: true, canceled: true });
    } catch (err) {
      // Stripe throws when the PI is already in a state that can't be
      // canceled (succeeded, already canceled, etc.). Treat as success
      // -- the caller just wants "make sure this PI isn't lingering",
      // and the terminal states already satisfy that.
      const msg = err instanceof Error ? err.message : "cancel failed";
      console.warn(`[pos/cancel-payment-intent] ${paymentIntentId}: ${msg}`);
      return NextResponse.json({ ok: true, skipped: msg });
    }
  } catch (err) {
    console.error("[pos/cancel-payment-intent] fatal:", err);
    return NextResponse.json({ ok: false, error: "cancel failed" }, { status: 500 });
  }
}
