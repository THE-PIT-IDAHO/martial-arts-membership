# Stripe setup — platform subscription billing

This guides one-time Stripe configuration for **platform billing** —
charging gym owners for their Dojo Storm subscription tier. This is
separate from any future tenant-side member billing.

## What you need from Stripe

1. A Stripe account. Use test mode for local dev; go live in Vercel
   production once you're satisfied it works.
2. Three keys:
   - **Secret key** — `sk_test_...` (test) or `sk_live_...` (live)
   - **Publishable key** — `pk_test_...` / `pk_live_...` (optional
     server-side, useful if you later want a client-side Stripe.js
     component)
   - **Webhook signing secret** — `whsec_...` (created per webhook
     endpoint you add)

## Environment variables

Set these in Vercel → Project → Settings → Environment Variables
(for both Preview and Production, mode-appropriate keys):

| Var                        | Required | Purpose                                       |
| -------------------------- | -------- | --------------------------------------------- |
| `STRIPE_SECRET_KEY`        | Yes      | Server-side Stripe API access.                |
| `STRIPE_WEBHOOK_SECRET`    | Yes      | Validates incoming webhook signatures.        |
| `STRIPE_PUBLISHABLE_KEY`   | No       | Optional; only if you add client-side Stripe. |
| `STRIPE_PLATFORM_METADATA` | No       | Tag stamped on every platform Product /       |
|                            |          | Customer / Subscription. Defaults to          |
|                            |          | `dojostorm-platform`. Only change this if     |
|                            |          | you want a different filter tag in reports.   |

For local development, put the test-mode versions in `.env`. **Never**
commit real keys.

## Configure the Customer Portal (one-time)

In Stripe Dashboard → **Settings** → **Billing** → **Customer Portal**:

1. Toggle **Activate**.
2. Under **Functionality**, enable:
   - **Customers can update payment method**
   - **Customers can cancel subscriptions** — set cancellation to
     "at end of billing period" (matches our UI wording).
   - **Customers can view invoice history**
3. Add a return URL — leave the default; the code overrides it per
   session to point back at `/settings/subscription`.
4. Save.

If you skip this, `/api/billing/subscription/portal` returns an error
telling you to do it.

## Configure the webhook

In Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**:

- **Endpoint URL**:
  `https://app.dojostormsoftware.com/api/webhooks/stripe`
  (add another for local test with `stripe listen --forward-to`
  once you're testing checkout end-to-end)
- **Events to send** (minimum):
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.deleted`
- Save. Copy the **Signing secret** (`whsec_...`) into
  `STRIPE_WEBHOOK_SECRET` in Vercel.

## Push tier prices to Stripe

Once the keys are in place:

1. Sign in as the platform-admin OWNER.
2. Open `/admin/pricing`.
3. Click **Sync to Stripe** in the top-right.

Each **paid** tier gets a matching Stripe Product + Price created. Free
tiers (Founder, Free Testing) are skipped — nothing to charge.

Re-run the sync any time you edit tier names, descriptions, prices, or
billing periods. Price changes create a **new** Stripe Price (Stripe
Prices are immutable) and archive the old one; existing subscribers
stay on their old price until they switch tiers.

## Everyday billing flow

1. Gym owner opens **Subscription** from the user avatar menu (or via
   `/settings/subscription`).
2. On first subscribe: they click a tier → Stripe Checkout → pay →
   webhook writes their subscription back onto the `Client` row.
3. Later tier changes: they click a different tier → we call
   `subscription.update()` with proration; Stripe charges/credits the
   difference on the next invoice.
4. Card updates, cancellations, invoice downloads: **Manage
   subscription** button on the same page → Stripe Customer Portal.

## Test-mode smoke test (before going live)

1. In test mode, `STRIPE_SECRET_KEY=sk_test_...`.
2. Sync tiers.
3. As a test gym OWNER, visit `/settings/subscription`.
4. Subscribe with card **4242 4242 4242 4242** / any future date /
   any CVC / any ZIP. Should redirect back with a green flash.
5. Check the `Client` row: `stripeCustomerId`, `stripeSubscriptionId`,
   `subscriptionStatus`, `subscriptionCurrentPeriodEnd`, and
   `currentTierId` should all be populated.
6. Try **Switch to this plan** for a different tier — should update
   immediately with a proration.
7. Try **Manage subscription** → Cancel → status flips to
   canceled-at-period-end, banner appears in the UI.
