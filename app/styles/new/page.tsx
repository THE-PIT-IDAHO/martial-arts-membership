"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  beltConfig?: string | null;
};

export default function NewStylePage() {
  const router = useRouter();

  // Form fields
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");

  // Created style info
  const [createdStyle, setCreatedStyle] = useState<Style | null>(null);

  // Belt designer state
  const [beltConfig, setBeltConfig] = useState<BeltConfig>(defaultBeltConfig);

  const [creating, setCreating] = useState(false);
  const [savingBelt, setSavingBelt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // STEP 1 — Create the style
  async function handleCreateStyle(e: React.FormEvent) {
    e.preventDefault();

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
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create style");
      }

      const data = await res.json();
      setCreatedStyle(data.style);

      // Belt designer is now unlocked
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  // STEP 2 — Save the belt designer settings
  async function handleSaveBelt() {
    if (!createdStyle) return;

    try {
      setSavingBelt(true);
      setError(null);

      const res = await fetch(`/api/styles/${createdStyle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beltConfig,
        }),
      });

      if (!res.ok) throw new Error("Failed to save belt design");

      // Reload saved beltConfig (optional)
      const data = await res.json();
      setCreatedStyle(data.style);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingBelt(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Create Style</h1>
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

        {/* FORM — Create Style */}
        {!createdStyle && (
          <form
            onSubmit={handleCreateStyle}
            className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-gray-800">Style Details</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium">Style Name</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium">Short Name</label>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Description</label>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
            >
              {creating ? "Creating…" : "Create Style"}
            </button>
          </form>
        )}

        {/* BELT DESIGNER — only visible after style is created */}
        {createdStyle && (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Belt Designer for {createdStyle.name}
              </h2>

              <button
                onClick={handleSaveBelt}
                disabled={savingBelt}
                className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
              >
                {savingBelt ? "Saving…" : "Save Belt Design"}
              </button>
            </div>

            {/* Belt Designer Component */}
            <BeltDesigner value={beltConfig} onChange={setBeltConfig} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
