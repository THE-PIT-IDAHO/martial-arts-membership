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

            <div className="flex justify-end gap-3">
              <Link
                href={`/styles/belt-designer?styleId=${id}&styleName=${encodeURIComponent(name)}`}
                className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
              >
                Open Belt Designer
              </Link>

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

        {/* Belt Ranks List */}
        {!loading && style && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-800">
                Belt Ranks ({beltRanks.length})
              </h2>
              <button
                type="button"
                onClick={handleSaveRanks}
                disabled={savingRanks}
                className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingRanks ? "Saving…" : "Save Changes"}
              </button>
            </div>

            {beltRanks.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No belt ranks yet. Use the Belt Designer to create ranks.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-[11px] font-semibold text-gray-700">
                        Order
                      </th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-gray-700">
                        Belt Rank Name
                      </th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-gray-700">
                        Min Classes
                      </th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-gray-700">
                        Min Time
                      </th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-gray-700">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                  {beltRanks
                    .sort((a, b) => a.order - b.order)
                    .map((rank) => {
                      const classReqs = rank.classRequirements || [];
                      const minDur = rank.minDuration || {
                        value: null,
                        unit: "months" as DurationUnit,
                      };

                      return (
                        <tr
                          key={rank.id}
                          className="border-b border-gray-100 last:border-b-0"
                        >
                          {/* Order */}
                          <td className="px-3 py-2 align-top">
                            <input
                              type="number"
                              min={1}
                              value={rank.order}
                              onChange={(e) =>
                                updateRankField(
                                  rank.id,
                                  "order",
                                  Number(e.target.value) || 1
                                )
                              }
                              className="w-11 rounded border border-gray-300 px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>

                          {/* Belt Rank Name */}
                          <td className="px-3 py-2 align-top">
                            <input
                              type="text"
                              value={rank.name}
                              onChange={(e) =>
                                updateRankField(rank.id, "name", e.target.value)
                              }
                              className="w-full min-w-[8rem] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </td>

                          {/* Min Classes */}
                          <td className="px-3 py-2 align-top">
                            <div className="space-y-2">
                              {classReqs.map((req) => (
                                <div
                                  key={req.id}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    value={req.minCount ?? ""}
                                    onChange={(e) =>
                                      updateClassRequirement(
                                        rank.id,
                                        req.id,
                                        "minCount",
                                        e.target.value
                                          ? Number(e.target.value)
                                          : null
                                      )
                                    }
                                    className="w-11 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="0"
                                  />
                                  <input
                                    type="text"
                                    value={req.label}
                                    onChange={(e) =>
                                      updateClassRequirement(
                                        rank.id,
                                        req.id,
                                        "label",
                                        e.target.value
                                      )
                                    }
                                    className="flex-1 min-w-[6rem] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="Class type"
                                  />
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Min Time */}
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                value={minDur.value ?? ""}
                                onChange={(e) =>
                                  updateMinDuration(
                                    rank.id,
                                    "value",
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                className="w-11 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="0"
                              />
                              <select
                                value={minDur.unit}
                                onChange={(e) =>
                                  updateMinDuration(
                                    rank.id,
                                    "unit",
                                    e.target.value as DurationUnit
                                  )
                                }
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              >
                                <option value="weeks">Weeks</option>
                                <option value="months">Months</option>
                                <option value="years">Years</option>
                              </select>
                            </div>
                          </td>

                          {/* Notes */}
                          <td className="px-3 py-2 align-top">
                            <input
                              type="text"
                              value={rank.notes || ""}
                              onChange={(e) =>
                                updateRankField(rank.id, "notes", e.target.value)
                              }
                              className="w-full min-w-[8rem] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="Optional notes"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
