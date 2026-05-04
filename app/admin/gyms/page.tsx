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

export default function ManageGymsPage() {
  const [clients, setClients] = useState<GymClient[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newMaxMembers, setNewMaxMembers] = useState("10");
  const [newMaxStyles, setNewMaxStyles] = useState("3");
  const [newTrialMonths, setNewTrialMonths] = useState("3");
  const [creating, setCreating] = useState(false);

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMaxMembers, setEditMaxMembers] = useState("");
  const [editMaxStyles, setEditMaxStyles] = useState("");
  const [editTrialExpires, setEditTrialExpires] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadClients() {
    try {
      const res = await fetch("/api/admin/clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadClients(); }, []);

  async function handleCreate() {
    if (!newName || !newEmail || !newPassword) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          adminEmail: newEmail,
          adminPassword: newPassword,
          adminName: newAdminName || "Owner",
          maxMembers: parseInt(newMaxMembers) || 10,
          maxStyles: parseInt(newMaxStyles) || 3,
          trialMonths: parseInt(newTrialMonths) || 3,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(""); setNewEmail(""); setNewPassword(""); setNewAdminName("");
        setNewMaxMembers("10"); setNewMaxStyles("3"); setNewTrialMonths("3");
        loadClients();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to create gym");
      }
    } catch {
      alert("Failed to create gym");
    } finally {
      setCreating(false);
    }
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
        loadClients();
      }
    } catch {
      alert("Failed to update");
    } finally {
      setSaving(false);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manage Gyms</h1>
            <p className="text-sm text-gray-500">Create and manage trial gym accounts</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            {showCreate ? "Cancel" : "Create Gym"}
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-sm font-bold mb-4">New Gym Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Gym Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Iron Dragon MMA" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Admin Name</label>
                <input value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="Owner name" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Admin Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="owner@gym.com" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Admin Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Initial password" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Members</label>
                <input type="number" value={newMaxMembers} onChange={e => setNewMaxMembers(e.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Styles</label>
                <input type="number" value={newMaxStyles} onChange={e => setNewMaxStyles(e.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Trial Duration (months)</label>
                <input type="number" value={newTrialMonths} onChange={e => setNewTrialMonths(e.target.value)} min="1" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleCreate} disabled={creating || !newName || !newEmail || !newPassword} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                {creating ? "Creating..." : "Create Gym"}
              </button>
            </div>
          </div>
        )}

        {/* Gym List */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-gray-500">No gym accounts yet.</p>
        ) : (
          <div className="space-y-3">
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
                        <label className="block text-xs font-medium text-gray-700 mb-1">Trial Expires (leave empty for full plan)</label>
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
                        {client.slug}.dojostormsoftware.com &middot; {client._count.members} members &middot; {client._count.users} users
                        {client.trialExpiresAt && ` \u2022 Limits: ${client.maxMembers} members, ${client.maxStyles} styles`}
                      </p>
                      <p className="text-xs text-gray-400">Created {formatDate(client.createdAt)}</p>
                    </div>
                    <button onClick={() => openEdit(client)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
