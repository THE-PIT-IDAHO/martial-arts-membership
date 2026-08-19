"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type Tier = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingPeriod: string;
  maxMembers: number;
  maxStyles: number;
  maxRanksPerStyle: number;
  maxMembershipPlans: number;
  maxClasses: number;
  maxUsers: number;
  maxLocations: number;
  maxReports: number;
  maxPOSItems: number;
  allowStripe: boolean;
  allowPaypal: boolean;
  allowSquare: boolean;
  founderOnly: boolean;
  inviteOnly: boolean;
  isActive: boolean;
  sortOrder: number;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
};

type SyncResult = {
  tierId: string;
  name: string;
  action: "created" | "updated" | "unchanged" | "skipped" | "error";
  detail: string;
  error?: string;
};

export default function PricingTiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function loadTiers() {
    try {
      const res = await fetch("/api/admin/pricing");
      if (res.ok) { const data = await res.json(); setTiers(data.tiers || []); }
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { loadTiers(); }, []);

  function resetForm() {
    setForm({
      // priceDollars is the UI value ("50" or "50.00"); it gets
      // converted to cents right before the API call. Storing the
      // dollar amount instead of the cent count means the input
      // can render as a familiar $50.00 in the form.
      name: "", description: "", priceDollars: "", billingPeriod: "monthly",
      maxMembers: "10", maxStyles: "3", maxRanksPerStyle: "10", maxMembershipPlans: "3",
      maxClasses: "5", maxUsers: "2", maxLocations: "1", maxReports: "3", maxPOSItems: "10",
      allowStripe: false, allowPaypal: false, allowSquare: false,
      founderOnly: false, inviteOnly: false,
    });
  }

  function openCreate() { resetForm(); setEditingId(null); setShowCreate(true); }

  function openEdit(tier: Tier) {
    setForm({
      name: tier.name, description: tier.description || "",
      priceDollars: tier.priceCents > 0 ? (tier.priceCents / 100).toFixed(2) : "",
      billingPeriod: tier.billingPeriod,
      maxMembers: tier.maxMembers >= 999999 ? "" : String(tier.maxMembers),
      maxStyles: tier.maxStyles >= 999999 ? "" : String(tier.maxStyles),
      maxRanksPerStyle: tier.maxRanksPerStyle >= 999999 ? "" : String(tier.maxRanksPerStyle),
      maxMembershipPlans: tier.maxMembershipPlans >= 999999 ? "" : String(tier.maxMembershipPlans),
      maxClasses: tier.maxClasses >= 999999 ? "" : String(tier.maxClasses),
      maxUsers: tier.maxUsers >= 999999 ? "" : String(tier.maxUsers),
      maxLocations: tier.maxLocations >= 999999 ? "" : String(tier.maxLocations),
      maxReports: tier.maxReports >= 999999 ? "" : String(tier.maxReports),
      maxPOSItems: tier.maxPOSItems >= 999999 ? "" : String(tier.maxPOSItems),
      allowStripe: tier.allowStripe, allowPaypal: tier.allowPaypal, allowSquare: tier.allowSquare,
      founderOnly: tier.founderOnly, inviteOnly: tier.inviteOnly,
    });
    setEditingId(tier.id);
    setShowCreate(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const method = editingId ? "PATCH" : "POST";
      // Convert priceDollars (UI) to priceCents (API contract).
      // Blank / non-numeric input becomes 0 = free tier. Rounded
      // to the nearest cent so 12.995 -> 1300 doesn't drift.
      const { priceDollars: pd, ...rest } = form as Record<string, unknown>;
      const dollars = parseFloat(String(pd ?? ""));
      const priceCents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;
      const payload = { ...rest, priceCents };
      const body = editingId ? { id: editingId, ...payload } : payload;
      const res = await fetch("/api/admin/pricing", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) { setShowCreate(false); setEditingId(null); loadTiers(); }
    } catch { alert("Failed to save"); } finally { setSaving(false); }
  }

  async function deleteTier(id: string) {
    if (!confirm("Delete this pricing tier?")) return;
    await fetch(`/api/admin/pricing?id=${id}`, { method: "DELETE" });
    loadTiers();
  }

  async function syncToStripe() {
    if (!confirm("Sync all paid tiers to Stripe? This creates or updates a Product + Price for each active paid tier.")) return;
    setSyncing(true);
    setSyncError(null);
    setSyncResults(null);
    try {
      const res = await fetch("/api/admin/tiers/sync-stripe", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncResults(data.results || []);
      loadTiers();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const setF = (key: string, val: string | boolean) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pricing Tiers</h1>
            <p className="text-sm text-gray-500">Define plans that can be used when creating signup links</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Push tier prices to Stripe. Only paid tiers get synced;
                free tiers (Founder / Free Testing) are no-ops. */}
            <button
              onClick={syncToStripe}
              disabled={syncing}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Create / refresh Stripe Products + Prices for every paid tier"
            >
              {syncing ? "Syncing…" : "Sync to Stripe"}
            </button>
            <button onClick={openCreate} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">
              Create Tier
            </button>
          </div>
        </div>

        {syncError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {syncError}
          </div>
        )}
        {syncResults && (
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <h3 className="text-xs font-bold text-gray-800 mb-2">Stripe sync results</h3>
            <ul className="space-y-1 text-xs">
              {syncResults.map((r) => (
                <li key={r.tierId} className="flex items-start gap-2">
                  <span
                    className={
                      r.action === "error"
                        ? "text-red-600 font-semibold w-20 shrink-0"
                        : r.action === "skipped"
                          ? "text-gray-400 w-20 shrink-0"
                          : r.action === "unchanged"
                            ? "text-gray-500 w-20 shrink-0"
                            : "text-green-700 font-semibold w-20 shrink-0"
                    }
                  >
                    {r.action}
                  </span>
                  <span className="font-semibold text-gray-800">{r.name}</span>
                  <span className="text-gray-500">— {r.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showCreate && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-bold mb-4">{editingId ? "Edit Tier" : "New Pricing Tier"}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Tier Name</label>
                <input type="text" value={form.name as string || ""} onChange={e => setF("name", e.target.value)} placeholder="e.g., Basic, Pro, Enterprise" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">
                  Price /{(form.billingPeriod as string) === "yearly" ? "year" : "month"}
                </label>
                <div className="flex items-center rounded-md border border-gray-300 focus-within:ring-2 focus-within:ring-primary overflow-hidden">
                  <span className="px-2 py-1.5 text-sm text-gray-500 bg-gray-50 border-r border-gray-300">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.priceDollars as string || ""}
                    onChange={e => setF("priceDollars", e.target.value)}
                    placeholder="0.00"
                    className="flex-1 px-2 py-1.5 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Billing Period</label>
                <select value={form.billingPeriod as string || "monthly"} onChange={e => setF("billingPeriod", e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={form.description as string || ""} onChange={e => setF("description", e.target.value)} placeholder="Short description of this tier" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Limits</h3>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-4">
              {[
                { label: "Members", key: "maxMembers" }, { label: "Styles", key: "maxStyles" },
                { label: "Ranks/Style", key: "maxRanksPerStyle" }, { label: "Membership Plans", key: "maxMembershipPlans" },
                { label: "Class Types", key: "maxClasses" }, { label: "Staff", key: "maxUsers" },
                { label: "Locations", key: "maxLocations" }, { label: "Custom Reports", key: "maxReports" },
                { label: "POS Items", key: "maxPOSItems" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">{f.label}</label>
                  <input type="number" value={form[f.key] as string || ""} onChange={e => setF(f.key, e.target.value)} min="1" placeholder="Unlimited" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
            </div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Payment Processors</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              {[
                { label: "Stripe", key: "allowStripe" }, { label: "PayPal", key: "allowPaypal" }, { label: "Square", key: "allowSquare" },
              ].map(p => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!form[p.key]} onChange={e => setF(p.key, e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600" />
                  {p.label}
                </label>
              ))}
            </div>
            {/* Visibility gates. Founder-only pins the tier to the
                platform-admin gym; invite-only hides it from
                everyone unless a signup link explicitly grants it. */}
            <h3 className="text-sm font-bold text-gray-800 mb-3">Visibility</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={!!form.founderOnly} onChange={e => setF("founderOnly", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600" />
                Founder only <span className="text-xs text-gray-400">(software owner)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={!!form.inviteOnly} onChange={e => setF("inviteOnly", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600" />
                Invite only <span className="text-xs text-gray-400">(signup link required)</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={handleSave} disabled={saving || !form.name} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Save" : "Create Tier"}
              </button>
              <button onClick={() => { setShowCreate(false); setEditingId(null); }} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-gray-500">No pricing tiers yet. Create your first tier to get started.</p>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            {tiers.map(tier => (
              <div key={tier.id} className={`rounded-lg border bg-white p-5 ${tier.isActive ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{tier.name}</h3>
                  {!tier.isActive && <span className="text-xs text-red-500 font-semibold">Inactive</span>}
                </div>
                <p className="text-2xl font-bold text-primary mb-1">
                  {tier.priceCents > 0 ? `$${(tier.priceCents / 100).toFixed(2)}` : "Free"}
                  {tier.priceCents > 0 && <span className="text-sm font-normal text-gray-500">/{tier.billingPeriod === "yearly" ? "yr" : "mo"}</span>}
                </p>
                {tier.description && <p className="text-xs text-gray-500 mb-3">{tier.description}</p>}
                <div className="space-y-1 text-xs text-gray-600 mb-4">
                  {(() => {
                    const u = (v: number) => v >= 999999 ? "Unlimited" : String(v);
                    return (<>
                      <p>{u(tier.maxMembers)} members &middot; {u(tier.maxStyles)} styles &middot; {u(tier.maxClasses)} class types</p>
                      <p>{u(tier.maxUsers)} staff &middot; {u(tier.maxLocations)} locations &middot; {u(tier.maxReports)} custom reports</p>
                      <p>{u(tier.maxRanksPerStyle)} ranks/style &middot; {u(tier.maxPOSItems)} POS items</p>
                    </>);
                  })()}
                  {(tier.allowStripe || tier.allowPaypal || tier.allowSquare) && (
                    <p className="text-primary font-semibold">
                      {[tier.allowStripe && "Stripe", tier.allowPaypal && "PayPal", tier.allowSquare && "Square"].filter(Boolean).join(" + ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(tier)} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Edit</button>
                  <button onClick={() => deleteTier(tier.id)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
