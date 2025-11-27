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
};

export default function StylesPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStyles() {
      try {
        setLoading(true);
        const res = await fetch("/api/styles");

        if (!res.ok) {
          throw new Error("Failed to load styles");
        }

        const data = await res.json();
        setStyles(data.styles || []);
      } catch (err: any) {
        console.error("Error loading styles:", err);
        setError(err.message || "Failed to load styles");
      } finally {
        setLoading(false);
      }
    }

    loadStyles();
  }, []);

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Martial Arts Styles</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your martial arts styles and belt systems
            </p>
          </div>
          <Link
            href="/styles/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark"
          >
            + New Style
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
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
                  className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark"
                >
                  + Create First Style
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {styles.map((style) => (
                  <div
                    key={style.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
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
                          Belt System
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
                          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Edit Style
                        </Link>
                        <button
                          onClick={() => handleDeleteStyle(style.id, style.name)}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                      {style.beltSystemEnabled && (
                        <Link
                          href={`/styles/belt-designer?styleId=${style.id}&styleName=${encodeURIComponent(
                            style.name
                          )}`}
                          className="rounded-md bg-primary px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Belt Ranks & Designer
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
    </AppLayout>
  );
}
