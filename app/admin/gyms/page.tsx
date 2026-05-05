"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type GymClient = {
  id: string;
  name: string;
  slug: string;
  maxMembers: number;
  maxStyles: number;
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

  // Create link form
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [linkMaxMembers, setLinkMaxMembers] = useState("10");
  const [linkMaxStyles, setLinkMaxStyles] = useState("3");
  const [linkMaxRanksPerStyle, setLinkMaxRanksPerStyle] = useState("10");
  const [linkMaxMembershipPlans, setLinkMaxMembershipPlans] = useState("3");
  const [linkMaxClasses, setLinkMaxClasses] = useState("5");
  const [linkMaxUsers, setLinkMaxUsers] = useState("2");
  const [linkMaxLocations, setLinkMaxLocations] = useState("1");
  const [linkMaxReports, setLinkMaxReports] = useState("3");
  const [linkMaxPOSItems, setLinkMaxPOSItems] = useState("10");
  const [linkAllowStripe, setLinkAllowStripe] = useState(false);
  const [linkAllowPaypal, setLinkAllowPaypal] = useState(false);
  const [linkAllowSquare, setLinkAllowSquare] = useState(false);
  const [linkPriceCents, setLinkPriceCents] = useState("");
  const [linkTrialMonths, setLinkTrialMonths] = useState("");
  const [linkExpiresInDays, setLinkExpiresInDays] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Edit gym
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMaxMembers, setEditMaxMembers] = useState("");
  const [editMaxStyles, setEditMaxStyles] = useState("");
  const [editTrialExpires, setEditTrialExpires] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [clientsRes, linksRes] = await Promise.all([
        fetch("/api/admin/clients"),
        fetch("/api/admin/signup-links"),
      ]);
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        setClients(data.clients || []);
      }
      if (linksRes.ok) {
        const data = await linksRes.json();
        setLinks(data.links || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleCreateLink() {
    setCreatingLink(true);
    try {
      const res = await fetch("/api/admin/signup-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxMembers: linkMaxMembers,
          maxStyles: linkMaxStyles,
          maxRanksPerStyle: linkMaxRanksPerStyle,
          maxMembershipPlans: linkMaxMembershipPlans,
          maxClasses: linkMaxClasses,
          maxUsers: linkMaxUsers,
          maxLocations: linkMaxLocations,
          maxReports: linkMaxReports,
          maxPOSItems: linkMaxPOSItems,
          allowStripe: linkAllowStripe,
          allowPaypal: linkAllowPaypal,
          allowSquare: linkAllowSquare,
          priceCents: linkPriceCents,
          trialMonths: linkTrialMonths,
          expiresInDays: linkExpiresInDays ? parseInt(linkExpiresInDays) : null,
          note: linkNote,
        }),
      });
      if (res.ok) {
        setShowCreateLink(false);
        setLinkMaxMembers("10"); setLinkMaxStyles("3"); setLinkMaxRanksPerStyle("10");
        setLinkMaxMembershipPlans("3"); setLinkMaxClasses("5"); setLinkMaxUsers("2");
        setLinkMaxLocations("1"); setLinkMaxReports("3"); setLinkMaxPOSItems("10");
        setLinkAllowStripe(false); setLinkAllowPaypal(false); setLinkAllowSquare(false);
        setLinkPriceCents(""); setLinkTrialMonths(""); setLinkExpiresInDays(""); setLinkNote("");
        loadData();
      }
    } catch {
      alert("Failed to create link");
    } finally {
      setCreatingLink(false);
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
    setEditMaxMembers(String(client.maxMembers));
    setEditMaxStyles(String(client.maxStyles));
    setEditTrialExpires(client.trialExpiresAt ? client.trialExpiresAt.split("T")[0] : "");
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
          maxMembers: parseInt(editMaxMembers) || 10,
          maxStyles: parseInt(editMaxStyles) || 3,
          trialExpiresAt: editTrialExpires || null,
          removeTrial: !editTrialExpires,
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
    <AppLayout>
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
              <h3 className="text-sm font-bold text-gray-800 mb-3">Limits</h3>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  { label: "Members", value: linkMaxMembers, set: setLinkMaxMembers },
                  { label: "Styles", value: linkMaxStyles, set: setLinkMaxStyles },
                  { label: "Ranks/Style", value: linkMaxRanksPerStyle, set: setLinkMaxRanksPerStyle },
                  { label: "Membership Plans", value: linkMaxMembershipPlans, set: setLinkMaxMembershipPlans },
                  { label: "Classes", value: linkMaxClasses, set: setLinkMaxClasses },
                  { label: "Staff Accounts", value: linkMaxUsers, set: setLinkMaxUsers },
                  { label: "Locations", value: linkMaxLocations, set: setLinkMaxLocations },
                  { label: "Reports", value: linkMaxReports, set: setLinkMaxReports },
                  { label: "POS Items", value: linkMaxPOSItems, set: setLinkMaxPOSItems },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">{f.label}</label>
                    <input type="number" value={f.value} onChange={e => f.set(e.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                ))}
              </div>
              <h3 className="text-sm font-bold text-gray-800 mt-4 mb-3">Payment Processors</h3>
              <div className="flex flex-wrap gap-4">
                {[
                  { label: "Stripe", value: linkAllowStripe, set: setLinkAllowStripe },
                  { label: "PayPal", value: linkAllowPaypal, set: setLinkAllowPaypal },
                  { label: "Square", value: linkAllowSquare, set: setLinkAllowSquare },
                ].map(p => (
                  <label key={p.label} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.value}
                      onChange={e => p.set(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                    />
                    {p.label}
                  </label>
                ))}
              </div>

              <h3 className="text-sm font-bold text-gray-800 mt-4 mb-3">Pricing & Duration</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Price ($/month, blank = free)</label>
                  <input type="number" value={linkPriceCents} onChange={e => setLinkPriceCents(e.target.value)} placeholder="Free" min="0" step="1" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Trial (weeks, blank = no expiration)</label>
                  <input type="number" value={linkTrialMonths} onChange={e => setLinkTrialMonths(e.target.value)} placeholder="No expiration" min="0" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Link Expires (days, blank = never)</label>
                  <input type="number" value={linkExpiresInDays} onChange={e => setLinkExpiresInDays(e.target.value)} placeholder="Never" min="1" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Note (for your reference)</label>
                <input type="text" value={linkNote} onChange={e => setLinkNote(e.target.value)} placeholder="e.g., Basic Trial, Premium Demo, Facebook promo" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleCreateLink} disabled={creatingLink} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
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
                return (
                  <div key={link.id} className={`rounded-lg border bg-white p-4 ${!link.active || expired ? "border-gray-100 opacity-60" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">
                            {link.maxMembers} members, {link.maxStyles} styles{link.trialMonths > 0 ? `, ${link.trialMonths}wk trial` : ""}{link.priceCents > 0 ? `, $${(link.priceCents / 100).toFixed(2)}/mo` : ", Free"}
                          </span>
                          {!link.active && <span className="text-xs text-red-500 font-semibold">Disabled</span>}
                          {expired && <span className="text-xs text-red-500 font-semibold">Link Expired</span>}
                          <span className="text-xs text-gray-400">{link.useCount} signups</span>
                        </div>
                        {link.note && <p className="text-xs text-gray-500 mt-0.5">{link.note}</p>}
                        <p className="text-xs text-gray-400">
                          Created {formatDate(link.createdAt)}
                          {link.expiresAt && ` \u2022 Link expires ${formatDate(link.expiresAt)}`}
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
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Max Members</label>
                          <input type="number" value={editMaxMembers} onChange={e => setEditMaxMembers(e.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Max Styles</label>
                          <input type="number" value={editMaxStyles} onChange={e => setEditMaxStyles(e.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Trial Expires (blank = full plan)</label>
                          <input type="date" value={editTrialExpires} onChange={e => setEditTrialExpires(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                          {saving ? "Saving..." : "Save"}
                        </button>
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
    </AppLayout>
  );
}
