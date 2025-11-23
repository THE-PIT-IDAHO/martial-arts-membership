"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

// -------- Types --------

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
  // belt design snapshot for this rank
  layers?: BeltLayerConfig;
};

type BeltLayerConfig = {
  fabric: boolean;
  linear: boolean;
  camo: boolean;
  patch: boolean;
  patch2: boolean;
  stripe1: boolean;
  stripe2: boolean;
  stripe3: boolean;
  stripe4: boolean;
  stripe5: boolean;
  stripe6: boolean;
  stripe7: boolean;
  stripe8: boolean;
  stripe9: boolean;
  stripe10: boolean;

  fabricColor: string;
  linearColor: string;
  patchColor: string;
  patch2Color: string;
  stripe1Color: string;
  stripe2Color: string;
  stripe3Color: string;
  stripe4Color: string;
  stripe5Color: string;
  stripe6Color: string;
  stripe7Color: string;
  stripe8Color: string;
  stripe9Color: string;
  stripe10Color: string;
};

type ToggleableLayerKey =
  | "linear"
  | "camo"
  | "patch"
  | "patch2"
  | "stripe1"
  | "stripe2"
  | "stripe3"
  | "stripe4"
  | "stripe5"
  | "stripe6"
  | "stripe7"
  | "stripe8"
  | "stripe9"
  | "stripe10";

type BeltSetup = {
  layers: BeltLayerConfig;
  ranks: BeltRank[];
};

type Style = {
  id: string;
  name: string;
  beltConfig?: string | null;
};

// -------- Defaults & helpers --------

const defaultLayers: BeltLayerConfig = {
  fabric: true,
  linear: false,
  camo: false,
  patch: false,
  patch2: false,
  stripe1: false,
  stripe2: false,
  stripe3: false,
  stripe4: false,
  stripe5: false,
  stripe6: false,
  stripe7: false,
  stripe8: false,
  stripe9: false,
  stripe10: false,

  fabricColor: "#ffffff",
  linearColor: "#ffffff",
  patchColor: "#000000",
  patch2Color: "#000000",
  stripe1Color: "#ffffff",
  stripe2Color: "#ffffff",
  stripe3Color: "#ffffff",
  stripe4Color: "#ffffff",
  stripe5Color: "#ffffff",
  stripe6Color: "#ffffff",
  stripe7Color: "#ffffff",
  stripe8Color: "#ffffff",
  stripe9Color: "#ffffff",
  stripe10Color: "#ffffff",
};

const STORAGE_PREFIX = "beltSetup_";
const getStorageKey = (styleId: string) => `${STORAGE_PREFIX}${styleId}`;

