"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

export default function NewStylePage() {
  const router = useRouter();

  // Form fields
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [beltSystemEnabled, setBeltSystemEnabled] = useState(true);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdStyleId, setCreatedStyleId] = useState<string | null>(null);

  async function handleSaveStyle(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Style name is required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const res = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shortName: shortName.trim() || null,
          description: description.trim() || null,
          beltSystemEnabled: beltSystemEnabled,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create style");
      }

      const data = await res.json();

      if (data.style && data.style.id) {
        setCreatedStyleId(data.style.id);
        // Redirect to styles list
        router.push("/styles");
      } else {
        // Fallback to styles list
        router.push("/styles");
      }
    } catch (err: any) {
      console.error("Error creating style:", err);
      setError(err.message || "Failed to create style");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateRanks() {
    if (!name.trim()) {
      setError("Style name is required");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const res = await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shortName: shortName.trim() || null,
          description: description.trim() || null,
          beltSystemEnabled: beltSystemEnabled,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create style");
      }

      const data = await res.json();

      // Redirect to belt designer for the new style
      if (data.style && data.style.id) {
        router.push(
          `/styles/belt-designer?styleId=${data.style.id}&styleName=${encodeURIComponent(
            data.style.name
          )}`
        );
      } else {
        // Fallback to styles list
        router.push("/styles");
      }
    } catch (err: any) {
      console.error("Error creating style:", err);
      setError(err.message || "Failed to create style");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Create Style</h1>
            <p className="mt-1 text-sm text-gray-600">
              Add a new style and rank system
            </p>
          </div>
          <Link
            href="/styles"
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Back to Styles
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSaveStyle}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-gray-800">Style Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Style Name <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Kempo, Brazilian Jiu-Jitsu"
                required
                disabled={creating}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Short Name
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g., BJJ, TKD"
                disabled={creating}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Description
            </label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this martial arts style..."
              disabled={creating}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="beltSystemEnabled"
              checked={beltSystemEnabled}
              onChange={(e) => setBeltSystemEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
              disabled={creating}
            />
            <label
              htmlFor="beltSystemEnabled"
              className="text-sm font-medium text-gray-700"
            >
              Enable Rank System
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {creating ? "Saving..." : "Save Style"}
            </button>
            {beltSystemEnabled && (
              <button
                type="button"
                onClick={handleCreateRanks}
                disabled={creating}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {creating ? "Creating..." : "Create Ranks"}
              </button>
            )}
            <Link
              href="/styles"
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

