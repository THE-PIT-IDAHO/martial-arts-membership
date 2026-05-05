"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type GymClient = {
  id: string;
  name: string;
  slug: string;
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
  priceCents: number;
  trialExpiresAt: string | null;
  createdAt: string;
  _count: { members: number; users: number };
};

type SignupLink = {
  id: string;
  token: string;
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
  priceCents: number;
  trialMonths: number;
  expiresAt: string | null;
  active: boolean;
  useCount: number;
  note: string | null;
  createdAt: string;
};

export default function ManageGymsPage() {
  const [clients, setClients] = useState<GymClient[]>([]);
  const [links, setLinks] = useState<SignupLink[]>([]);
  const [loading, setLoading] = useState(true);

  type PricingTier = { id: string; name: string; priceCents: number; maxMembers: number; maxStyles: number; maxRanksPerStyle: number; maxMembershipPlans: number; maxClasses: number; maxUsers: number; maxLocations: number; maxReports: number; maxPOSItems: number; allowStripe: boolean; allowPaypal: boolean; allowSquare: boolean };
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  // Create link form
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState("");
  const [linkTrialMonths, setLinkTrialMonths] = useState("");
  const [linkExpiresInDays, setLinkExpiresInDays] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<Record<string, string | boolean>>({});
  const [savingLink, setSavingLink] = useState(false);

  // Edit gym
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGym, setEditGym] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [clientsRes, linksRes, tiersRes] = await Promise.all([
        fetch("/api/admin/clients"),
        fetch("/api/admin/signup-links"),
        fetch("/api/admin/pricing"),
      ]);
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        setClients(data.clients || []);
      }
      if (linksRes.ok) {
        const data = await linksRes.json();
        setLinks(data.links || []);
      }
      if (tiersRes.ok) {
        const data = await tiersRes.json();
        setTiers(data.tiers || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreateLink() {
    if (!selectedTierId) { alert("Please select a pricing tier"); return; }
    const tier = tiers.find(t => t.id === selectedTierId);
    if (!tier) return;

    setCreatingLink(true);
    try {
      const res = await fetch("/api/admin/signup-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxMembers: tier.maxMembers,
          maxStyles: tier.maxStyles,
          maxRanksPerStyle: tier.maxRanksPerStyle,
          maxMembershipPlans: tier.maxMembershipPlans,
          maxClasses: tier.maxClasses,
          maxUsers: tier.maxUsers,
          maxLocations: tier.maxLocations,
          maxReports: tier.maxReports,
          maxPOSItems: tier.maxPOSItems,
          allowStripe: tier.allowStripe,
          allowPaypal: tier.allowPaypal,
          allowSquare: tier.allowSquare,
          priceCents: tier.priceCents,
          trialMonths: linkTrialMonths,
          expiresInDays: linkExpiresInDays ? parseInt(linkExpiresInDays) : null,
          note: linkNote || tier.name,
        }),
      });
      if (res.ok) {
        setShowCreateLink(false);
        setSelectedTierId(""); setLinkTrialMonths(""); setLinkExpiresInDays(""); setLinkNote("");
        loadData();
      }
    } catch {
      alert("Failed to create link");
    } finally {
      setCreatingLink(false);
    }
  }

  function openEditLink(link: SignupLink) {
    setEditingLinkId(link.id);
    setEditLink({
      maxMembers: String(link.maxMembers),
      maxStyles: String(link.maxStyles),
      maxRanksPerStyle: String(link.maxRanksPerStyle),
      maxMembershipPlans: String(link.maxMembershipPlans),
      maxClasses: String(link.maxClasses),
      maxUsers: String(link.maxUsers),
      maxLocations: String(link.maxLocations),
      maxReports: String(link.maxReports),
      maxPOSItems: String(link.maxPOSItems),
      allowStripe: link.allowStripe,
      allowPaypal: link.allowPaypal,
      allowSquare: link.allowSquare,
      priceCents: link.priceCents > 0 ? String(link.priceCents) : "",
      trialMonths: link.trialMonths > 0 ? String(link.trialMonths) : "",
      note: link.note || "",
    });
  }

  async function handleSaveLink() {
    if (!editingLinkId) return;
    setSavingLink(true);
    try {
      const res = await fetch("/api/admin/signup-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingLinkId, ...editLink }),
      });
      if (res.ok) {
        setEditingLinkId(null);
        loadData();
      }
    } catch {
      alert("Failed to update link");
    } finally {
      setSavingLink(false);
    }
  }

  async function deleteLink(id: string) {
    if (!confirm("Delete this signup link?")) return;
    await fetch(`/api/admin/signup-links?id=${id}`, { method: "DELETE" });
    loadData();
  }

  function copyLink(token: string, id: string) {
    const url = `https://app.dojostormsoftware.com/signup?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  }

  function openEdit(client: GymClient) {
    setEditingId(client.id);
    setEditGym({
      maxMembers: String(client.maxMembers),
      maxStyles: String(client.maxStyles),
      maxRanksPerStyle: String(client.maxRanksPerStyle),
      maxMembershipPlans: String(client.maxMembershipPlans),
      maxClasses: String(client.maxClasses),
      maxUsers: String(client.maxUsers),
      maxLocations: String(client.maxLocations),
      maxReports: String(client.maxReports),
      maxPOSItems: String(client.maxPOSItems),
      allowStripe: client.allowStripe,
      allowPaypal: client.allowPaypal,
      allowSquare: client.allowSquare,
      priceCents: client.priceCents > 0 ? String(client.priceCents) : "",
      trialExpiresAt: client.trialExpiresAt ? client.trialExpiresAt.split("T")[0] : "",
    });
  }

  async function handleSave() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: editingId,
          ...editGym,
          removeTrial: !editGym.trialExpiresAt,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        loadData();
      }
    } catch {
      alert("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGym(clientId: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"? This will permanently delete all their data including members, classes, and settings.`)) return;
    try {
      const res = await fetch(`/api/admin/clients?id=${clientId}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete");
      }
    } catch {
      alert("Failed to delete");
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function trialBadge(client: GymClient) {
    if (!client.trialExpiresAt) return <span className="text-xs text-green-600 font-semibold">Full Plan</span>;
    const expires = new Date(client.trialExpiresAt);
    const now = new Date();
    if (now > expires) return <span className="text-xs text-red-600 font-semibold">Expired</span>;
    const days = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return <span className="text-xs text-yellow-600 font-semibold">{days}d left</span>;
    return <span className="text-xs text-blue-600 font-semibold">{days}d left</span>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Manage Gyms</h1>
          <p className="text-sm text-gray-500">Create signup links and manage trial gym accounts</p>
        </div>

        {/* Signup Links Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Signup Links</h2>
            <button
              onClick={() => setShowCreateLink(!showCreateLink)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              {showCreateLink ? "Cancel" : "Create Link"}
            </button>
          </div>

          {/* Create Link Form */}
          {showCreateLink && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Pricing Tier</label>
                  <select value={selectedTierId} onChange={e => setSelectedTierId(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select a tier...</option>
                    {tiers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.priceCents > 0 ? `$${(t.priceCents / 100).toFixed(2)}/mo` : "Free"} ({t.maxMembers >= 999999 ? "Unlimited" : t.maxMembers} members)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Trial (weeks, blank = no expiration)</label>
                  <input type="number" value={linkTrialMonths} onChange={e => setLinkTrialMonths(e.target.value)} placeholder="No expiration" min="0" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Link Expires (days, blank = never)</label>
                  <input type="number" value={linkExpiresInDays} onChange={e => setLinkExpiresInDays(e.target.value)} placeholder="Never" min="1" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Note (for your reference)</label>
                  <input type="text" value={linkNote} onChange={e => setLinkNote(e.target.value)} placeholder="e.g., Facebook promo, gym conference" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleCreateLink} disabled={creatingLink || !selectedTierId} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                  {creatingLink ? "Creating..." : "Create Signup Link"}
                </button>
              </div>
            </div>
          )}

          {/* Links List */}
          {links.length === 0 ? (
            <p className="text-sm text-gray-500">No signup links yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {links.map(link => {
                const expired = link.expiresAt && new Date() > new Date(link.expiresAt);

                if (editingLinkId === link.id) {
                  const e = editLink;
                  const setE = (key: string, val: string | boolean) => setEditLink(prev => ({ ...prev, [key]: val }));
                  return (
                    <div key={link.id} className="rounded-lg border border-primary bg-white p-5">
                      <h3 className="text-sm font-bold text-gray-800 mb-3">Limits</h3>
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                        {[
                          { label: "Members", key: "maxMembers" },
                          { label: "Styles", key: "maxStyles" },
                          { label: "Ranks/Style", key: "maxRanksPerStyle" },
                          { label: "Membership Plans", key: "maxMembershipPlans" },
                          { label: "Class Types", key: "maxClasses" },
                          { label: "Staff Accounts", key: "maxUsers" },
                          { label: "Locations", key: "maxLocations" },
                          { label: "Custom Reports", key: "maxReports" },
                          { label: "POS Items", key: "maxPOSItems" },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-[11px] font-medium text-gray-600 mb-1">{f.label}</label>
                            <input type="number" value={e[f.key] as string || ""} onChange={ev => setE(f.key, ev.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        ))}
                      </div>
                      <h3 className="text-sm font-bold text-gray-800 mt-4 mb-3">Payment Processors</h3>
                      <div className="flex flex-wrap gap-4">
                        {[
                          { label: "Stripe", key: "allowStripe" },
                          { label: "PayPal", key: "allowPaypal" },
                          { label: "Square", key: "allowSquare" },
                        ].map(p => (
                          <label key={p.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={!!e[p.key]} onChange={ev => setE(p.key, ev.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600" />
                            {p.label}
                          </label>
                        ))}
                      </div>
                      <h3 className="text-sm font-bold text-gray-800 mt-4 mb-3">Pricing & Duration</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 mb-1">Price ($/month)</label>
                          <input type="number" value={e.priceCents as string || ""} onChange={ev => setE("priceCents", ev.target.value)} placeholder="Free" min="0" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 mb-1">Trial (weeks)</label>
                          <input type="number" value={e.trialMonths as string || ""} onChange={ev => setE("trialMonths", ev.target.value)} placeholder="No expiration" min="0" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 mb-1">&nbsp;</label>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Note</label>
                        <input type="text" value={e.note as string || ""} onChange={ev => setE("note", ev.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={handleSaveLink} disabled={savingLink} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                          {savingLink ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => setEditingLinkId(null)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  );
                }

                // Find matching tier name
                const tierName = tiers.find(t =>
                  t.maxMembers === link.maxMembers && t.maxStyles === link.maxStyles && t.priceCents === link.priceCents
                )?.name || link.note || "Custom";

                return (
                  <div key={link.id} className={`rounded-lg border bg-white p-4 ${!link.active || expired ? "border-gray-100 opacity-60" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">{tierName}</span>
                          <span className="text-xs text-gray-500">
                            {link.priceCents > 0 ? `$${(link.priceCents / 100).toFixed(2)}/mo` : "Free"}
                          </span>
                          {link.trialMonths > 0 && <span className="text-xs text-blue-600 font-semibold">{link.trialMonths}wk trial</span>}
                          {!link.active && <span className="text-xs text-red-500 font-semibold">Disabled</span>}
                          {expired && <span className="text-xs text-red-500 font-semibold">Link Expired</span>}
                          <span className="text-xs text-gray-400">{link.useCount} signups</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {link.maxMembers >= 999999 ? "Unlimited" : link.maxMembers} members &middot; {link.maxStyles >= 999999 ? "Unlimited" : link.maxStyles} styles &middot; {link.maxClasses >= 999999 ? "Unlimited" : link.maxClasses} class types
                          {` \u2022 Created ${formatDate(link.createdAt)}`}
                          {link.expiresAt && ` \u2022 Expires ${formatDate(link.expiresAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => copyLink(link.token, link.id)}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          {copiedLinkId === link.id ? "Copied!" : "Copy Link"}
                        </button>
                        <button
                          onClick={() => openEditLink(link)}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteLink(link.id)}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Existing Gyms Section */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Active Gyms</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-gray-500">No gym accounts yet.</p>
          ) : (
            <div className="space-y-2">
              {clients.map(client => (
                <div key={client.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  {editingId === client.id ? (
                    <div>
                      <h3 className="text-sm font-bold mb-3">{client.name}</h3>
                      <h4 className="text-sm font-bold text-gray-800 mb-3">Limits</h4>
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                        {[
                          { label: "Members", key: "maxMembers" },
                          { label: "Styles", key: "maxStyles" },
                          { label: "Ranks/Style", key: "maxRanksPerStyle" },
                          { label: "Membership Plans", key: "maxMembershipPlans" },
                          { label: "Class Types", key: "maxClasses" },
                          { label: "Staff Accounts", key: "maxUsers" },
                          { label: "Locations", key: "maxLocations" },
                          { label: "Custom Reports", key: "maxReports" },
                          { label: "POS Items", key: "maxPOSItems" },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-[11px] font-medium text-gray-600 mb-1">{f.label}</label>
                            <input type="number" value={editGym[f.key] as string || ""} onChange={ev => setEditGym(prev => ({ ...prev, [f.key]: ev.target.value }))} min="1" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        ))}
                      </div>
                      <h4 className="text-sm font-bold text-gray-800 mt-4 mb-3">Payment Processors</h4>
                      <div className="flex flex-wrap gap-4">
                        {[
                          { label: "Stripe", key: "allowStripe" },
                          { label: "PayPal", key: "allowPaypal" },
                          { label: "Square", key: "allowSquare" },
                        ].map(p => (
                          <label key={p.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={!!editGym[p.key]} onChange={ev => setEditGym(prev => ({ ...prev, [p.key]: ev.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600" />
                            {p.label}
                          </label>
                        ))}
                      </div>
                      <h4 className="text-sm font-bold text-gray-800 mt-4 mb-3">Pricing & Duration</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 mb-1">Price ($/month, blank = free)</label>
                          <input type="number" value={editGym.priceCents as string || ""} onChange={ev => setEditGym(prev => ({ ...prev, priceCents: ev.target.value }))} placeholder="Free" min="0" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 mb-1">Trial Expires (blank = full plan)</label>
                          <input type="date" value={editGym.trialExpiresAt as string || ""} onChange={ev => setEditGym(prev => ({ ...prev, trialExpiresAt: ev.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gray-900">{client.name}</h3>
                          {trialBadge(client)}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <a href={`https://${client.slug}.dojostormsoftware.com/login`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{client.slug}.dojostormsoftware.com</a>
                          {` \u00b7 ${client._count.members} members \u00b7 ${client._count.users} users`}
                          {client.trialExpiresAt && ` \u2022 Limits: ${client.maxMembers} members, ${client.maxStyles} styles`}
                        </p>
                        <p className="text-xs text-gray-400">Created {formatDate(client.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(client)} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">
                          Edit
                        </button>
                        <button onClick={() => deleteGym(client.id, client.name)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
