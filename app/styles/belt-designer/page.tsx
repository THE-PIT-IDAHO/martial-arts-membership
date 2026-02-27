"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

// -------- Types --------

type DurationUnit = "weeks" | "months" | "years";

type RankDuration = {
  value: number | null;
  unit: DurationUnit;
};

type AttendanceWindow = {
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
  attendanceWindow?: AttendanceWindow;  // How far back to count classes (from grading date or current date)
  notes?: string | null;
  layers?: BeltLayerConfig;
  pdfDocuments?: Array<{ id: string; name: string; url: string }>;  // Array of PDF documents
};

type BeltLayerConfig = {
  fabric: boolean;
  twotone: boolean;
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
  twotoneColor: string;
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
  | "twotone"
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

// Popup target for editable pop-out
type PopupTarget =
  | { type: "rankName"; rankId: string }
  | { type: "rankNotes"; rankId: string }
  | { type: "classLabel"; rankId: string; reqId: string };

// -------- Defaults & helpers --------

const defaultLayers: BeltLayerConfig = {
  fabric: true,
  twotone: false,
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
  twotoneColor: "#000000",
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

  const [layers, setLayers] = useState<BeltLayerConfig>(defaultLayers);
  const [ranks, setRanks] = useState<BeltRank[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rankName, setRankName] = useState("");
  const [rankOrder, setRankOrder] = useState<number>(1);
  const [rankClassRequirements, setRankClassRequirements] = useState<
    ClassRequirement[]
  >(() => [createEmptyRequirement()]);
  const [durationValue, setDurationValue] = useState<string>("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("months");
  const [attendanceWindowValue, setAttendanceWindowValue] = useState<string>("");
  const [attendanceWindowUnit, setAttendanceWindowUnit] = useState<DurationUnit>("months");
  const [rankNotes, setRankNotes] = useState("");
  const [rankPdfDocuments, setRankPdfDocuments] = useState<Array<{ id: string; name: string; url: string }>>([]);

  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [classTypes, setClassTypes] = useState<string[]>([]);

  const [draggedRankId, setDraggedRankId] = useState<string | null>(null);
  const [hoveredRankId, setHoveredRankId] = useState<string | null>(null);

  // Pop-out editor
  const [popup, setPopup] = useState<PopupTarget | null>(null);
  const [popupValue, setPopupValue] = useState<string>("");
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const popupTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hover box
  const [hoverBox, setHoverBox] = useState<{
    value: string;
    x: number;
    y: number;
  } | null>(null);

  // ---- Local storage hydrate helper ----
  function hydrateFromLocal(sid: string) {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(getStorageKey(sid));
      if (!raw) return;
      const parsed: BeltSetup = JSON.parse(raw);

      // Always use default layers - don't load saved layer configuration
      setLayers(defaultLayers);
      if (Array.isArray(parsed.ranks)) {
        const hydrated = parsed.ranks
          .map((r) => ({
            ...r,
            classRequirements: r.classRequirements || [],
            minDuration: r.minDuration || {
              value: null,
              unit: "months" as DurationUnit,
            },
            attendanceWindow: r.attendanceWindow || {
              value: null,
              unit: "months" as DurationUnit,
            },
          }))
          .sort((a, b) => a.order - b.order);
        setRanks(hydrated);
        setRankOrder(getNextOrder(hydrated));
      }
    } catch (err) {
      console.warn("Failed to hydrate belt setup from localStorage:", err);
    }
  }

  // Load existing beltConfig from Style
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
              // Always use default layers - don't load saved layer configuration
              setLayers(defaultLayers);
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
                    attendanceWindow: r.attendanceWindow || {
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

  // Load available class types
  useEffect(() => {
    async function loadClassTypes() {
      try {
        const res = await fetch("/api/classes?types=true");
        if (res.ok) {
          const data = await res.json();
          // Ensure unique class types (deduplicate)
          const uniqueTypes = [...new Set((data.classTypes || []) as string[])];
          setClassTypes(uniqueTypes);
        }
      } catch (err) {
        console.error("Error loading class types:", err);
      }
    }
    loadClassTypes();
  }, []);

  useEffect(() => {
    if (!editingId) {
      setRankOrder(getNextOrder(ranks));
    }
  }, [ranks, editingId]);

  // Auto-size popup textarea height
  useEffect(() => {
    if (popup && popupTextareaRef.current) {
      const t = popupTextareaRef.current;
      t.style.height = "auto";
      t.style.height = `${t.scrollHeight}px`;
    }
  }, [popup, popupValue]);

  // ----- Helpers -----

  function scrollToDesignerTop() {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function resetRankForm() {
    setEditingId(null);
    setRankName("");
    setRankOrder(getNextOrder(ranks));
    setRankClassRequirements([createEmptyRequirement()]);
    setDurationValue("");
    setDurationUnit("months");
    setAttendanceWindowValue("");
    setAttendanceWindowUnit("months");
    setRankNotes("");
    setRankPdfDocuments([]);
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
    if (rank.attendanceWindow) {
      setAttendanceWindowValue(
        rank.attendanceWindow.value !== null && rank.attendanceWindow.value !== undefined
          ? String(rank.attendanceWindow.value)
          : ""
      );
      setAttendanceWindowUnit(rank.attendanceWindow.unit || "months");
    } else {
      setAttendanceWindowValue("");
      setAttendanceWindowUnit("months");
    }
    setRankNotes(rank.notes || "");
    setRankPdfDocuments(rank.pdfDocuments || []);

    const rankLayers = rank.layers
      ? { ...defaultLayers, ...rank.layers, fabric: true }
      : { ...defaultLayers };
    setLayers(rankLayers);

    scrollToDesignerTop();
  }

  function handleDeleteRank(id: string) {
    if (!window.confirm("Delete this rank?")) return;
    const updatedRanks = ranks.filter((r) => r.id !== id);
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
      void persistBeltConfig(updatedRanks, layers);
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
      attendanceWindow: rank.attendanceWindow
        ? { ...rank.attendanceWindow }
        : { value: null, unit: "months" },
      notes: rank.notes || null,
      layers: rank.layers ? { ...rank.layers } : { ...defaultLayers },
      pdfDocuments: rank.pdfDocuments ? [...rank.pdfDocuments] : [],
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
      void persistBeltConfig(updatedRanks, layers);
    }
  }

  // New Belt Rank min-classes: max 5 rows
  function addClassRequirement() {
    setRankClassRequirements((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, createEmptyRequirement()];
    });
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

  function toggleLayer(key: ToggleableLayerKey) {
    setLayers((prev) => ({
      ...prev,
      [key]: !prev[key],
      fabric: true,
    }));
  }

  async function persistBeltConfig(
    nextRanks: BeltRank[],
    nextLayers: BeltLayerConfig
  ) {
    if (!styleId) {
      console.warn("No styleId provided, skipping save");
      return;
    }

    setSavingAll(true);
    setSuccess(null);

    const payload: BeltSetup = {
      layers: { ...nextLayers, fabric: true },
      ranks: nextRanks,
    };

    // Save to localStorage as backup
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          getStorageKey(styleId),
          JSON.stringify(payload)
        );
        console.log("✓ Saved to localStorage");
      } catch (err) {
        console.error("Failed to save belt setup to localStorage:", err);
      }
    }

    // Save to database via API
    try {
      console.log("Saving belt config to database...", {
        styleId,
        ranksCount: nextRanks.length,
      });

      const res = await fetch(`/api/styles/${styleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beltConfig: payload }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to save belt setup:", {
          status: res.status,
          statusText: res.statusText,
          error: errorText,
        });
        setSuccess(
          `⚠️ Save failed (${res.status}). Data saved to browser only.`
        );
        return;
      }

      try {
        const data = await res.json();
        if (data && data.style) {
          setStyle(data.style);
          console.log("✓ Saved to database successfully");
        }
      } catch (err) {
        console.warn("Save succeeded but response was not JSON:", err);
      }

      setSuccess("✓ Belt design and ranks saved to database.");
    } catch (err) {
      console.error("Network error while saving belt setup:", err);
      setSuccess(
        "⚠️ Network error. Data saved to browser only. Check console."
      );
    } finally {
      setSavingAll(false);
    }
  }

  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check max limit
    if (rankPdfDocuments.length >= 5) {
      alert("Maximum 5 documents allowed");
      e.target.value = "";
      return;
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      alert("Only PDF files are allowed");
      e.target.value = "";
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // Remove .pdf extension from the name
        const fileName = file.name.replace(/\.pdf$/i, '');
        const newDoc = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: fileName,
          url: result
        };
        setRankPdfDocuments([...rankPdfDocuments, newDoc]);
      }
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePdfDocument(docId: string) {
    setRankPdfDocuments(rankPdfDocuments.filter(d => d.id !== docId));
  }

  async function handleSaveRank(e: React.FormEvent) {
    e.preventDefault();
    if (!rankName.trim()) return;

    const durationVal =
      durationValue.trim() === "" ? null : Number(durationValue) || 0;

    const minDuration: RankDuration = {
      value: durationVal,
      unit: durationUnit,
    };

    const attendanceWindowVal =
      attendanceWindowValue.trim() === "" ? null : Number(attendanceWindowValue) || 0;

    const attendanceWindow: AttendanceWindow = {
      value: attendanceWindowVal,
      unit: attendanceWindowUnit,
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
            attendanceWindow,
            notes: rankNotes.trim() || null,
            layers: { ...currentLayers },
            pdfDocuments: rankPdfDocuments.length > 0 ? [...rankPdfDocuments] : undefined,
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
        attendanceWindow,
        notes: rankNotes.trim() || null,
        layers: { ...currentLayers },
        pdfDocuments: rankPdfDocuments.length > 0 ? [...rankPdfDocuments] : undefined,
      };

      updatedRanks = [...ranks, newRank];
    }

    updatedRanks
      .sort((a, b) => a.order - b.order)
      .forEach((r, idx) => {
        r.order = idx + 1;
      });

    setRanks(updatedRanks);

    await persistBeltConfig(updatedRanks, currentLayers);

    resetRankForm();
    setLayers(defaultLayers);
    setRankOrder(getNextOrder(updatedRanks));
  }

  // ---------- Inline editing helpers ----------

  function updateRankField<K extends keyof BeltRank>(
    rankId: string,
    field: K,
    value: BeltRank[K]
  ) {
    setRanks((prev) =>
      prev.map((r) => (r.id === rankId ? { ...r, [field]: value } : r))
    );
  }

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

  function removeRankRequirementInline(rankId: string, reqId: string) {
    setRanks((prev) => {
      const updated = prev.map((rank) => {
        if (rank.id !== rankId) return rank;
        const classRequirements = (rank.classRequirements || []).filter(
          (req) => req.id !== reqId
        );
        return { ...rank, classRequirements };
      });
      if (styleId) {
        void persistBeltConfig(updated, layers);
      }
      return updated;
    });
  }

  function addRankRequirementInline(rankId: string) {
    setRanks((prev) =>
      prev.map((rank) => {
        if (rank.id !== rankId) return rank;
        const existing = rank.classRequirements || [];
        if (existing.length >= 5) return rank;
        return {
          ...rank,
          classRequirements: [...existing, createEmptyRequirement()],
        };
      })
    );
  }

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

  function updateRankAttendanceWindowInline(
    rankId: string,
    field: "value" | "unit",
    value: string
  ) {
    setRanks((prev) =>
      prev.map((rank) => {
        if (rank.id !== rankId) return rank;
        const current = rank.attendanceWindow || {
          value: null,
          unit: "months" as DurationUnit,
        };
        const next: AttendanceWindow =
          field === "value"
            ? {
              ...current,
              value: value.trim() === "" ? null : Number(value) || 0,
            }
            : {
              ...current,
              unit: value as DurationUnit,
            };
        return { ...rank, attendanceWindow: next };
      })
    );
  }

  function removeRankDocumentInline(rankId: string, docId: string) {
    setRanks((prev) => {
      const updated = prev.map((rank) => {
        if (rank.id !== rankId) return rank;
        const pdfDocuments = (rank.pdfDocuments || []).filter(
          (doc) => doc.id !== docId
        );
        return { ...rank, pdfDocuments: pdfDocuments.length > 0 ? pdfDocuments : undefined };
      });
      if (styleId) {
        void persistBeltConfig(updated, layers);
      }
      return updated;
    });
  }

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

  function handleInlineKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRanksInline();
      (e.target as HTMLElement).blur();
    }
  }

  // ---------- Pop-out editor helpers ----------

  function openPopup(target: PopupTarget, value: string, rect: DOMRect) {
    setPopup(target);
    setPopupValue(value || "");
    setPopupPos({
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
    setHoverBox(null);
  }

  function commitPopup() {
    if (!popup) return;
    let updatedRanks = [...ranks];

    if (popup.type === "rankName") {
      updatedRanks = updatedRanks.map((rank) =>
        rank.id === popup.rankId ? { ...rank, name: popupValue } : rank
      );
    } else if (popup.type === "rankNotes") {
      updatedRanks = updatedRanks.map((rank) =>
        rank.id === popup.rankId ? { ...rank, notes: popupValue || null } : rank
      );
    } else if (popup.type === "classLabel") {
      updatedRanks = updatedRanks.map((rank) => {
        if (rank.id !== popup.rankId) return rank;
        const classRequirements = (rank.classRequirements || []).map((req) =>
          req.id === popup.reqId ? { ...req, label: popupValue } : req
        );
        return { ...rank, classRequirements };
      });
    }

    setRanks(updatedRanks);
    if (styleId) {
      void persistBeltConfig(updatedRanks, layers);
    }
    setPopup(null);
    setPopupPos(null);
  }

  // ---------- Drag & drop ----------

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

  // ---------- Belt preview ----------

  const layerSrc: Record<string, string> = {
    outline: "/belts/outline.png",
    fabric: "/belts/fabric.png",
    twotone: "/belts/twotone.png",
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
      <div className="relative w-full overflow-hidden rounded-md border border-gray-200 bg-black/5">
        <div className={`${heightClass} relative w-full`}>
          {usedLayers.fabric && (
            <TintedLayer
              src={layerSrc.fabric}
              color={usedLayers.fabricColor}
            />
          )}
          {usedLayers.twotone && (
            <TintedLayer
              src={layerSrc.twotone}
              color={usedLayers.twotoneColor}
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
            {styleId ? (
              <>
                <h1 className="text-2xl font-bold">
                  Style:{" "}
                  <span className="font-bold">
                    {styleName || style?.name || `#${styleId}`}
                  </span>
                </h1>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold">Belt Designer</h1>
                <p className="mt-1 text-xs text-gray-500">
                  No style selected. Open this page from a style to see belt
                  settings.
                </p>
              </>
            )}
          </div>
          <Link
            href="/styles"
            className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
          >
            Back to Styles
          </Link>
        </div>

        {/* Messages */}
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

        {/* 1) Belt preview + Options box side by side */}
        <section className="rounded-lg border border-gray-200 bg-white p-4 min-w-fit">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Preview */}
            <div className="flex justify-start rounded-md border border-gray-200 bg-gray-50 p-4 min-w-fit">
              <div className="w-full max-w-[420px]">
                <BeltPreview heightClass="h-56" />
              </div>
            </div>

            {/* Options box (with inline swatches) */}
            <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 w-full min-w-fit">
              <h2 className="text-sm font-semibold text-gray-800">
                Rank Options
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {/* Rank Color (always on) */}
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-xs font-medium">
                    Rank Color
                  </span>
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
                    className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] cursor-pointer rounded-md border border-gray-300 bg-white"
                  />
                </div>

                {/* Two Tone */}
                <div className="flex items-center gap-2 h-[22px]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.twotone}
                      onChange={() => toggleLayer("twotone")}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    <span className="whitespace-nowrap text-xs font-medium">
                      Two Tone
                    </span>
                  </label>
                  {layers.twotone ? (
                    <input
                      type="color"
                      value={layers.twotoneColor}
                      onChange={(e) =>
                        setLayers((prev) => ({
                          ...prev,
                          twotoneColor: e.target.value,
                        }))
                      }
                      className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] cursor-pointer rounded-md border border-gray-300 bg-white"
                    />
                  ) : (
                    <div className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem]" />
                  )}
                </div>

                {/* Linear Stripe */}
                <div className="flex items-center gap-2 h-[22px]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.linear}
                      onChange={() => toggleLayer("linear")}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    <span className="whitespace-nowrap text-xs font-medium">
                      Linear Stripe
                    </span>
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
                      className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] cursor-pointer rounded-md border border-gray-300 bg-white"
                    />
                  )}
                </div>

                {/* Patch 1 */}
                <div className="flex items-center gap-2 h-[22px]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.patch}
                      onChange={() => toggleLayer("patch")}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    <span className="whitespace-nowrap text-xs font-medium">
                      Patch 1
                    </span>
                  </label>
                  {layers.patch ? (
                    <input
                      type="color"
                      value={layers.patchColor}
                      onChange={(e) =>
                        setLayers((prev) => ({
                          ...prev,
                          patchColor: e.target.value,
                        }))
                      }
                      className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] cursor-pointer rounded-md border border-gray-300 bg-white"
                    />
                  ) : (
                    <div className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem]" />
                  )}
                </div>

                {/* Camo */}
                <div className="flex items-center justify-between gap-2 h-[22px]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.camo}
                      onChange={() => toggleLayer("camo")}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    <span className="whitespace-nowrap text-xs font-medium">
                      Camo
                    </span>
                  </label>
                  {/* Spacer so layout stays aligned even without swatch */}
                  <div className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem]" />
                </div>

                {/* Patch 2 */}
                <div className="flex items-center gap-2 h-[22px]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layers.patch2}
                      onChange={() => toggleLayer("patch2")}
                      className="h-3 w-3 rounded border-gray-300"
                    />
                    <span className="whitespace-nowrap text-xs font-medium">
                      Patch 2
                    </span>
                  </label>
                  {layers.patch2 ? (
                    <input
                      type="color"
                      value={layers.patch2Color}
                      onChange={(e) =>
                        setLayers((prev) => ({
                          ...prev,
                          patch2Color: e.target.value,
                        }))
                      }
                      className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] cursor-pointer rounded-md border border-gray-300 bg-white"
                    />
                  ) : (
                    <div className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem]" />
                  )}
                </div>
              </div>

              {/* Stripes */}
              <div className="mt-1 space-y-1">
                <p className="text-[11px] font-semibold text-gray-800">
                  Stripes
                </p>
                <div className="grid grid-cols-5 gap-x-2.5 gap-y-2">
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
                      <div
                        key={key}
                        className="flex items-center whitespace-nowrap"
                      >
                        <label className="flex items-center gap-1 w-6">
                          <input
                            type="checkbox"
                            checked={layers[k]}
                            onChange={() => toggleLayer(k)}
                            className="h-3 w-3 shrink-0 rounded border-gray-300"
                          />
                          <span className="text-xs font-medium w-3 text-center">
                            {i + 1}
                          </span>
                        </label>
                        {layers[k] ? (
                          <input
                            type="color"
                            value={(layers as any)[colorKey]}
                            onChange={(e) =>
                              setLayers((prev) => ({
                                ...prev,
                                [colorKey]: e.target.value,
                              }))
                            }
                            className="ml-1.5 h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] shrink-0 cursor-pointer rounded-md border border-gray-300 bg-white"
                          />
                        ) : (
                          <div className="ml-1.5 h-5 w-5 min-h-[1.25rem] min-w-[1.25rem]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2) New Rank (form only, full width, no partition) */}
        <section
          id="belt-rank-editor"
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-gray-800">
            New Rank
          </h2>

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <form onSubmit={handleSaveRank} className="space-y-3">
              {/* Row 1: Order | Rank Name | Notes (3 columns) */}
              <div className="grid gap-3 grid-cols-[auto_1fr_1fr]">
                {/* Order (centered) */}
                <div className="w-11">
                  <label className="mb-1 block text-[11px] font-medium text-gray-700 text-center">
                    Order
                  </label>
                  <input
                    type="number"
                    value={rankOrder}
                    onChange={(e) =>
                      setRankOrder(Number(e.target.value) || 1)
                    }
                    className="no-spinner w-full rounded-md border border-gray-300 px-2 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    min={1}
                    placeholder="#"
                  />
                </div>

                {/* Rank Name */}
                <div className="min-w-[80px]">
                  <label className="mb-1 block text-[11px] font-medium text-gray-700">
                    Rank Name
                  </label>
                  <input
                    type="text"
                    value={rankName}
                    onChange={(e) => setRankName(e.target.value)}
                    title={rankName}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="White, Yellow, Orange..."
                    required
                  />
                </div>

                {/* Notes */}
                <div className="ml-5 min-w-[80px]">
                  <label className="mb-1 block text-[11px] font-medium text-gray-700">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={rankNotes}
                    onChange={(e) => setRankNotes(e.target.value)}
                    title={rankNotes}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Optional details about this rank"
                  />
                </div>
              </div>

              {/* Row 2: Min Classes | Min Time */}
              <div className="grid gap-3 grid-cols-[auto_1fr_1fr]" style={{ marginBottom: '-6px' }}>
                <label className="text-[11px] font-medium text-gray-700 whitespace-nowrap">
                  Min Classes (by type)
                </label>
                <div></div>
                <label className="text-[11px] font-medium text-gray-700" style={{ marginLeft: '-9px' }}>
                  Min Time
                </label>
              </div>

              <div className="space-y-2">
                {rankClassRequirements.length === 0 && (
                  <p className="text-[11px] text-gray-500">
                    No class requirements yet. Add one below if needed.
                  </p>
                )}
                <div className="space-y-2">
                  {rankClassRequirements.map((req, idx) => (
                    <div
                      key={req.id}
                      className="grid gap-3 items-center"
                      style={{ gridTemplateColumns: 'auto 1fr 1fr' }}
                    >
                      {/* Min Classes fields */}
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
                        title={
                          req.minCount === null ||
                            req.minCount === undefined
                            ? ""
                            : String(req.minCount)
                        }
                        className="no-spinner w-11 rounded-md border border-gray-300 px-1.5 py-1 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="#"
                      />
                      <div className="min-w-[80px]">
                        <select
                          value={req.label}
                          onChange={(e) =>
                            updateClassRequirement(
                              req.id,
                              "label",
                              e.target.value
                            )
                          }
                          title={req.label}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">Select class type</option>
                          {classTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Min Time fields container - only on first row */}
                      {idx === 0 ? (
                        <div className="flex items-center gap-3 ml-5 min-w-[80px]">
                          <input
                            type="number"
                            min={0}
                            value={durationValue}
                            onChange={(e) => setDurationValue(e.target.value)}
                            title={durationValue}
                            className="no-spinner w-11 rounded-md border border-gray-300 px-1.5 py-1 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="#"
                          />
                          <select
                            value={durationUnit}
                            onChange={(e) =>
                              setDurationUnit(e.target.value as DurationUnit)
                            }
                            className="w-28 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="weeks">{Number(durationValue) === 1 ? "Week" : "Weeks"}</option>
                            <option value="months">{Number(durationValue) === 1 ? "Month" : "Months"}</option>
                            <option value="years">{Number(durationValue) === 1 ? "Year" : "Years"}</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                removeClassRequirement(req.id)
                              }
                              className="text-[10px] font-black leading-none text-primary hover:text-primaryDark"
                              aria-label="Remove class requirement"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {rankClassRequirements.length < 5 && (
                  <button
                    type="button"
                    onClick={addClassRequirement}
                    className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Add Class Requirement
                  </button>
                )}
              </div>

              {/* Attendance Window */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <label className="text-[11px] font-medium text-gray-700">
                  Attendance Window
                </label>
                <p className="text-[10px] text-gray-500 -mt-1">
                  Only count classes within this time period before grading (or current date if no grading set)
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={attendanceWindowValue}
                    onChange={(e) => setAttendanceWindowValue(e.target.value)}
                    title={attendanceWindowValue}
                    className="no-spinner w-11 rounded-md border border-gray-300 px-1.5 py-1 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="#"
                  />
                  <select
                    value={attendanceWindowUnit}
                    onChange={(e) =>
                      setAttendanceWindowUnit(e.target.value as DurationUnit)
                    }
                    className="w-28 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="weeks">{Number(attendanceWindowValue) === 1 ? "Week" : "Weeks"}</option>
                    <option value="months">{Number(attendanceWindowValue) === 1 ? "Month" : "Months"}</option>
                    <option value="years">{Number(attendanceWindowValue) === 1 ? "Year" : "Years"}</option>
                  </select>
                  <span className="text-[11px] text-gray-500">before grading</span>
                </div>
              </div>

              {/* PDF Documents */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <label className="text-[11px] font-medium text-gray-700">
                  Rank Documents (PDF)
                </label>
                <p className="text-[10px] text-amber-600">
                  Upload supplementary documents for this rank (e.g., forms, waivers, handouts).
                </p>
                {rankPdfDocuments.length === 0 && (
                  <p className="text-[11px] text-gray-500">
                    No documents yet. Add one below if needed.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {rankPdfDocuments.map((doc, idx) => (
                    <div
                      key={doc.id}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 bg-gray-50"
                    >
                      <span className="text-xs text-gray-700">{doc.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePdfDocument(doc.id)}
                        className="text-[10px] font-black leading-none text-primary hover:text-primaryDark"
                        aria-label="Remove document"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {rankPdfDocuments.length < 5 && (
                  <label className="inline-block">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfUpload}
                      className="hidden"
                    />
                    <span className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer inline-block">
                      Add Document
                    </span>
                  </label>
                )}
              </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingAll}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    Save Rank
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetRankForm();
                      setLayers(defaultLayers);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    {editingId ? "Cancel" : "Clear"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* 3) Existing Ranks */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 className="text-sm font-semibold text-gray-800">
              Existing Ranks <span className="text-[11px] font-normal text-gray-500">(Click image to edit thumbnail)</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Belt
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Rank
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Order
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Min Classes
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Min Time
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Att. Window
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Notes
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Documents
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRanks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-sm text-gray-400"
                    >
                      No ranks yet. Use the New Rank section above to
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

                    const classReqCount =
                      rank.classRequirements?.length ?? 0;

                    return (
                      <tr
                        key={rank.id}
                        className={`border-t border-gray-100 hover:bg-gray-50 ${isBetweenSegment ? "bg-primary/10" : ""
                          } ${isLowerOfPair ? "border-t-4 border-primary/30" : ""
                          }`}
                        onDragOver={(e) => handleRowDragOver(e, rank.id)}
                        onDrop={() => handleDrop(rank.id)}
                      >
                        {/* Belt snapshot (drag + edit) */}
                        <td className="px-3 py-2 align-middle text-center">
                          <div className="flex w-40 select-none flex-col items-center">
                            <div
                              className="w-full cursor-pointer"
                              draggable
                              onDragStart={() => handleDragStart(rank.id)}
                              onDragEnd={handleDragEnd}
                              onClick={() => handleEditRank(rank)}
                            >
                              <BeltPreview
                                heightClass="h-20"
                                customLayers={rank.layers}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Rank Name (inline + popup if overflow) */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-900">
                          <input
                            type="text"
                            value={rank.name}
                            onChange={(e) =>
                              updateRankField(rank.id, "name", e.target.value)
                            }
                            onClick={(e) => {
                              const el = e.currentTarget;
                              if (
                                el.scrollWidth > el.clientWidth &&
                                rank.name
                              ) {
                                openPopup(
                                  { type: "rankName", rankId: rank.id },
                                  rank.name,
                                  el.getBoundingClientRect()
                                );
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (popup) return;
                              const el = e.currentTarget;
                              if (
                                el.scrollWidth <= el.clientWidth ||
                                !rank.name
                              )
                                return;
                              const rect = el.getBoundingClientRect();
                              setHoverBox({
                                value: rank.name,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom,
                              });
                            }}
                            onMouseLeave={() => {
                              if (!popup) setHoverBox(null);
                            }}
                            onKeyDown={handleInlineKeyDown}
                            className="w-full min-w-[5rem] max-w-[16rem] cursor-text rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>

                        {/* Order (inline editable; re-sorts on commit) */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-700">
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
                            className="no-spinner w-10 rounded border border-gray-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="#"
                          />
                        </td>

                        {/* Min Classes (inline editable, stacked, consistent width) */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-700">
                          {rank.classRequirements &&
                            rank.classRequirements.length > 0 ? (
                            <div className="space-y-1">
                              {rank.classRequirements.map((req, idx) => (
                                <div
                                  key={req.id}
                                  className="flex items-center gap-1"
                                >
                                  <div className="flex flex-1 items-center gap-1">
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
                                      className="no-spinner w-10 rounded border border-gray-300 px-1 py-0.5 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                                      placeholder="#"
                                    />
                                    <span className="text-[11px]">x</span>
                                    <select
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
                                      className="w-full min-w-[5rem] max-w-[14rem] rounded border border-gray-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                      <option value="">Select class type</option>
                                      {classTypes.map((type) => (
                                        <option key={type} value={type}>
                                          {type}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="ml-1 flex w-5 items-center justify-center">
                                    {idx === 0 && classReqCount < 5 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          addRankRequirementInline(rank.id)
                                        }
                                        tabIndex={-1}
                                        className="text-base font-bold leading-none text-primary hover:text-primaryDark"
                                        aria-label="Add class requirement"
                                      >
                                        +
                                      </button>
                                    )}
                                    {idx > 0 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeRankRequirementInline(
                                            rank.id,
                                            req.id
                                          )
                                        }
                                        tabIndex={-1}
                                        className="text-[10px] font-black leading-none text-primary hover:text-primaryDark"
                                        aria-label="Remove class requirement"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Min Time (inline editable) */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-700">
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
                              className="no-spinner w-10 rounded border border-gray-300 px-1 py-0.5 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="#"
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
                              <option value="weeks">{rank.minDuration?.value === 1 ? "Week" : "Weeks"}</option>
                              <option value="months">{rank.minDuration?.value === 1 ? "Month" : "Months"}</option>
                              <option value="years">{rank.minDuration?.value === 1 ? "Year" : "Years"}</option>
                            </select>
                          </div>
                        </td>

                        {/* Attendance Window (inline editable) */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-700">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={
                                rank.attendanceWindow &&
                                  rank.attendanceWindow.value !== null &&
                                  rank.attendanceWindow.value !== undefined
                                  ? rank.attendanceWindow.value
                                  : ""
                              }
                              onChange={(e) =>
                                updateRankAttendanceWindowInline(
                                  rank.id,
                                  "value",
                                  e.target.value
                                )
                              }
                              onKeyDown={handleInlineKeyDown}
                              className="no-spinner w-10 rounded border border-gray-300 px-1 py-0.5 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="#"
                            />
                            <select
                              value={
                                (rank.attendanceWindow &&
                                  rank.attendanceWindow.unit) ||
                                "months"
                              }
                              onChange={(e) =>
                                updateRankAttendanceWindowInline(
                                  rank.id,
                                  "unit",
                                  e.target.value
                                )
                              }
                              onKeyDown={handleInlineKeyDown}
                              className="rounded border border-gray-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="weeks">{rank.attendanceWindow?.value === 1 ? "Week" : "Weeks"}</option>
                              <option value="months">{rank.attendanceWindow?.value === 1 ? "Month" : "Months"}</option>
                              <option value="years">{rank.attendanceWindow?.value === 1 ? "Year" : "Years"}</option>
                            </select>
                          </div>
                        </td>

                        {/* Notes (inline + popup if overflow) */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-700">
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
                            onClick={(e) => {
                              const el = e.currentTarget;
                              if (
                                el.scrollWidth > el.clientWidth &&
                                rank.notes
                              ) {
                                openPopup(
                                  { type: "rankNotes", rankId: rank.id },
                                  rank.notes || "",
                                  el.getBoundingClientRect()
                                );
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (popup) return;
                              const el = e.currentTarget;
                              if (
                                el.scrollWidth <= el.clientWidth ||
                                !(rank.notes && rank.notes.length)
                              )
                                return;
                              const rect = el.getBoundingClientRect();
                              setHoverBox({
                                value: rank.notes || "",
                                x: rect.left + rect.width / 2,
                                y: rect.bottom,
                              });
                            }}
                            onMouseLeave={() => {
                              if (!popup) setHoverBox(null);
                            }}
                            onKeyDown={handleInlineKeyDown}
                            className="w-full min-w-[5rem] max-w-[18rem] cursor-text rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>

                        {/* Documents */}
                        <td className="px-3 py-2 align-middle text-center text-xs text-gray-700">
                          {rank.pdfDocuments && rank.pdfDocuments.length > 0 ? (
                            <div className={`space-y-1 ${rank.pdfDocuments.length > 2 ? 'max-h-[56px] overflow-y-auto pr-1' : ''}`}>
                              {rank.pdfDocuments.map((doc) => (
                                <div key={doc.id} className="flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Convert data URL to blob and open in new window
                                      const byteString = atob(doc.url.split(',')[1]);
                                      const mimeString = doc.url.split(',')[0].split(':')[1].split(';')[0];
                                      const ab = new ArrayBuffer(byteString.length);
                                      const ia = new Uint8Array(ab);
                                      for (let i = 0; i < byteString.length; i++) {
                                        ia[i] = byteString.charCodeAt(i);
                                      }
                                      const blob = new Blob([ab], { type: mimeString });
                                      const blobUrl = URL.createObjectURL(blob);
                                      window.open(blobUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[100px] text-left"
                                    title={doc.name}
                                  >
                                    {doc.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeRankDocumentInline(rank.id, doc.id)}
                                    tabIndex={-1}
                                    className="text-[10px] font-black leading-none text-primary hover:text-primaryDark ml-auto"
                                    aria-label="Remove document"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="space-x-2 px-3 py-2 text-center align-middle">
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
                            className="text-xs font-medium text-primary hover:text-primaryDark"
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
          {sortedRanks.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-3">
              <div className="ml-8">
                <button
                  type="button"
                  onClick={commitRanksInline}
                  disabled={savingAll}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {savingAll ? "Saving..." : "Save Ranks"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Hover box (only if overflow, below field) */}
      {hoverBox && !popup && (
        <div
          className="pointer-events-none fixed z-40 w-64 -translate-x-1/2 rounded-md border border-gray-300 bg-white p-3 text-xs shadow-lg"
          style={{ left: hoverBox.x, top: hoverBox.y }}
        >
          <div className="max-height-[40vh] overflow-hidden whitespace-pre-wrap break-words">
            {hoverBox.value || <span className="text-gray-400">(empty)</span>}
          </div>
        </div>
      )}

      {/* Pop-out editor overlay, below field */}
      {popup && popupPos && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10"
            onClick={commitPopup}
          />
          <div
            className="fixed z-50 w-64 -translate-x-1/2 rounded-md border border-gray-300 bg-white p-3 shadow-lg"
            style={{ left: popupPos.x, top: popupPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              ref={popupTextareaRef}
              autoFocus
              value={popupValue}
              onChange={(e) => setPopupValue(e.target.value)}
              rows={1}
              className="w-full resize-none rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ maxHeight: "50vh", overflow: "hidden" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitPopup();
                }
              }}
              onBlur={commitPopup}
            />
          </div>
        </>
      )}

      {/* Styled-JSX: remove number spinners from number fields */}
      <style jsx>{`
        input[type="number"].no-spinner::-webkit-outer-spin-button,
        input[type="number"].no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </AppLayout>
  );
}