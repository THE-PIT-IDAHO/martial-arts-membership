"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type Style = {
  id: string;
  name: string;
  shortName: string | null;
  description: string | null;
  beltSystemEnabled: boolean;
  ranks?: any[];
};

export default function StylesPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicateStyle, setDuplicateStyle] = useState<Style | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  async function loadStyles() {
    try {
      setLoading(true);
      const res = await fetch("/api/styles");
      if (!res.ok) throw new Error("Failed to load styles");
      const data = await res.json();
      setStyles(data.styles || []);
    } catch (err: any) {
      setError(err.message || "Failed to load styles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStyles(); }, []);

  async function handleDuplicate() {
    if (!duplicateStyle || !duplicateName.trim()) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/styles/${duplicateStyle.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: duplicateName.trim() }),
      });
      if (res.ok) {
        setDuplicateStyle(null);
        setDuplicateName("");
        await loadStyles();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to duplicate style");
      }
    } catch {
      alert("Failed to duplicate style");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDeleteStyle(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/styles/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete style");
      }

      // Remove from list
      setStyles((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error("Error deleting style:", err);
      alert(err.message || "Failed to delete style");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Styles</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your styles and rank systems
            </p>
          </div>
          <Link
            href="/styles/new"
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Create Style
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Loading styles...
          </div>
        )}

        {/* Styles List */}
        {!loading && (
          <>
            {styles.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  No styles yet. Create your first style to get started.
                </p>
                <Link
                  href="/styles/new"
                  className="mt-4 inline-block rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Create First Style
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4">
                {styles.map((style) => (
                  <div
                    key={style.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow w-full sm:flex-1 sm:min-w-[calc(50%-0.5rem)] sm:max-w-[calc(50%-0.5rem)] lg:min-w-[calc(33.333%-0.667rem)] lg:max-w-[calc(33.333%-0.667rem)] xl:min-w-[calc(25%-0.75rem)] xl:max-w-[calc(25%-0.75rem)]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {style.name}
                        </h3>
                        {style.shortName && (
                          <p className="text-xs text-gray-500">
                            ({style.shortName})
                          </p>
                        )}
                      </div>
                      {style.beltSystemEnabled && (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          Rank System
                        </span>
                      )}
                    </div>

                    {style.description && (
                      <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                        {style.description}
                      </p>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Link
                          href={`/styles/${style.id}`}
                          className="flex-1 rounded-md bg-primary px-3 py-1 text-center text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Edit Style
                        </Link>
                        <button
                          onClick={() => { setDuplicateStyle(style); setDuplicateName(""); }}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDeleteStyle(style.id, style.name)}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Delete
                        </button>
                      </div>
                      {style.beltSystemEnabled && (
                        <Link
                          href={`/styles/belt-designer?styleId=${style.id}&styleName=${encodeURIComponent(
                            style.name
                          )}`}
                          className="rounded-md bg-primary px-3 py-1 text-center text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Create/Edit Ranks
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Duplicate Style Modal */}
      {duplicateStyle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDuplicateStyle(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold">Duplicate Style</h2>
              <button onClick={() => setDuplicateStyle(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Duplicating <strong>{duplicateStyle.name}</strong>. The copy will have the same ranks and belt colors but no curriculum, PDFs, or test data.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">New Style Name</label>
              <input
                type="text"
                value={duplicateName}
                onChange={e => setDuplicateName(e.target.value)}
                placeholder="Enter a unique name..."
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={e => { if (e.key === "Enter" && duplicateName.trim()) handleDuplicate(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={handleDuplicate} disabled={duplicating || !duplicateName.trim()} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                {duplicating ? "Duplicating..." : "Duplicate"}
              </button>
              <button onClick={() => setDuplicateStyle(null)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
