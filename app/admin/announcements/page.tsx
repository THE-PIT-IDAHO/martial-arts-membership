"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type Announcement = { id: string; title: string; content: string; type: string; isActive: boolean; createdAt: string };

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("info");
  const [saving, setSaving] = useState(false);

  async function load() {
    try { const res = await fetch("/api/admin/announcements"); if (res.ok) { const d = await res.json(); setItems(d.announcements || []); } } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content, type }) });
      if (res.ok) { setShowCreate(false); setTitle(""); setContent(""); setType("info"); load(); }
    } catch { alert("Failed"); } finally { setSaving(false); }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch("/api/admin/announcements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isActive: !isActive }) });
    load();
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this announcement?")) return;
    await fetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
    load();
  }

  const typeColors: Record<string, string> = { info: "bg-blue-100 text-blue-700", warning: "bg-yellow-100 text-yellow-700", success: "bg-green-100 text-green-700", urgent: "bg-red-100 text-red-700" };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Announcements</h1>
            <p className="text-sm text-gray-500">Send platform-wide messages to all gym owners</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">
            {showCreate ? "Cancel" : "New Announcement"}
          </button>
        </div>

        {showCreate && (
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Type</label>
                <select value={type} onChange={e => setType(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Content</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="Announcement message..." className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={handleCreate} disabled={saving || !title || !content} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                {saving ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        )}

        {loading ? <p className="text-sm text-gray-500">Loading...</p> : items.length === 0 ? <p className="text-sm text-gray-500">No announcements yet.</p> : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className={`rounded-lg border bg-white p-4 ${!item.isActive ? "opacity-50" : "border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeColors[item.type] || typeColors.info}`}>{item.type}</span>
                      {!item.isActive && <span className="text-[10px] text-gray-400">Hidden</span>}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{item.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => toggleActive(item.id, item.isActive)} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">
                      {item.isActive ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