// lowest positive integer not in the set of used orders
function getNextOrder(existingRanks: BeltRank[]): number {
  const used = new Set(
    existingRanks
      .map((r) => r.order)
      .filter((n) => typeof n === "number" && n > 0)
  );
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

function createEmptyRequirement(): ClassRequirement {
  return {
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    minCount: null,
  };
}

// -------- Component --------

export default function BeltDesignerPage() {
  const searchParams = useSearchParams();
  const styleId = searchParams.get("styleId");
  const styleName = searchParams.get("styleName") || "";

  const [style, setStyle] = useState<Style | null>(null);

  // Visual layers (current working design) + ranks
  const [layers, setLayers] = useState<BeltLayerConfig>(defaultLayers);
  const [ranks, setRanks] = useState<BeltRank[]>([]);

  // Rank editor state (top form)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rankName, setRankName] = useState("");
  const [rankOrder, setRankOrder] = useState<number>(1);
  const [rankClassRequirements, setRankClassRequirements] = useState<
    ClassRequirement[]
  >(() => [createEmptyRequirement()]);
  const [durationValue, setDurationValue] = useState<string>("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("months");
  const [rankNotes, setRankNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // drag-and-drop for ranks
  const [draggedRankId, setDraggedRankId] = useState<string | null>(null);
  const [hoveredRankId, setHoveredRankId] = useState<string | null>(null);

  // ---- Local storage hydrate helper ----
  function hydrateFromLocal(sid: string) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(getStorageKey(sid));
      if (!raw) return;
      const parsed: BeltSetup = JSON.parse(raw);

      if (parsed.layers) {
        setLayers({
          ...defaultLayers,
          ...parsed.layers,
          fabric: true,
        });
      }
      if (Array.isArray(parsed.ranks)) {
        const hydrated = parsed.ranks
          .map((r) => ({
            ...r,
            classRequirements: r.classRequirements || [],
            minDuration: r.minDuration || {
              value: null,
              unit: "months" as DurationUnit,
            },
          }))
          .sort((a, b) => a.order - b.order);
        setRanks(hydrated);
        setRankOrder(getNextOrder(hydrated));
      }
      console.log("Hydrated belt setup from localStorage for style", sid);
    } catch (err) {
      console.warn("Failed to hydrate belt setup from localStorage:", err);
    }
  }

  // Load existing beltConfig from the Style
  useEffect(() => {
    async function loadStyle() {
      if (!styleId) return;
      try {
        setLoading(true);
        setSuccess(null);

        const res = await fetch(`/api/styles/${styleId}`);
        if (!res.ok) {
          console.error("Failed to load style:", res.status, res.statusText);
          hydrateFromLocal(styleId);
          return;
        }

        const data = await res.json();
        const s: Style = data.style;
        setStyle(s);

        if (s.beltConfig && typeof s.beltConfig === "string") {
          let parsedOk = false;
          try {
            const parsed: any = JSON.parse(s.beltConfig);
            if (parsed && typeof parsed === "object") {
              parsedOk = true;
              if (parsed.layers) {
                setLayers({
                  ...defaultLayers,
                  ...parsed.layers,
                  fabric: true,
                });
              }
              const parsedRanks: BeltRank[] =
                parsed.ranks || parsed.levels || [];
              if (Array.isArray(parsedRanks)) {
                const hydrated = parsedRanks
                  .map((r) => ({
                    ...r,
                    classRequirements: r.classRequirements || [],
                    minDuration: r.minDuration || {
                      value: null,
                      unit: "months" as DurationUnit,
                    },
                  }))
                  .sort((a, b) => a.order - b.order);
                setRanks(hydrated);
                setRankOrder(getNextOrder(hydrated));
              }
            }
          } catch (err) {
            console.warn("Could not parse beltConfig JSON:", err);
          }

          if (!parsedOk) {
            hydrateFromLocal(styleId);
          }
        } else {
          hydrateFromLocal(styleId);
        }
      } catch (err) {
        console.error("Error loading style:", err);
        if (styleId) hydrateFromLocal(styleId);
      } finally {
        setLoading(false);
      }
    }

    loadStyle();
  }, [styleId]);

  // whenever ranks change and we're NOT editing in the top form,
  // keep the order field at "lowest unused"
  useEffect(() => {
    if (!editingId) {
      setRankOrder(getNextOrder(ranks));
    }
  }, [ranks, editingId]);

  // ----- Rank form helpers (top form) -----

  function scrollToDesignerTop() {
    // Always scroll to very top of the page
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetRankForm() {
    setEditingId(null);
    setRankName("");
    setRankOrder(getNextOrder(ranks));
    setRankClassRequirements([createEmptyRequirement()]);
    setDurationValue("");
    setDurationUnit("months");
    setRankNotes("");
  }

  function handleEditRank(rank: BeltRank) {
    setEditingId(rank.id);
    setRankName(rank.name);
    setRankOrder(rank.order);

    const reqs =
      rank.classRequirements && rank.classRequirements.length > 0
        ? rank.classRequirements
        : [createEmptyRequirement()];
    setRankClassRequirements(reqs);

    if (rank.minDuration) {
      setDurationValue(
        rank.minDuration.value !== null && rank.minDuration.value !== undefined
          ? String(rank.minDuration.value)
          : ""
      );
      setDurationUnit(rank.minDuration.unit || "months");
    } else {
      setDurationValue("");
      setDurationUnit("months");
    }
    setRankNotes(rank.notes || "");

    const rankLayers = rank.layers
      ? { ...defaultLayers, ...rank.layers, fabric: true }
      : { ...defaultLayers };
    setLayers(rankLayers);

    scrollToDesignerTop();
  }

  function handleDeleteRank(id: string) {
    if (!window.confirm("Delete this belt rank?")) return;
    const updatedRanks = ranks.filter((r) => r.id !== id);
    // re-sequence orders after delete
    updatedRanks
      .sort((a, b) => a.order - b.order)
      .forEach((r, idx) => {
        r.order = idx + 1;
      });
    setRanks(updatedRanks);
    if (editingId === id) {
      resetRankForm();
      setLayers(defaultLayers);
    } else {
      setRankOrder(getNextOrder(updatedRanks));
    }
    if (styleId) {
      persistBeltConfig(updatedRanks, layers);
    }
  }

  function handleDuplicateRank(rank: BeltRank) {
    const current = [...ranks];
    const duplicated: BeltRank = {
      id: `rank_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `${rank.name}`,
      order: current.length + 1,
      classRequirements:
        rank.classRequirements?.map((req) => ({ ...req })) || [],
      minDuration: rank.minDuration
        ? { ...rank.minDuration }
        : { value: null, unit: "months" },
      notes: rank.notes || null,
      layers: rank.layers ? { ...rank.layers } : { ...defaultLayers },
    };

    const updatedRanks = [...current, duplicated];
    updatedRanks
      .sort((a, b) => a.order - b.order)
      .forEach((r, idx) => {
        r.order = idx + 1;
      });

    setRanks(updatedRanks);
    setRankOrder(getNextOrder(updatedRanks));
    if (styleId) {
      persistBeltConfig(updatedRanks, layers);
    }
  }

  // Class requirement helpers (top form)
  function addClassRequirement() {
    setRankClassRequirements((prev) => [...prev, createEmptyRequirement()]);
  }

  function updateClassRequirement(
    id: string,
    field: "label" | "minCount",
    value: string
  ) {
    setRankClassRequirements((prev) =>
      prev.map((req) =>
        req.id === id
          ? {
              ...req,
              [field]:
                field === "minCount"
                  ? value.trim() === ""
                    ? null
                    : Number(value) || 0
                  : value,
            }
          : req
      )
    );
  }

  function removeClassRequirement(id: string) {
    setRankClassRequirements((prev) => prev.filter((req) => req.id !== id));
  }

  // ----- Layers / preview helpers -----

  function toggleLayer(key: ToggleableLayerKey) {
    setLayers((prev) => ({
      ...prev,
      [key]: !prev[key],
      fabric: true,
    }));
  }

  // Save belt design + ranks together to the Style AND to localStorage
  async function persistBeltConfig(
    nextRanks: BeltRank[],
    nextLayers: BeltLayerConfig
  ) {
    if (!styleId) return;

    setSavingAll(true);
    setSuccess(null);

    const payload: BeltSetup = {
      layers: { ...nextLayers, fabric: true },
      ranks: nextRanks,
    };

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          getStorageKey(styleId),
          JSON.stringify(payload)
        );
      } catch (err) {
        console.warn("Failed to save belt setup to localStorage:", err);
      }
    }

    try {
      const res = await fetch(`/api/styles/${styleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beltConfig: payload }),
      });

      if (!res.ok) {
        console.error("Failed to save belt setup:", res.status, res.statusText);
      } else {
        try {
          const data = await res.json();
          if (data && data.style) {
            setStyle(data.style);
          }
        } catch (err) {
          console.warn("Save succeeded but response was not JSON:", err);
        }
        setSuccess("Belt design and ranks saved.");
      }
    } catch (err) {
      console.error("Network error while saving belt setup:", err);
    } finally {
      setSavingAll(false);
    }
  }

  // Save button for rank (top form)
  async function handleSaveRank(e: React.FormEvent) {
    e.preventDefault();
    if (!rankName.trim()) return;

    const durationVal =
      durationValue.trim() === "" ? null : Number(durationValue) || 0;

    const minDuration: RankDuration = {
      value: durationVal,
      unit: durationUnit,
    };

    const cleanRequirements = rankClassRequirements.map((req) => ({
      ...req,
      label: req.label.trim(),
      minCount:
        req.minCount === null || Number.isNaN(req.minCount)
          ? null
          : req.minCount,
    }));

    const currentLayers: BeltLayerConfig = {
      ...layers,
      fabric: true,
    };

    let updatedRanks: BeltRank[];

    if (editingId) {
      updatedRanks = ranks.map((r) =>
        r.id === editingId
          ? {
              ...r,
              name: rankName.trim(),
              order: rankOrder || r.order,
              classRequirements: cleanRequirements,
              minDuration,
              notes: rankNotes.trim() || null,
              layers: { ...currentLayers },
            }
          : r
      );
    } else {
      const newRank: BeltRank = {
        id: `rank_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        name: rankName.trim(),
        order: rankOrder || getNextOrder(ranks),
        classRequirements: cleanRequirements,
        minDuration,
        notes: rankNotes.trim() || null,
        layers: { ...currentLayers },
      };

      updatedRanks = [...ranks, newRank];
    }

    // sort & normalize
    updatedRanks
      .sort((a, b) => a.order - b.order)
      .forEach((r, idx) => {
        r.order = idx + 1;
      });

    setRanks(updatedRanks);

    await persistBeltConfig(updatedRanks, currentLayers);

    // after successful create/edit:
    resetRankForm();
    setLayers(defaultLayers);
    setRankOrder(getNextOrder(updatedRanks));
  }

  // ---------- Inline editing helpers for Existing Ranks ----------

  // Update a simple field on a rank (name, order, notes, etc) in state only
  function updateRankField<K extends keyof BeltRank>(
    rankId: string,
    field: K,
    value: BeltRank[K]
  ) {
    setRanks((prev) =>
      prev.map((r) => (r.id === rankId ? { ...r, [field]: value } : r))
    );
  }

  // Update class requirement inside a rank (existing belts section)
  function updateRankRequirementInline(
    rankId: string,
    reqId: string,
    field: "label" | "minCount",
    value: string
  ) {
    setRanks((prev) =>
      prev.map((rank) => {
        if (rank.id !== rankId) return rank;
        const classRequirements = (rank.classRequirements || []).map((req) =>
          req.id === reqId
            ? {
                ...req,
                [field]:
                  field === "minCount"
                    ? value.trim() === ""
                      ? null
                      : Number(value) || 0
                    : value,
              }
            : req
        );
        return { ...rank, classRequirements };
      })
    );
  }

  // Update minDuration inside a rank (Existing belts)
  function updateRankDurationInline(
    rankId: string,
    field: "value" | "unit",
    value: string
  ) {
    setRanks((prev) =>
      prev.map((rank) => {
        if (rank.id !== rankId) return rank;
        const current = rank.minDuration || {
          value: null,
          unit: "months" as DurationUnit,
        };
        const next: RankDuration =
          field === "value"
            ? {
                ...current,
                value: value.trim() === "" ? null : Number(value) || 0,
              }
            : {
                ...current,
                unit: value as DurationUnit,
              };
        return { ...rank, minDuration: next };
      })
    );
  }

  // Commit inline changes: normalize order, persist, update default next order
  function commitRanksInline() {
    setRanks((prev) => {
      const updated = [...prev]
        .sort((a, b) => a.order - b.order)
        .map((r, idx) => ({ ...r, order: idx + 1 }));

      if (styleId) {
        void persistBeltConfig(updated, layers);
      }

      const nextOrder = getNextOrder(updated);
      setRankOrder(nextOrder);

      return updated;
    });
  }

  // Handle Enter to commit; blur on last field (Notes) also commits
  function handleInlineKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRanksInline();
      (e.target as HTMLElement).blur();
    }
  }

  // ---------- Drag & drop existing ranks ----------

  function handleDragStart(rankId: string) {
    setDraggedRankId(rankId);
    setHoveredRankId(null);
  }

  function handleRowDragOver(
    e: React.DragEvent<HTMLTableRowElement>,
    targetId: string
  ) {
    e.preventDefault();
    setHoveredRankId(targetId);
  }

  async function handleDrop(targetId: string) {
    if (!draggedRankId || draggedRankId === targetId) {
      setDraggedRankId(null);
      setHoveredRankId(null);
      return;
    }

    const current = [...ranks];
    const fromIndex = current.findIndex((r) => r.id === draggedRankId);
    const toIndex = current.findIndex((r) => r.id === targetId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedRankId(null);
      setHoveredRankId(null);
      return;
    }

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);

    current.forEach((r, idx) => {
      r.order = idx + 1;
    });

    setRanks(current);
    setRankOrder(getNextOrder(current));
    if (styleId) {
      await persistBeltConfig(current, layers);
    }
    setDraggedRankId(null);
    setHoveredRankId(null);
  }

  function handleDragEnd() {
    setDraggedRankId(null);
    setHoveredRankId(null);
  }

  // Image src map for each layer
  const layerSrc: Record<string, string> = {
    outline: "/belts/outline.png",
    fabric: "/belts/fabric.png",
    linear: "/belts/linear.png",
    camo: "/belts/camo.png",
    patch: "/belts/patch.png",
    patch2: "/belts/patch2.png",
    stripe1: "/belts/stripe1.png",
    stripe2: "/belts/stripe2.png",
    stripe3: "/belts/stripe3.png",
    stripe4: "/belts/stripe4.png",
    stripe5: "/belts/stripe5.png",
    stripe6: "/belts/stripe6.png",
    stripe7: "/belts/stripe7.png",
    stripe8: "/belts/stripe8.png",
    stripe9: "/belts/stripe9.png",
    stripe10: "/belts/stripe10.png",
  };

  function TintedLayer({ src, color }: { src: string; color: string }) {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: color,
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
    );
  }

  function BeltPreview({
    heightClass,
    customLayers,
  }: {
    heightClass: string;
    customLayers?: BeltLayerConfig;
  }) {
    const usedLayers: BeltLayerConfig = customLayers
      ? { ...defaultLayers, ...customLayers, fabric: true }
      : { ...defaultLayers, ...layers, fabric: true };

    return (
      <div className="relative w-full overflow-hidden rounded-md bg-black/5">
        <div className={`${heightClass} relative w-full`}>
          {usedLayers.fabric && (
            <TintedLayer
              src={layerSrc.fabric}
              color={usedLayers.fabricColor}
            />
          )}
          {usedLayers.camo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={layerSrc.camo}
              alt="Camo"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          )}
          {usedLayers.linear && (
            <TintedLayer
              src={layerSrc.linear}
              color={usedLayers.linearColor}
            />
          )}
          {usedLayers.patch2 && (
            <TintedLayer
              src={layerSrc.patch2}
              color={usedLayers.patch2Color}
            />
          )}
          {usedLayers.patch && (
            <TintedLayer
              src={layerSrc.patch}
              color={usedLayers.patchColor}
            />
          )}

          {[
            "stripe10",
            "stripe9",
            "stripe8",
            "stripe7",
            "stripe6",
            "stripe5",
            "stripe4",
            "stripe3",
            "stripe2",
            "stripe1",
          ].map((key) => {
            const k = key as ToggleableLayerKey;
            if (!usedLayers[k]) return null;
            const colorKey = `${key}Color` as keyof BeltLayerConfig;
            const color = (usedLayers as any)[colorKey] ?? "#ffffff";
            return (
              <TintedLayer key={key} src={layerSrc[key]} color={color} />
            );
          })}

          {/* Outline always on top */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={layerSrc.outline}
            alt="Outline"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        </div>
      </div>
    );
  }

  // -------- UI --------

  const sortedRanks = ranks.slice().sort((a, b) => a.order - b.order);
  const hoveredIndex =
    hoveredRankId && sortedRanks.length > 0
      ? sortedRanks.findIndex((r) => r.id === hoveredRankId)
      : -1;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Belt Designer</h1>
            {styleId && (
              <p className="mt-1 text-xl font-semibold text-gray-800">
                Style:{" "}
                <span className="font-bold">
                  {styleName || style?.name || `#${styleId}`}
                </span>
              </p>
            )}
            {!styleId && (
              <p className="mt-1 text-xs text-gray-500">
                No style selected. Open this page from a style to see belt
                settings.
              </p>
            )}
          </div>
          <Link
            href="/styles"
            className="text-xs rounded-md border border-primary px-3 py-1 font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Back to Styles
          </Link>
        </div>

        {/* Messages (only success now) */}
        {success && (
          <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
            {success}
          </div>
        )}
        {loading && (
          <div className="rounded-md border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
            Loading style…
          </div>
        )}

        {/* 1) Top: Belt preview */}
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">
            Belt Preview
          </h2>
          <div className="flex justify-start rounded-md border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="w-full max-w-[420px]">
              <BeltPreview heightClass="h-56" />
            </div>
          </div>
        </section>

        {/* 2) New Belt Rank + Options */}
        <section
          id="belt-rank-editor"
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-gray-800">
            New Belt Rank
          </h2>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <div className="md:flex md:gap-4">
              {/* LEFT: Options */}
              <div className="md:w-[420px] md:flex-none space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-700">
                  {/* Belt Color */}
                  <div className="flex flex-col gap-1 col-span-2">
                    <span className="font-medium">Belt Color</span>
                    <input
                      type="color"
                      value={layers.fabricColor}
                      onChange={(e) =>
                        setLayers((prev) => ({
                          ...prev,
                          fabricColor: e.target.value,
                          fabric: true,
                        }))
                      }
                      className="h-7 w-20 cursor-pointer rounded-md border border-gray-300 bg-white"
                    />
                  </div>

                  {/* Linear Stripe */}
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={layers.linear}
                        onChange={() => toggleLayer("linear")}
                        className="h-3 w-3 rounded border-gray-300"
                      />
                      <span className="font-medium">Linear Stripe</span>
                    </label>
                    {layers.linear && (
                      <input
                        type="color"
                        value={layers.linearColor}
                        onChange={(e) =>
                          setLayers((prev) => ({
                            ...prev,
                            linearColor: e.target.value,
                          }))
                        }
                        className="h-7 w-20 cursor-pointer rounded-md border border-gray-300 bg-white"
                      />
                    )}
                  </div>

                  {/* Patch 1 */}
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={layers.patch}
                        onChange={() => toggleLayer("patch")}
                        className="h-3 w-3 rounded border-gray-300"
                      />
                      <span className="font-medium">Patch 1</span>
                    </label>
                    {layers.patch && (
                      <input
                        type="color"
                        value={layers.patchColor}
                        onChange={(e) =>
                          setLayers((prev) => ({
                            ...prev,
                            patchColor: e.target.value,
                          }))
                        }
                        className="h-7 w-20 cursor-pointer rounded-md border border-gray-300 bg-white"
                      />
                    )}
                  </div>

                  {/* Camo */}
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={layers.camo}
                        onChange={() => toggleLayer("camo")}
                        className="h-3 w-3 rounded border-gray-300"
                      />
                      <span className="font-medium">Camo</span>
                    </label>
                  </div>

                  {/* Patch 2 */}
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={layers.patch2}
                        onChange={() => toggleLayer("patch2")}
                        className="h-3 w-3 rounded border-gray-300"
                      />
                      <span className="font-medium">Patch 2</span>
                    </label>
                    {layers.patch2 && (
                      <input
                        type="color"
                        value={layers.patch2Color}
                        onChange={(e) =>
                          setLayers((prev) => ({
                            ...prev,
                            patch2Color: e.target.value,
                          }))
                        }
                        className="h-7 w-20 cursor-pointer rounded-md border border-gray-300 bg-white"
                      />
                    )}
                  </div>
                </div>

                {/* Stripes */}
                <div className="mt-3 space-y-1">
                  <p className="text-[11px] font-semibold text-gray-800">
                    Stripes
                  </p>
                  <div className="grid grid-cols-5 gap-3 text-xs text-gray-700">
                    {(
                      [
                        "stripe1",
                        "stripe2",
                        "stripe3",
                        "stripe4",
                        "stripe5",
                        "stripe6",
                        "stripe7",
                        "stripe8",
                        "stripe9",
                        "stripe10",
                      ] as const
                    ).map((key, i) => {
                      const k = key as ToggleableLayerKey;
                      const colorKey = `${key}Color` as keyof BeltLayerConfig;
                      return (
                        <div key={key} className="flex flex-col gap-1">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={layers[k]}
                              onChange={() => toggleLayer(k)}
                              className="h-3 w-3 rounded border-gray-300"
                            />
                            <span className="font-medium">{i + 1}</span>
                          </label>
                          {layers[k] && (
                            <input
                              type="color"
                              value={(layers as any)[colorKey]}
                              onChange={(e) =>
                                setLayers((prev) => ({
                                  ...prev,
                                  [colorKey]: e.target.value,
                                }))
                              }
                              className="h-6 w-8 cursor-pointer rounded-md border border-gray-300 bg-white"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT: New/Edit Belt Rank form */}
              <div className="mt-4 md:mt-0 md:flex-1 md:border-l md:border-gray-200 md:pl-4 space-y-3">
                <form onSubmit={handleSaveRank} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-gray-700">
                        Belt Rank Name
                      </label>
                      <input
                        type="text"
                        value={rankName}
                        onChange={(e) => setRankName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="White, Yellow, Orange..."
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-gray-700">
                        Order
                      </label>
                      <input
                        type="number"
                        value={rankOrder}
                        onChange={(e) =>
                          setRankOrder(Number(e.target.value) || 1)
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        min={1}
                      />
                    </div>
                  </div>

                  {/* Min Classes */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-medium text-gray-700">
                      Min Classes (by type)
                    </label>
                    {rankClassRequirements.length === 0 && (
                      <p className="text-[11px] text-gray-500">
                        No class requirements yet. Add one below if needed.
                      </p>
                    )}
                    <div className="space-y-2">
                      {rankClassRequirements.map((req) => (
                        <div
                          key={req.id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="number"
                            min={0}
                            value={
                              req.minCount === null ||
                              req.minCount === undefined
                                ? ""
                                : req.minCount
                            }
                            onChange={(e) =>
                              updateClassRequirement(
                                req.id,
                                "minCount",
                                e.target.value
                              )
                            }
                            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="#"
                          />
                          <input
                            type="text"
                            value={req.label}
                            onChange={(e) =>
                              updateClassRequirement(
                                req.id,
                                "label",
                                e.target.value
                              )
                            }
                            className="min-w-[140px] flex-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Class type (e.g., HK class, BJJ, etc.)"
                          />
                          <button
                            type="button"
                            onClick={() => removeClassRequirement(req.id)}
                            className="text-[11px] font-semibold text-red-500 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addClassRequirement}
                      className="text-[11px] rounded-md border border-gray-300 px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Add Class Requirement
                    </button>
                  </div>

                  {/* Min Time */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-gray-700">
                      Min Time
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={durationValue}
                        onChange={(e) => setDurationValue(e.target.value)}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="#"
                      />
                      <select
                        value={durationUnit}
                        onChange={(e) =>
                          setDurationUnit(e.target.value as DurationUnit)
                        }
                        className="w-28 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-gray-700">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={rankNotes}
                      onChange={(e) => setRankNotes(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Optional details about this rank"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetRankForm();
                          setLayers(defaultLayers);
                        }}
                        className="text-xs rounded-md border border-gray-300 px-3 py-1 font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Clear
                      </button>
                      <button
                        type="submit"
                        disabled={savingAll}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        {editingId ? "Save Rank" : "Save Rank"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* 3) Existing Belt Ranks */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-gray-800">
              Existing Belt Ranks
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">
                    Belt
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">
                    Belt Rank
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">
                    Order
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">
                    Min Classes
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">
                    Min Time
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">
                    Notes
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRanks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-sm text-gray-400"
                    >
                      No belt ranks yet. Use the New Belt Rank section above to
                      create the first rank.
                    </td>
                  </tr>
                ) : (
                  sortedRanks.map((rank, index) => {
                    const isBetweenSegment =
                      hoveredIndex !== -1 &&
                      (index === hoveredIndex || index === hoveredIndex - 1);
                    const isLowerOfPair =
                      hoveredIndex !== -1 && index === hoveredIndex;

                    return (
                      <tr
                        key={rank.id}
                        className={`border-t border-gray-100 hover:bg-gray-50 ${
                          isBetweenSegment ? "bg-red-50/60" : ""
                        } ${isLowerOfPair ? "border-t-4 border-red-300" : ""}`}
                        onDragOver={(e) => handleRowDragOver(e, rank.id)}
                        onDrop={() => handleDrop(rank.id)}
                      >
                        {/* Belt snapshot (drag + edit) */}
                        <td className="px-3 py-2 align-middle">
                          <div className="w-40 select-none flex flex-col items-center">
                            <div
                              className="cursor-move w-full"
                              draggable
                              onDragStart={() => handleDragStart(rank.id)}
                              onDragEnd={handleDragEnd}
                              onDoubleClick={() => handleEditRank(rank)}
                            >
                              <BeltPreview
                                heightClass="h-20"
                                customLayers={rank.layers}
                              />
                            </div>
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => handleEditRank(rank)}
                              className="mt-1 inline-flex items-center rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-white hover:bg-primaryDark"
                            >
                              Edit Belt
                            </button>
                          </div>
                        </td>

                        {/* Belt Rank Name (inline editable) */}
                        <td className="px-3 py-2 text-xs text-gray-900 align-middle">
                          <input
                            type="text"
                            value={rank.name}
                            onChange={(e) =>
                              updateRankField(rank.id, "name", e.target.value)
                            }
                            onKeyDown={handleInlineKeyDown}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>

                        {/* Order (inline editable; re-sorts on commit) */}
                        <td className="px-3 py-2 text-xs text-gray-700 align-middle">
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
                            onKeyDown={handleInlineKeyDown}
                            className="no-spinner w-16 rounded border border-gray-300 px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>

                        {/* Min Classes (inline editable, stacked) */}
                        <td className="px-3 py-2 text-xs text-gray-700 align-middle">
                          {rank.classRequirements &&
                          rank.classRequirements.length > 0 ? (
                            <div className="space-y-1">
                              {rank.classRequirements.map((req) => (
                                <div
                                  key={req.id}
                                  className="flex items-center gap-1"
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    value={
                                      req.minCount === null ||
                                      req.minCount === undefined
                                        ? ""
                                        : req.minCount
                                    }
                                    onChange={(e) =>
                                      updateRankRequirementInline(
                                        rank.id,
                                        req.id,
                                        "minCount",
                                        e.target.value
                                      )
                                    }
                                    onKeyDown={handleInlineKeyDown}
                                    className="no-spinner w-12 rounded border border-gray-300 px-1 py-0.5 text-[11px] text-right focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                  <span className="text-[11px]">x</span>
                                  <input
                                    type="text"
                                    value={req.label}
                                    onChange={(e) =>
                                      updateRankRequirementInline(
                                        rank.id,
                                        req.id,
                                        "label",
                                        e.target.value
                                      )
                                    }
                                    onKeyDown={handleInlineKeyDown}
                                    className="flex-1 rounded border border-gray-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Min Time (inline editable) */}
                        <td className="px-3 py-2 text-xs text-gray-700 align-middle">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={
                                rank.minDuration &&
                                rank.minDuration.value !== null &&
                                rank.minDuration.value !== undefined
                                  ? rank.minDuration.value
                                  : ""
                              }
                              onChange={(e) =>
                                updateRankDurationInline(
                                  rank.id,
                                  "value",
                                  e.target.value
                                )
                              }
                              onKeyDown={handleInlineKeyDown}
                              className="no-spinner w-14 rounded border border-gray-300 px-1 py-0.5 text-[11px] text-right focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <select
                              value={
                                (rank.minDuration &&
                                  rank.minDuration.unit) ||
                                "months"
                              }
                              onChange={(e) =>
                                updateRankDurationInline(
                                  rank.id,
                                  "unit",
                                  e.target.value
                                )
                              }
                              onKeyDown={handleInlineKeyDown}
                              className="rounded border border-gray-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="weeks">Weeks</option>
                              <option value="months">Months</option>
                              <option value="years">Years</option>
                            </select>
                          </div>
                        </td>

                        {/* Notes (inline editable; blur here commits + re-sorts) */}
                        <td className="px-3 py-2 text-xs text-gray-700 align-middle">
                          <input
                            type="text"
                            value={rank.notes || ""}
                            onChange={(e) =>
                              updateRankField(
                                rank.id,
                                "notes",
                                e.target.value || null
                              )
                            }
                            onKeyDown={handleInlineKeyDown}
                            onBlur={commitRanksInline}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>

                        {/* Actions (tab should skip these) */}
                        <td className="px-3 py-2 text-right whitespace-nowrap align-middle space-x-2">
                          <button
                            type="button"
                            onClick={() => handleDuplicateRank(rank)}
                            tabIndex={-1}
                            className="text-xs font-medium text-gray-600 hover:text-gray-800"
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRank(rank.id)}
                            tabIndex={-1}
                            className="text-xs font-medium text-red-500 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Styled-JSX: remove number spinners from existing-belts fields */}
      <style jsx>{`
        input[type='number'].no-spinner::-webkit-outer-spin-button,
        input[type='number'].no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type='number'].no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </AppLayout>
  );
}
