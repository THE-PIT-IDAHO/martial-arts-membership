"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type DurationUnit = "weeks" | "months" | "years";

type RankDuration = {
  value: number | null;
  unit: DurationUnit;
};

type ClassRequirement = {
  id: string;
  label: string;
  minCount: number | null;
};

type BeltRank = {
  id: string;
  name: string;
  order: number;
  classRequirements?: ClassRequirement[];
  minDuration?: RankDuration;
  notes?: string | null;
};

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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [beltSystemEnabled, setBeltSystemEnabled] = useState(false);
  const [beltRanks, setBeltRanks] = useState<BeltRank[]>([]);
  const [savingRanks, setSavingRanks] = useState(false);

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

        // Load belt ranks from beltConfig if available
        console.log("beltConfig:", s.beltConfig, "type:", typeof s.beltConfig);
        if (s.beltConfig && typeof s.beltConfig === "string") {
          try {
            const parsed = JSON.parse(s.beltConfig);
            console.log("Parsed beltConfig:", parsed);
            if (parsed.ranks && Array.isArray(parsed.ranks)) {
              console.log("Setting belt ranks:", parsed.ranks);
              setBeltRanks(parsed.ranks);
            } else {
              console.log("No ranks found in parsed config");
            }
          } catch (e) {
            console.error("Failed to parse beltConfig:", e);
          }
        } else if (s.beltConfig && typeof s.beltConfig === "object" && s.beltConfig.ranks) {
          console.log("Setting belt ranks from object:", s.beltConfig.ranks);
          setBeltRanks(s.beltConfig.ranks);
        } else {
          console.log("No beltConfig found or wrong type");
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

      // Redirect to styles page after successful save
      router.push("/styles");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save style");
    } finally {
      setSavingInfo(false);
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

  function updateRankField(rankId: string, field: keyof BeltRank, value: any) {
    setRanks((prev) =>
      prev.map((r) => (r.id === rankId ? { ...r, [field]: value } : r))
    );
  }

  function updateClassRequirement(
    rankId: string,
    reqId: string,
    field: keyof ClassRequirement,
    value: any
  ) {
    setRanks((prev) =>
      prev.map((r) => {
        if (r.id !== rankId) return r;
        const reqs = r.classRequirements || [];
        return {
          ...r,
          classRequirements: reqs.map((req) =>
            req.id === reqId ? { ...req, [field]: value } : req
          ),
        };
      })
    );
  }

  function updateMinDuration(
    rankId: string,
    field: "value" | "unit",
    value: any
  ) {
    setRanks((prev) =>
      prev.map((r) => {
        if (r.id !== rankId) return r;
        const dur = r.minDuration || { value: null, unit: "months" };
        return {
          ...r,
          minDuration: { ...dur, [field]: value },
        };
      })
    );
  }

  function setRanks(updater: (prev: BeltRank[]) => BeltRank[]) {
    setBeltRanks(updater);
  }

  async function handleSaveRanks() {
    if (!style) return;

    try {
      setSavingRanks(true);
      setError(null);

      // Get existing beltConfig
      let existingConfig: any = {};
      if (style.beltConfig) {
        if (typeof style.beltConfig === "string") {
          try {
            existingConfig = JSON.parse(style.beltConfig);
          } catch (e) {
            console.warn("Failed to parse existing beltConfig");
          }
        } else if (typeof style.beltConfig === "object") {
          existingConfig = style.beltConfig;
        }
      }

      // Update ranks in beltConfig
      const updatedConfig = {
        ...existingConfig,
        ranks: beltRanks,
      };

      const res = await fetch(`/api/styles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beltConfig: updatedConfig,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save belt ranks");
      }

      const data = await res.json();
      setStyle(data.style);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save belt ranks");
    } finally {
      setSavingRanks(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {loading ? "Loading Style…" : "Edit Style"}
            </h1>
            <p className="text-sm text-gray-600">
              Update style details and manage rank system settings
            </p>
          </div>
          <Link
            href="/styles"
            className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
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
                className="text-xs text-primary hover:text-primaryDark disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete Style"}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Style Name<span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder="Optional notes about this style, age groups, focus, etc."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="beltSystemEnabled"
                checked={beltSystemEnabled}
                onChange={(e) => setBeltSystemEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
              />
              <label
                htmlFor="beltSystemEnabled"
                className="text-sm font-medium text-gray-700"
              >
                Enable Rank System
              </label>
              {beltSystemEnabled && (
                <span className="text-xs text-gray-500">
                  ({beltRanks.length} {beltRanks.length === 1 ? 'rank' : 'ranks'})
                </span>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!name.trim() || savingInfo}
                  className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {savingInfo ? "Saving…" : "Save Style"}
                </button>
                {beltSystemEnabled && (
                  <button
                    type="button"
                    onClick={async () => {
                      // Save current state first
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

                        // Navigate to belt designer
                        router.push(`/styles/belt-designer?styleId=${id}&styleName=${encodeURIComponent(name)}`);
                      } catch (err: any) {
                        console.error(err);
                        setError(err.message || "Failed to save style");
                      } finally {
                        setSavingInfo(false);
                      }
                    }}
                    disabled={!name.trim() || savingInfo}
                    className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {savingInfo ? "Saving…" : "Create/Edit Ranks"}
                  </button>
                )}
                <Link
                  href="/styles"
                  className="text-xs rounded-md border border-gray-300 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
