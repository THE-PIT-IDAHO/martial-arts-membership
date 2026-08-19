"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type Snapshot = {
  clientId: string;
  clientName: string;
  currentTierId: string | null;
  currentTierName: string | null;
  currentTierPriceCents: number | null;
  billingPeriod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionCancelAt: string | null;
  trialExpiresAt: string | null;
  isOnTrial: boolean;
  isTrialExpired: boolean;
};

type Tier = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingPeriod: string;
  maxMembers: number;
  maxStyles: number;
  maxUsers: number;
  maxLocations: number;
  maxReports: number;
  maxPOSItems: number;
  allowStripe: boolean;
  allowPaypal: boolean;
  allowSquare: boolean;
  inviteOnly: boolean;
  stripePriceId: string | null;
};

/** Marker on the Enterprise tier -- shows a "Talk to sales" secondary
 *  link alongside the primary Subscribe button. Matched by name-prefix
 *  so any tier the operator names "Enterprise ..." picks this up. */
function isEnterpriseTier(name: string): boolean {
  return /^enterprise/i.test(name);
}

export default function SubscriptionPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [stripeConfigured, setStripeConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingTierId, setPendingTierId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription/status");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed to load (HTTP ${res.status})`);
      }
      const data = await res.json();
      setSnapshot(data.snapshot);
      setTiers(data.tiers || []);
      setStripeConfigured(!!data.stripeConfigured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Bounce-back from Stripe Checkout carries ?success=1 or ?canceled=1.
    // We surface a flash message and strip the query so a refresh
    // doesn't re-show it.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("success")) {
        setFlash("Subscription updated. It may take a moment to reflect above.");
        url.searchParams.delete("success");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
      } else if (url.searchParams.get("canceled")) {
        setFlash("Checkout canceled -- nothing changed.");
        url.searchParams.delete("canceled");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, []);

  async function startCheckout(tierId: string) {
    setPendingTierId(tierId);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setPendingTierId(null);
    }
  }

  async function changeTier(tierId: string) {
    if (!confirm("Switch to this tier now? Any price difference is prorated on your next invoice.")) return;
    setPendingTierId(tierId);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tier change failed");
      await load();
      setFlash("Tier updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tier change failed");
    } finally {
      setPendingTierId(null);
    }
  }

  async function openPortal() {
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Portal failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal failed");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscription</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your Dojo Storm plan. Card processing, invoices, and cancellations are all managed here.
          </p>
        </div>

        {flash && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            {flash}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {!stripeConfigured && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>Stripe is not configured for this environment yet.</strong> Add
            <code className="mx-1 px-1 bg-white/60 rounded">STRIPE_SECRET_KEY</code>
            and
            <code className="mx-1 px-1 bg-white/60 rounded">STRIPE_WEBHOOK_SECRET</code>
            in Vercel &rarr; Settings &rarr; Environment Variables. The plans below will not be
            subscribable until then.
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <>
            <CurrentPlanCard snapshot={snapshot} onOpenPortal={openPortal} />

            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                Available plans
              </h2>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}
              >
                {tiers.map((t) => (
                  <TierCard
                    key={t.id}
                    tier={t}
                    snapshot={snapshot}
                    stripeConfigured={stripeConfigured}
                    pending={pendingTierId === t.id}
                    onSubscribe={() => startCheckout(t.id)}
                    onChange={() => changeTier(t.id)}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs text-gray-400">
                Tier price changes take effect at the start of your next billing period, except
                when you switch tiers -- switches are prorated immediately.
              </p>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// Current plan card
// ---------------------------------------------------------------------------

function CurrentPlanCard({
  snapshot,
  onOpenPortal,
}: {
  snapshot: Snapshot | null;
  onOpenPortal: () => void;
}) {
  if (!snapshot) return null;
  const status = snapshot.subscriptionStatus;
  const hasLiveSub =
    !!snapshot.stripeSubscriptionId &&
    ["active", "trialing", "past_due"].includes(status || "");
  const cancelAt = snapshot.subscriptionCancelAt ? new Date(snapshot.subscriptionCancelAt) : null;
  const periodEnd = snapshot.subscriptionCurrentPeriodEnd
    ? new Date(snapshot.subscriptionCurrentPeriodEnd)
    : null;
  const trialEnd = snapshot.trialExpiresAt ? new Date(snapshot.trialExpiresAt) : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Current plan
          </div>
          <div className="mt-1 text-xl font-bold text-gray-900">
            {snapshot.currentTierName || "No plan"}
          </div>
          {snapshot.currentTierPriceCents !== null && snapshot.currentTierPriceCents > 0 ? (
            <div className="mt-0.5 text-sm text-gray-600">
              ${(snapshot.currentTierPriceCents / 100).toFixed(2)}
              /{shortPeriod(snapshot.billingPeriod)}
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-gray-600">Free</div>
          )}
        </div>
        <div className="text-right">
          <StatusBadge snapshot={snapshot} />
          {hasLiveSub && (
            <button
              onClick={onOpenPortal}
              className="mt-3 inline-block rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Manage subscription
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
        {snapshot.isOnTrial && trialEnd && (
          <div>
            <span className="text-gray-500">Trial ends:</span>{" "}
            <span className="font-semibold text-gray-800">{trialEnd.toLocaleDateString()}</span>
          </div>
        )}
        {snapshot.isTrialExpired && !hasLiveSub && (
          <div className="sm:col-span-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
            Your trial ended. Pick a plan below to keep using the software.
          </div>
        )}
        {hasLiveSub && periodEnd && !cancelAt && (
          <div>
            <span className="text-gray-500">Renews on:</span>{" "}
            <span className="font-semibold text-gray-800">{periodEnd.toLocaleDateString()}</span>
          </div>
        )}
        {cancelAt && (
          <div className="sm:col-span-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
            Scheduled to cancel on{" "}
            <span className="font-semibold">{cancelAt.toLocaleDateString()}</span>. Access
            continues until then.
          </div>
        )}
        {status === "past_due" && (
          <div className="sm:col-span-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-800">
            Last payment failed. Open "Manage subscription" to update your card.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot.subscriptionStatus;
  let label: string;
  let cls: string;
  if (snapshot.isOnTrial) {
    label = "Free trial";
    cls = "bg-blue-100 text-blue-800";
  } else if (snapshot.isTrialExpired && !snapshot.stripeSubscriptionId) {
    label = "Trial expired";
    cls = "bg-amber-100 text-amber-800";
  } else if (s === "active") {
    label = "Active";
    cls = "bg-green-100 text-green-800";
  } else if (s === "trialing") {
    label = "Trial";
    cls = "bg-blue-100 text-blue-800";
  } else if (s === "past_due") {
    label = "Past due";
    cls = "bg-red-100 text-red-800";
  } else if (s === "canceled") {
    label = "Canceled";
    cls = "bg-gray-200 text-gray-700";
  } else if (s === "incomplete" || s === "incomplete_expired") {
    label = "Incomplete";
    cls = "bg-amber-100 text-amber-800";
  } else if (!snapshot.stripeSubscriptionId) {
    label = "No plan";
    cls = "bg-gray-200 text-gray-700";
  } else {
    label = s || "Unknown";
    cls = "bg-gray-200 text-gray-700";
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tier card
// ---------------------------------------------------------------------------

function TierCard({
  tier,
  snapshot,
  stripeConfigured,
  pending,
  onSubscribe,
  onChange,
}: {
  tier: Tier;
  snapshot: Snapshot | null;
  stripeConfigured: boolean;
  pending: boolean;
  onSubscribe: () => void;
  onChange: () => void;
}) {
  const isCurrent = snapshot?.currentTierId === tier.id;
  const hasLiveSub =
    snapshot?.stripeSubscriptionId &&
    ["active", "trialing", "past_due"].includes(snapshot.subscriptionStatus || "");
  const isFree = tier.priceCents <= 0;
  const isEnterprise = isEnterpriseTier(tier.name);
  const notSyncedYet = !tier.stripePriceId && !isFree;

  // Button rendering:
  //  - Free tier: no button (nothing to charge; if you're already on a
  //    free tier it just says "Current", otherwise the operator moves
  //    you manually via /admin/pricing).
  //  - Enterprise: primary "Subscribe" (if synced) + secondary "Talk to
  //    sales" link. Both are useful; user picks the path.
  //  - Paid non-current: "Subscribe" (first-time) OR "Switch" (has live sub).
  const buttonLabel = (() => {
    if (isCurrent) return "Current plan";
    if (isFree) return null;
    if (notSyncedYet) return "Not synced to Stripe yet";
    return hasLiveSub ? "Switch to this plan" : "Subscribe";
  })();
  const disabled = !stripeConfigured || notSyncedYet || pending || isCurrent;
  const onClick = hasLiveSub ? onChange : onSubscribe;

  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col ${
        isCurrent
          ? "border-primary border-2 bg-primary/[0.03]"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-lg font-bold text-gray-900">{tier.name}</h3>
        {isCurrent && (
          <span className="inline-block rounded-full bg-primary text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            Current
          </span>
        )}
        {tier.inviteOnly && !isCurrent && (
          <span className="inline-block rounded-full bg-gray-200 text-gray-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            Invite only
          </span>
        )}
      </div>
      {tier.description && (
        <p className="text-xs text-gray-500 mb-3">{tier.description}</p>
      )}
      <div className="text-3xl font-bold text-gray-900 mb-4">
        {isFree ? "Free" : `$${(tier.priceCents / 100).toFixed(0)}`}
        {!isFree && (
          <span className="ml-1 text-sm font-normal text-gray-500">
            /{shortPeriod(tier.billingPeriod)}
          </span>
        )}
      </div>
      <ul className="space-y-1.5 text-sm text-gray-700 flex-1 mb-4">
        {tierBullets(tier).map((b) => (
          <li key={b} className="flex items-start gap-2">
            <svg
              className="w-4 h-4 mt-0.5 text-primary shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {buttonLabel ? (
        <button
          onClick={onClick}
          disabled={disabled}
          className={`w-full rounded-md py-2 text-sm font-semibold ${
            isCurrent
              ? "bg-gray-100 text-gray-500 cursor-default"
              : "bg-primary text-white hover:bg-primaryDark disabled:opacity-50"
          }`}
        >
          {pending ? "Working…" : buttonLabel}
        </button>
      ) : (
        <div className="w-full rounded-md py-2 text-center text-sm text-gray-400">
          {isCurrent ? "Current plan" : "Contact us to switch"}
        </div>
      )}
      {isEnterprise && !isCurrent && (
        <a
          href="https://dojostormsoftware.com/#contact"
          className="mt-2 block text-center text-xs text-gray-500 hover:text-primary underline"
        >
          Or talk to sales for custom terms
        </a>
      )}
    </div>
  );
}

function tierBullets(t: Tier): string[] {
  const bullets: string[] = [];
  bullets.push(
    t.maxMembers >= 999 ? "Unlimited members" : `Up to ${t.maxMembers.toLocaleString()} members`,
  );
  if (t.maxStyles > 0)
    bullets.push(t.maxStyles >= 999 ? "Unlimited styles" : `${t.maxStyles} style${t.maxStyles === 1 ? "" : "s"}`);
  if (t.maxUsers > 0)
    bullets.push(t.maxUsers >= 999 ? "Unlimited admin users" : `${t.maxUsers} admin user${t.maxUsers === 1 ? "" : "s"}`);
  if (t.maxLocations > 1) bullets.push(`${t.maxLocations} locations`);
  if (t.maxReports > 0)
    bullets.push(`${t.maxReports >= 999 ? "Unlimited" : t.maxReports} custom reports`);
  if (t.maxPOSItems > 0)
    bullets.push(`${t.maxPOSItems >= 999 ? "Unlimited" : t.maxPOSItems} POS items`);
  const processors = [t.allowStripe && "Stripe", t.allowPaypal && "PayPal", t.allowSquare && "Square"].filter(Boolean);
  if (processors.length) bullets.push(`Card processing: ${processors.join(" · ")}`);
  return bullets;
}

function shortPeriod(period: string | null): string {
  const p = (period || "").toLowerCase();
  if (p === "monthly") return "mo";
  if (p === "yearly" || p === "annual" || p === "annually") return "yr";
  if (p === "weekly") return "wk";
  return period || "mo";
}
