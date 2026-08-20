# Staging environment setup

A second full deployment at `staging.dojostormsoftware.com` that runs
against its own database and its own set of API keys. Push to the
`staging` git branch → auto-deploys to staging. Push to `main` → prod.

**Everything below is one-time setup**, split into what you do in
each vendor's dashboard. The code side (middleware routing, auto-
billing gate, email safety net) is already in the repo -- these
knobs are what turn it on.

## 1. Neon: branch the database

1. Neon Console → your project → **Branches** → **Create branch**.
2. Name: `staging`. Parent: `main` (or whatever your prod branch
   is). Point-in-time: latest.
3. Once created, open the `staging` branch and copy both:
   - **Pooled connection string** → this becomes `DATABASE_URL`
   - **Direct (unpooled) connection string** → `DIRECT_URL`
4. Neon's copy-on-write means it costs almost nothing until you
   diverge, and you can recreate the branch any time you want a
   fresh snapshot of prod data.

## 2. Git: create the staging branch

```
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```

## 3. Vercel: deployment + env vars

### Deployment settings

Vercel → your project → **Settings** → **Git**:
- Confirm production branch = `main`.
- Under **Deploy Hooks / Ignored Build Step**, no changes needed --
  by default every push to any branch builds a Preview. `staging`
  is our named preview branch.

### Environment variables

Vercel → **Settings** → **Environment Variables**. For each var
listed below, add it and pick the environment where it applies.
Vercel's UI lets you scope a variable to **Production**, **Preview**,
**Development**, or specific git branches. Use "Preview → Branch:
staging" for the staging-only vars.

**Set for staging (Preview, branch = staging):**

| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon pooled URL from step 1 | The staging branch, NOT prod. |
| `DIRECT_URL` | Neon direct URL from step 1 | Used by `prisma migrate deploy` in the build. |
| `IS_STAGING` | `1` | Turns on the runtime guards (auto-billing off, email safety net, "STAGING" subject prefix). |
| `EMAIL_SANDBOX_TO` | your own address | STRONGLY RECOMMENDED. When set, ALL outbound emails on staging are rerouted here instead of the intended recipient. Since staging data is a copy of prod, real member email addresses live there. |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe test-mode key. Do NOT reuse `sk_live_...`. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from a NEW webhook endpoint (see below) | Test-mode webhook secret, not the prod one. |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Optional, only if client-side Stripe.js gets added. |
| `RESEND_API_KEY` | either prod key or a Resend test key | Safer to use a Resend "test" API key if you have one; if not, the EMAIL_SANDBOX_TO above is your seatbelt. |
| `CRON_SECRET` | a **different** random string from prod | So prod's cron secret can't accidentally trigger staging (or vice versa). |
| `JWT_SECRET` | a **different** random string from prod | Prod session cookies won't validate on staging, which is what you want. |

**Leave alone (inherit from prod / not needed on staging):**
- `NEXT_PUBLIC_APP_URL` -- override to `https://staging.dojostormsoftware.com` if any code path reads it.
- `MARKETING_CONTACT_TO` / `MARKETING_CONTACT_FROM` -- leave unset, staging's contact form still works.

## 4. DNS: point staging.dojostormsoftware.com at Vercel

Vercel → **Settings** → **Domains** → **Add**.

- Domain: `staging.dojostormsoftware.com`
- Assign to: git branch `staging` (Vercel will prompt "which branch
  should serve this domain?").
- Vercel will show a DNS record to add. Since your DNS is managed in
  Vercel's account-level Domains, add the CNAME/ALIAS there --
  usually a `CNAME` from `staging` to `cname.vercel-dns.com`.
- SSL cert provisions automatically once DNS resolves (a few
  minutes to an hour).

## 5. Stripe: separate webhook endpoint for staging

Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**.

- URL: `https://staging.dojostormsoftware.com/api/webhooks/stripe`
- Events: same list as the prod endpoint (see
  [stripe-platform-setup.md](stripe-platform-setup.md) for the 7
  events).
- Copy the resulting `whsec_...` → paste into
  `STRIPE_WEBHOOK_SECRET` env var scoped to the staging branch.

## 6. Push staging and verify

```
git push origin staging
```

Once Vercel finishes the build:

1. Visit `https://staging.dojostormsoftware.com/login`. You should
   see the login page branded like THE PIT (since the DB is a clone
   of prod), served from the staging build.
2. Log in with the OWNER account. The data you see is a snapshot of
   prod as of when you branched the Neon DB in step 1.
3. Trigger a real notification (e.g. Send Portal Access on any
   member). Check that:
   - The subject starts with `[STAGING → …]` (or `[STAGING]` if
     you didn't set `EMAIL_SANDBOX_TO`).
   - The email lands in your inbox at `EMAIL_SANDBOX_TO`, NOT the
     member's real address.
4. Hit `/api/billing/auto-run` from the dashboard. Response should
   be `{ "skipped": true, "reason": "Auto-billing is disabled on the
   staging deployment." }`.

If any of the above misbehaves, DO NOT push to `main` until you
know why. Roll back the offending config and try again.

## Day-to-day workflow

```
git checkout -b feat/new-thing         # branch off staging or main
# ...make changes, commit...
git push -u origin feat/new-thing      # gets its own Vercel preview URL against staging DB
# Merge to staging when ready to test on staging.dojostormsoftware.com
git checkout staging && git pull
git merge feat/new-thing
git push origin staging                # auto-deploys to staging.*
# After you're satisfied on staging:
git checkout main && git pull
git merge staging
git push origin main                   # auto-deploys to prod
```

### Refreshing staging data

Prod diverges from the Neon branch over time. To reset staging back
to a fresh copy of prod:

1. Neon Console → **Branches** → `staging` → **Delete**.
2. Recreate `staging` from `main` (same as step 1 above).
3. Update `DATABASE_URL` / `DIRECT_URL` in Vercel (the connection
   strings change with each branch recreate).
4. Redeploy staging (`git commit --allow-empty -m "refresh staging"
   && git push origin staging`).

## Kill switches in code

Anywhere `isStaging()` returns true, we treat the environment as
copy-of-real-user-data-that-must-not-leak. Current gates:

- `/api/billing/auto-run`: hard-stop, returns 200 with `skipped:
  true`. Both the cron caller and the dashboard "Charge Now" button
  are blocked.
- `lib/email.ts` `sendEmail()`: prefix subject with `[STAGING]`, and
  if `EMAIL_SANDBOX_TO` is set, redirect the recipient list to it.

If you need to add a new gate (e.g. skipping outbound webhooks to a
third party), import `isStaging` from `@/lib/env` and branch on it.
Don't `process.env.IS_STAGING` inline -- the helper handles the
"1 vs true vs unset" string parsing consistently.
