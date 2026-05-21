"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type Audience = "adult" | "guardian";

type Template = {
  id: string;
  name: string;
  slug: string | null;
  audience: Audience;
  type: string | null;
  isDefault: boolean;
  isActive: boolean;
  archivedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export default function WaiverTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAudience, setCreateAudience] = useState<Audience>("adult");
  const [createType, setCreateType] = useState("");
  const [creating, setCreating] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/waiver-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      } else {
        setError("Failed to load templates");
      }
    } catch (err) {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/waiver-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          audience: createAudience,
          type: createType.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreate(false);
        setCreateName("");
        setCreateAudience("adult");
        setCreateType("");
        // Take the user straight into the editor for the new template.
        window.location.href = `/waivers/templates/${data.template.id}`;
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to create template");
      }
    } catch (err) {
      setError("Failed to create template");
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/waiver-templates/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        await loadTemplates();
      } else {
        setError("Failed to duplicate template");
      }
    } catch (err) {
      setError("Failed to duplicate template");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}"? Existing signed waivers will keep their PDFs but will no longer link back to this template.`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/waiver-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadTemplates();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to delete template");
      }
    } catch (err) {
      setError("Failed to delete template");
    }
  }

  async function toggleActive(t: Template) {
    setTogglingId(t.id);
    try {
      const res = await fetch(`/api/waiver-templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      if (res.ok) {
        await loadTemplates();
      } else {
        setError("Failed to update template");
      }
    } catch (err) {
      setError("Failed to update template");
    } finally {
      setTogglingId(null);
    }
  }

  function shareUrl(slug: string | null) {
    if (!slug) return "";
    return `${window.location.origin}/waivers/sign/${slug}`;
  }

  function copyShare(slug: string | null) {
    if (!slug) return;
    navigator.clipboard.writeText(shareUrl(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1500);
  }

  const knownTypes = Array.from(
    new Set(templates.map((t) => t.type).filter((t): t is string => !!t)),
  ).sort();

  return (
    <AppLayout>
      <div className="px-4 py-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Waiver Templates</h1>
            <p className="text-sm text-gray-500">
              Create separate waivers for events, programs, or audiences. Each template has its own share link.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/waivers"
              className="rounded-md bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Back to Waivers
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
            >
              New Template
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading templates…</div>
        ) : templates.length === 0 ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-sm text-gray-500">
            No templates yet. Click <span className="font-semibold">New Template</span> to create your first one.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {templates.map((t) => (
              <div key={t.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">{t.name}</span>
                    {t.isDefault && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
                        Default
                      </span>
                    )}
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">
                      {t.audience === "guardian" ? "Guardian / Dependent" : "Adult"}
                    </span>
                    {t.type && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 bg-purple-50 rounded px-1.5 py-0.5">
                        {t.type}
                      </span>
                    )}
                    {!t.isActive && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                        Hidden
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono truncate">
                      {t.slug ? shareUrl(t.slug) : <em>no slug</em>}
                    </span>
                    {t.slug && (
                      <button
                        onClick={() => copyShare(t.slug)}
                        className="text-primary hover:underline"
                      >
                        {copiedSlug === t.slug ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={t.isActive}
                      onChange={() => toggleActive(t)}
                      disabled={togglingId === t.id}
                    />
                    Live
                  </label>
                  <Link
                    href={`/waivers/templates/${t.id}`}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDuplicate(t.id)}
                    className="rounded-md bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.name)}
                    className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-lg font-bold">New Waiver Template</h2>
              </div>
              <div className="px-4 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Summer Camp 2026"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Audience</label>
                  <select
                    value={createAudience}
                    onChange={(e) => setCreateAudience(e.target.value as Audience)}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    <option value="adult">Adult (single participant)</option>
                    <option value="guardian">Guardian / Dependent (parent + minor)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Type <span className="font-normal text-gray-400">(groups templates on the Waivers page)</span>
                  </label>
                  <input
                    type="text"
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                    placeholder="Gym, Event, Tournament…"
                    list="known-waiver-types-create"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                  <datalist id="known-waiver-types-create">
                    {knownTypes.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-md bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !createName.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create & Edit"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
