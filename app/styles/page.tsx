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

  useEffect(() => {
    async function loadStyles() {
      try {
        setLoading(true);
        const res = await fetch("/api/styles");

        if (!res.ok) {
          throw new Error("Failed to load styles");
        }

        const data = await res.json();
        console.log("Fetched styles data:", data);
        console.log("Styles array:", data.styles);
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
    </AppLayout>
  );
}
