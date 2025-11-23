"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import {
  BeltDesigner,
  BeltConfig,
  defaultBeltConfig,
} from "@/components/belt-designer";

type Style = {
  id: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  beltSystemEnabled?: boolean;
  beltConfig?: any;
};

type PageProps = {
  params: {
    id: string;
  };
};

export default function StyleEditPage({ params }: PageProps) {
  const router = useRouter();
  const { id } = params;

  const [style, setStyle] = useState<Style | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingBelt, setSavingBelt] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [beltSystemEnabled, setBeltSystemEnabled] = useState(false);

  const [beltConfig, setBeltConfig] = useState<BeltConfig>(defaultBeltConfig);

  useEffect(() => {
    async function fetchStyle() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/styles/${id}`);
        if (!res.ok) {
          throw new Error("Failed to load style");
        }

        const data = await res.json();
        const s: Style = data.style;

        setStyle(s);
        setName(s.name || "");
        setShortName(s.shortName || "");
        setDescription(s.description || "");
        setBeltSystemEnabled(!!s.beltSystemEnabled);

        if (s.beltConfig && typeof s.beltConfig === "object") {
          setBeltConfig({
            ...defaultBeltConfig,
            ...s.beltConfig,
          });
        } else {
          setBeltConfig(defaultBeltConfig);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load style");
      } finally {
        setLoading(false);
      }
    }

    fetchStyle();
  }, [id]);

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSavingInfo(true);
      setError(null);

      const res = await fetch(`/api/styles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shortName: shortName.trim() || null,
          description: description.trim() || null,
          beltSystemEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save style");
      }

      const data = await res.json();
      setStyle(data.style);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save style");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleSaveBelt() {
    if (!style) return;

    try {
      setSavingBelt(true);
      setError(null);

      const res = await fetch(`/api/styles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beltConfig,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save belt design");
      }

      const data = await res.json();
      setStyle(data.style);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save belt design");
    } finally {
      setSavingBelt(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this style?")) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);

      const res = await fetch(`/api/styles/${id}`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete style");
      }

      router.push("/styles");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to delete style");
      setDeleting(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {loading ? "Loading Style…" : style?.name || "Edit Style"}
            </h1>
            <p className="text-sm text-gray-600">
              Update style details and configure the belt design for this style.
            </p>
          </div>
          <Link
            href="/styles"
            className="text-xs rounded-md border border-primary px-3 py-1 font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Back to Styles
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
          <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
            Loading style details…
          </div>
        )}

        {/* Info form */}
        {!loading && style && (
          <form
            onSubmit={handleSaveInfo}
            className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Style Details
              </h2>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-500 hover:text-red-600 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete Style"}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Style Name<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Hawaiian Kempo, Brazilian Jiu Jitsu, etc."
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Short Name / Code
                </label>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="HK, BJJ, MMA, etc."
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Optional notes about this style, age groups, focus, etc."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="beltSystemEnabled"
                type="checkbox"
                checked={beltSystemEnabled}
                onChange={(e) => setBeltSystemEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label
                htmlFor="beltSystemEnabled"
                className="text-xs font-medium text-gray-700"
              >
                This style uses a belt/rank system
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!name.trim() || savingInfo}
                className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingInfo ? "Saving…" : "Save Style Info"}
              </button>
            </div>
          </form>
        )}

        {/* Belt designer */}
        {!loading && style && (
          <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Belt Design
              </h2>
              <button
                type="button"
                onClick={handleSaveBelt}
                disabled={savingBelt}
                className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingBelt ? "Saving…" : "Save Belt Design"}
              </button>
            </div>

            <BeltDesigner value={beltConfig} onChange={setBeltConfig} />
          </section>
        )}
      </div>
    </AppLayout>
  );
}
