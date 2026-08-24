"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import { generateCurriculumPdf, type GymSettings, type PdfRankTest } from "@/lib/curriculum-pdf";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Style = { id: string; name: string; ranks: { id: string; name: string; order: number }[] };
type RankTest = { id: string; name: string; rankId: string; categories: Category[] };
// Category "type" drives how the grading sheet renders each section:
//   demonstration -> per-item scoring (Techniques, Forms, Katas — the default)
//   workout       -> every item gets a stopwatch (Gatekeeper, Fitness)
//   information   -> check-only knowledge section, no time / notes inputs
type CategoryType = "demonstration" | "workout" | "information";
type Category = { id: string; name: string; sortOrder: number; visibleOnTest?: boolean; type?: CategoryType; items: Item[] };

// Optional child exercises grouped under a single workout item so one
// stopwatch + one checkmark cover the whole set (e.g. "Circuit 1" =
// pushups + squats + burpees on a single timer). Only offered inside
// workout-type categories; all fields optional except name.
type SubExercise = {
  name: string;
  reps?: number | null;
  sets?: number | null;
  duration?: string | null;
  distance?: string | null;
  // Opt-in per-child stopwatch. When true, the grading sheet gives
  // this exercise its own mini stopwatch alongside the parent's
  // overall timer -- useful when the coach wants both the total
  // circuit time AND per-station splits.
  timed?: boolean;
};

function parseSubExercises(raw: string | null | undefined): SubExercise[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((x) => x && typeof x.name === "string") : [];
  } catch {
    return [];
  }
}

type Item = {
  id: string; name: string; type: string; description?: string | null;
  sets?: number | null; rounds?: number | null; reps?: number | null;
  roundDuration?: string | null; duration?: string | null; distance?: string | null;
  timeLimit?: string | null; sortOrder: number; createdAt?: string;
  subExercises?: string | null;
};

type Row = {
  itemId: string;
  itemName: string;
  description: string;
  showTitleInPdf: boolean;
  type: string;
  sets: string;
  rounds: string;
  reps: string;
  roundDuration: string;
  duration: string;
  distance: string;
  timeLimit: string;
  timeLimitOperator: string;
  videoUrl: string;
  isNew?: boolean;
  sortOrder: number;
};

const ITEM_TYPES = [
  { value: "knowledge", label: "Knowledge" },
  { value: "technique", label: "Technique" },
  { value: "skill", label: "Skill/Combo" },
  { value: "workout", label: "Fitness" },
  { value: "sparring", label: "Sparring" },
  { value: "form", label: "Forms/Katas" },
  { value: "breaking", label: "Board Breaking" },
  { value: "other", label: "Other" },
];

/**
 * Inline editor for the sub-exercise bundle on a single workout item.
 * Purely local state until Save; on Save the parent-provided onCommit
 * flushes the array up (typically by PATCHing the RankTestItem row's
 * `subExercises` field). Empty-name rows are stripped on save.
 */
function SubExerciseEditor({
  value,
  onCommit,
}: {
  value: SubExercise[];
  onCommit: (next: SubExercise[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<SubExercise[]>(() =>
    value.length > 0 ? value : [{ name: "" }],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(idx: number, patch: Partial<SubExercise>) {
    setDraft((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setDirty(true);
  }
  function addRow() { setDraft((prev) => [...prev, { name: "" }]); setDirty(true); }
  function removeRow(idx: number) { setDraft((prev) => prev.filter((_, i) => i !== idx)); setDirty(true); }
  async function save() {
    const cleaned = draft
      .map((s) => ({
        name: s.name?.trim() || "",
        reps: s.reps ? Number(s.reps) : null,
        sets: s.sets ? Number(s.sets) : null,
        duration: s.duration?.trim() || null,
        distance: s.distance?.trim() || null,
        timed: !!s.timed,
      }))
      .filter((s) => s.name.length > 0);
    setSaving(true);
    try {
      await onCommit(cleaned);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase text-gray-500">
        Bundle exercises — one stopwatch + one checkmark covers them all
      </div>
      <div className="space-y-1">
        {draft.map((row, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={row.name}
              onChange={(e) => update(idx, { name: e.target.value })}
              placeholder="Exercise (e.g. Pushups)"
              className="flex-1 min-w-[140px] rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="number"
              min={0}
              value={row.reps ?? ""}
              onChange={(e) => update(idx, { reps: e.target.value ? Number(e.target.value) : null })}
              placeholder="Reps"
              className="w-16 rounded border border-gray-300 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
            />
            <input
              type="number"
              min={0}
              value={row.sets ?? ""}
              onChange={(e) => update(idx, { sets: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sets"
              className="w-16 rounded border border-gray-300 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
            />
            <input
              type="text"
              value={row.duration || ""}
              onChange={(e) => update(idx, { duration: e.target.value })}
              placeholder="Duration"
              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={row.distance || ""}
              onChange={(e) => update(idx, { distance: e.target.value })}
              placeholder="Distance"
              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <label
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 cursor-pointer"
              title="Give this exercise its own stopwatch on the grading sheet (in addition to the parent's overall timer)."
            >
              <input
                type="checkbox"
                checked={!!row.timed}
                onChange={(e) => update(idx, { timed: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary cursor-pointer"
              />
              Timed
            </label>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100"
              title="Remove this row"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
          title="Add another exercise to this bundle"
        >
          + Add exercise
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
          title="Save changes made to this bundle's exercises"
        >
          {saving ? "Saving..." : dirty ? "Save bundle" : "Saved"}
        </button>
      </div>
    </div>
  );
}

/**
 * Chrome for the top of a curriculum section (used by both the top
 * selected-section table and every CategorySpreadsheet below it).
 *
 * Left cluster is always in-your-face:  section name + Type dropdown.
 * Right cluster is progressive: item count + Show-on-test toggle +
 * Copy-to-Ranks (primary), with the rare/destructive stuff (Apply
 * visibility to all ranks, Delete Section, Delete from All Ranks)
 * tucked behind a ⋯ menu so the header doesn't turn into a button bar.
 *
 * Copy-to-Ranks keeps its own inline popover -- each call site owns
 * a copy flow with slightly different logic (top saves first,
 * subsections just copy), so we pass the whole trigger+popover as
 * `copyToRanksSlot`.
 */
function SectionHeader({
  name,
  sectionType,
  onChangeSectionType,
  itemCount,
  visibleOnTest,
  onToggleVisibleOnTest,
  onApplyVisibilityToAllRanks,
  onDeleteSection,
  onDeleteFromAllRanks,
  copyToRanksSlot,
}: {
  name: string;
  sectionType: CategoryType;
  onChangeSectionType: (t: CategoryType) => void | Promise<void>;
  itemCount: number;
  visibleOnTest: boolean;
  onToggleVisibleOnTest: () => void;
  onApplyVisibilityToAllRanks: () => void;
  onDeleteSection: () => void;
  onDeleteFromAllRanks: () => void;
  copyToRanksSlot: React.ReactNode;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  // Close on outside click without depending on a ref-per-usage.
  useEffect(() => {
    if (!openMenu) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest("[data-section-overflow-menu]")) setOpenMenu(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenu]);

  return (
    <div className="bg-gray-200 border-b border-gray-300 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">{name}</h3>
        <label
          className="flex items-center gap-1.5"
          title="Controls how this section renders on the grading sheet and which columns show below."
        >
          <span className="text-[10px] font-semibold uppercase text-gray-500">Type</span>
          <select
            value={sectionType}
            onChange={(e) => onChangeSectionType(e.target.value as CategoryType)}
            className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="demonstration">Demonstration</option>
            <option value="workout">Workout (stopwatch on every item)</option>
            <option value="information">Information (check only)</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">{itemCount} items</span>
        <label
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1 cursor-pointer"
          title="Show this section on the printed grading sheet for the current rank"
        >
          <input
            type="checkbox"
            checked={visibleOnTest}
            onChange={onToggleVisibleOnTest}
            className="h-3.5 w-3.5 accent-primary cursor-pointer"
          />
          <span className="text-xs font-medium text-gray-700">Show on test</span>
        </label>
        {copyToRanksSlot}
        <div className="relative" data-section-overflow-menu>
          <button
            type="button"
            onClick={() => setOpenMenu((v) => !v)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            title="More section actions"
            aria-haspopup="menu"
            aria-expanded={openMenu}
          >
            ⋯
          </button>
          {openMenu && (
            <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-gray-200 bg-white shadow-xl py-1" role="menu">
              <button
                type="button"
                onClick={() => { setOpenMenu(false); onApplyVisibilityToAllRanks(); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                Apply visibility to all ranks
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => { setOpenMenu(false); onDeleteSection(); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-red-50 hover:text-red-700"
                role="menuitem"
              >
                Delete section (this rank)
              </button>
              <button
                type="button"
                onClick={() => { setOpenMenu(false); onDeleteFromAllRanks(); }}
                className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-red-50 hover:text-red-700"
                role="menuitem"
              >
                Delete section from all ranks
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableCategoryItem({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-grab active:cursor-grabbing ${
        isActive ? "border-primary bg-primary/10 text-primary font-semibold" : "border-gray-200 bg-white text-gray-700"
      }`}
      {...attributes}
      {...listeners}
    >
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
      </svg>
      <span>{name}</span>
    </div>
  );
}

function RichInput({ defaultValue, onSave, className, onEditClick }: { defaultValue: string; onSave: (html: string) => void; className: string; onEditClick: () => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const hasRichContent = /<br|<div|<b>|<i>|<u>|\n/.test(defaultValue);
    const plainLen = defaultValue.replace(/<[^>]*>/g, "").length;
    setOverflows(hasRichContent || plainLen > 40);
  }, [defaultValue]);

  return (
    <div className="flex items-center gap-1">
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: defaultValue.replace(/<br\s*\/?>/gi, " ").replace(/<\/?div[^>]*>/gi, " ").replace(/\n/g, " ") }}
        onBlur={() => {
          const el = divRef.current;
          if (el) {
            // Preserve leading &nbsp; (they represent intentional indentation), convert others to spaces
            let html = el.innerHTML;
            // Replace &nbsp; that aren't at the start of text content with regular spaces
            html = html.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;([^\s<])/g, "\u00A0$1");
            // Keep remaining &nbsp; as non-breaking spaces for leading indentation
            html = html.replace(/&nbsp;/g, "\u00A0");
            onSave(html);
          }
        }}
        onKeyDown={e => {
          if (e.key === "b" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("bold"); }
          if (e.key === "i" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("italic"); }
          if (e.key === "u" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("underline"); }
          if (e.key === "Enter") { e.preventDefault(); /* single line */ }
        }}
        className={`${className} overflow-hidden whitespace-nowrap`}
        style={{ height: "28px", lineHeight: "28px", display: "flex", alignItems: "center" }}
      />
      {overflows && (
        <button type="button" onClick={onEditClick} className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark" title="Rename this section">Edit</button>
      )}
    </div>
  );
}

function CategorySpreadsheet({ categoryId, categoryName, sectionType, onChangeSectionType, rankTests, selectedStyleId, selectedRankId, selectedCategoryId, onReload, getCategoryType, onDeleteCategory, onDeleteFromAllRanks, ranks }: {
  categoryId: string; categoryName: string;
  sectionType: CategoryType; onChangeSectionType: (t: CategoryType) => Promise<void>;
  rankTests: RankTest[];
  selectedStyleId: string; selectedRankId: string; selectedCategoryId: string;
  onReload: () => Promise<void>; getCategoryType: () => string; onDeleteCategory: () => void; onDeleteFromAllRanks: () => void;
  ranks: { id: string; name: string; order: number }[];
}) {
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemSets, setNewItemSets] = useState("");
  const [newItemRounds, setNewItemRounds] = useState("");
  const [newItemReps, setNewItemReps] = useState("");
  const [newItemRoundDuration, setNewItemRoundDuration] = useState("");
  const [newItemDuration, setNewItemDuration] = useState("");
  const [newItemDistance, setNewItemDistance] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  // Which items currently have their sub-exercise bundle editor open.
  const [expandedBundle, setExpandedBundle] = useState<Record<string, boolean>>({});
  const [editPopup, setEditPopup] = useState<{ itemId: string; value: string } | null>(null);
  const popupEditorRef = useRef<HTMLDivElement>(null);

  // Capture-phase keydown handler at document level. Attaching on the element
  // alone did not intercept Tab in time (focus jumped to the Save button).
  // Capture phase + document target guarantees this runs before any default
  // focus behavior or modal focus trap. We also use a focusin guard as a
  // fallback: if preventDefault somehow doesn't stop the focus move (rare
  // browser quirk), focus jumps back to the editor immediately.
  const tabJustHandledRef = useRef(false);
  // Autofocus the editor when the popup opens so keystrokes (including Tab)
  // route through it from the start.
  useEffect(() => {
    if (!editPopup) return;
    const t = setTimeout(() => popupEditorRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [editPopup]);
  useEffect(() => {
    if (!editPopup) return;
    function handleKeyDown(e: KeyboardEvent) {
      const el = popupEditorRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (!target || (target !== el && !el.contains(target))) return;

      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        tabJustHandledRef.current = true;
        setTimeout(() => { tabJustHandledRef.current = false; }, 50);
        const TAB_SIZE = 4;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        let col = 0;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          const lineStart = text.lastIndexOf("\n", Math.max(0, range.startOffset - 1)) + 1;
          col = range.startOffset - lineStart;
        }

        if (e.shiftKey) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || "";
            const targetRemove = col === 0 ? 0 : ((col - 1) % TAB_SIZE) + 1;
            let actuallyRemove = 0;
            for (let i = 0; i < targetRemove; i++) {
              const ch = text.charAt(range.startOffset - 1 - i);
              if (ch === " " || ch === " ") actuallyRemove++;
              else break;
            }
            if (actuallyRemove > 0) {
              const before = text.slice(0, range.startOffset - actuallyRemove);
              const after = text.slice(range.startOffset);
              node.textContent = before + after;
              const newRange = document.createRange();
              newRange.setStart(node, before.length);
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }
          }
        } else {
          const spacesNeeded = TAB_SIZE - (col % TAB_SIZE);
          document.execCommand("insertHTML", false, "&nbsp;".repeat(spacesNeeded));
        }
        return;
      }
      if ((e.key === "b" || e.key === "i" || e.key === "u") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.execCommand(e.key === "b" ? "bold" : e.key === "i" ? "italic" : "underline");
      }
    }
    function handleFocusIn(e: FocusEvent) {
      if (!tabJustHandledRef.current) return;
      const el = popupEditorRef.current;
      if (!el) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (t === el || el.contains(t)) return;
      // Focus moved out of the editor right after a Tab — push it back.
      el.focus();
    }
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [editPopup]);
  const [copying, setCopying] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copySelectedRanks, setCopySelectedRanks] = useState<Set<string>>(new Set());
  const [copyReplace, setCopyReplace] = useState(false);

  async function copyToRanks() {
    if (copySelectedRanks.size === 0) { alert("Select at least one rank"); return; }
    setShowCopyMenu(false);
    setCopying(true);
    const mode = copyReplace ? "replace" : "skip";
    try {
      const targetRanks = ranks.filter(r => copySelectedRanks.has(r.id));
      await Promise.all(targetRanks.map(async (rank) => {
        const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`);
        if (!res.ok) return;
        const d = await res.json();
        const tests: RankTest[] = d.rankTests || d.tests || [];
        if (tests.length === 0) return;
        const otherTestId = tests[0].id;
        let otherCat = tests.flatMap(t => t.categories).find(c => c.name.trim().toLowerCase() === categoryName.trim().toLowerCase());
        // Create category on this rank if it doesn't exist
        if (!otherCat) {
          const createRes = await fetch(`/api/rank-tests/${otherTestId}/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: categoryName }),
          });
          if (!createRes.ok) return;
          const createData = await createRes.json();
          otherCat = createData.category;
          if (!otherCat) return;
        }
        // Skip if mode is "skip" and category already has items
        if (mode === "skip" && otherCat.items && otherCat.items.length > 0) return;
        // Delete existing items if replacing
        if (otherCat.items && otherCat.items.length > 0) {
          for (const item of otherCat.items) {
            await fetch(`/api/rank-tests/${otherTestId}/items?itemId=${item.id}`, { method: "DELETE" });
          }
        }
        // Copy current items
        for (const item of items) {
          await fetch(`/api/rank-tests/${otherTestId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId: otherCat.id,
              name: item.name,
              description: item.description || null,
              type: (item as Record<string, unknown>).type as string || getCategoryType(),
              showTitleInPdf: (item as Record<string, unknown>).showTitleInPdf !== false,
              sets: item.sets || null,
              rounds: item.rounds || null,
              reps: item.reps || null,
              roundDuration: item.roundDuration || null,
              duration: item.duration || null,
              distance: item.distance || null,
              timeLimit: item.timeLimit || null,
              timeLimitOperator: (item as Record<string, unknown>).timeLimitOperator || null,
              videoUrl: (item as Record<string, unknown>).videoUrl || null,
              sortOrder: item.sortOrder,
            }),
          });
        }
      }));
      alert(`"${categoryName}" copied to ${targetRanks.length} rank${targetRanks.length !== 1 ? "s" : ""}.`);
    } catch { alert("Failed to copy to all ranks"); }
    finally { setCopying(false); }
  }

  let items: Item[] = [];
  let testId = "";
  let visibleOnTest = true;
  for (const test of rankTests) {
    const c = test.categories.find(tc => tc.id === categoryId);
    if (c) {
      items = [...c.items].sort((a, b) => a.sortOrder - b.sortOrder);
      testId = test.id;
      visibleOnTest = c.visibleOnTest !== false;
    }
  }

  // Flip the "show on test" flag for this rank only.
  async function toggleVisibleOnThisRank() {
    if (!testId) return;
    const next = !visibleOnTest;
    try {
      await fetch(`/api/rank-tests/${testId}/categories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, visibleOnTest: next }),
      });
      await onReload();
    } catch {
      alert("Failed to update visibility");
    }
  }

  // Apply the CURRENT visibility setting to every same-named category across
  // every rank in this style. Previously this only saw `rankTests` (the
  // current rank's tests), so "all ranks" silently only affected this rank.
  // Now we fetch each other rank's tests and PATCH every match.
  async function applyVisibilityToAllRanks() {
    const wantVisible = visibleOnTest;
    try {
      const targets: { testId: string; categoryId: string }[] = [];
      // Current rank matches (already loaded).
      for (const t of rankTests) {
        for (const c of t.categories) {
          if (c.name.trim().toLowerCase() === categoryName.trim().toLowerCase()) {
            targets.push({ testId: t.id, categoryId: c.id });
          }
        }
      }
      // Other ranks — fetch and add matches.
      const otherRanks = ranks.filter((r) => r.id !== selectedRankId);
      const otherResults = await Promise.all(
        otherRanks.map((r) =>
          fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${r.id}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        ),
      );
      for (const data of otherResults) {
        if (!data) continue;
        const tests: RankTest[] = data.rankTests || data.tests || [];
        for (const t of tests) {
          for (const c of t.categories) {
            if (c.name.trim().toLowerCase() === categoryName.trim().toLowerCase()) {
              targets.push({ testId: t.id, categoryId: c.id });
            }
          }
        }
      }
      await Promise.all(
        targets.map((t) =>
          fetch(`/api/rank-tests/${t.testId}/categories`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categoryId: t.categoryId, visibleOnTest: wantVisible }),
          }),
        ),
      );
      await onReload();
    } catch {
      alert("Failed to apply to all ranks");
    }
  }

  async function addItem() {
    if (!newItemDesc.trim() || !testId) return;
    setAddingItem(true);
    const descText = newItemDesc.trimEnd();
    const autoName = descText.replace(/<[^>]*>/g, "").split("\n")[0].substring(0, 100).trim();
    await fetch(`/api/rank-tests/${testId}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId, name: autoName, description: descText || null, type: getCategoryType(),
        showTitleInPdf: false,
        sets: newItemSets ? parseInt(newItemSets) : null,
        rounds: newItemRounds ? parseInt(newItemRounds) : null,
        reps: newItemReps ? parseInt(newItemReps) : null,
        roundDuration: newItemRoundDuration || null,
        duration: newItemDuration || null,
        distance: newItemDistance || null,
      }),
    });
    setNewItemName(""); setNewItemDesc(""); setNewItemSets(""); setNewItemRounds("");
    setNewItemReps(""); setNewItemRoundDuration(""); setNewItemDuration(""); setNewItemDistance("");
    setAddingItem(false);
    await onReload();
  }

  async function handleAddRowPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text");
    const html = e.clipboardData.getData("text/html");
    if (!text || !testId) return;

    // Check if this is multiple rows from a spreadsheet
    const isMultiRow = html && (html.match(/<tr/g) || []).length > 1;
    const hasNewlines = text.includes("\n");

    if (!isMultiRow && !hasNewlines) return; // single value, let default handle

    // Check if it's a single cell with newlines (not multiple rows)
    const isSingleCell = html && (html.match(/<td/g) || []).length <= 1;
    if (isSingleCell && !isMultiRow) return; // single cell with newlines, let default handle

    e.preventDefault();
    setAddingItem(true);

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    for (const line of lines) {
      const cells = line.split("\t");
      const desc = cells[0]?.trimEnd();
      if (!desc?.trim()) continue;
      const autoName = desc.replace(/<[^>]*>/g, "").split("\n")[0].substring(0, 100).trim();
      await fetch(`/api/rank-tests/${testId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId, name: autoName, description: desc, type: getCategoryType(),
          showTitleInPdf: false,
        }),
      });
    }

    setAddingItem(false);
    await onReload();
  }

  async function updateField(itemId: string, field: string, value: unknown) {
    await fetch(`/api/rank-tests/${testId}/items`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, [field]: value }),
    });
  }

  async function deleteItem(itemId: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/rank-tests/${testId}/items?itemId=${itemId}`, { method: "DELETE" });
    await onReload();
  }

  return (
    <>
    <div className="rounded-lg border border-gray-200 bg-gray-100 overflow-x-auto">
      <SectionHeader
        name={categoryName}
        sectionType={sectionType}
        onChangeSectionType={onChangeSectionType}
        itemCount={items.length}
        visibleOnTest={visibleOnTest}
        onToggleVisibleOnTest={toggleVisibleOnThisRank}
        onApplyVisibilityToAllRanks={applyVisibilityToAllRanks}
        onDeleteSection={onDeleteCategory}
        onDeleteFromAllRanks={onDeleteFromAllRanks}
        copyToRanksSlot={
          <div className="relative">
            <button onClick={() => setShowCopyMenu(!showCopyMenu)} disabled={copying || items.length === 0} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50" title="Copy every item in this section into other ranks of the same style">
              {copying ? "Copying..." : "Copy to Ranks"}
            </button>
            {showCopyMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-3 space-y-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase">Select ranks</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {ranks.filter(r => r.id !== selectedRankId).map(r => (
                    <label key={r.id} className={`flex items-center gap-2 text-xs cursor-pointer p-1 rounded ${copySelectedRanks.has(r.id) ? "bg-primary/10" : "hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={copySelectedRanks.has(r.id)} onChange={() => setCopySelectedRanks(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="accent-primary" />
                      {r.name}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[10px] text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={copyReplace} onChange={e => setCopyReplace(e.target.checked)} className="accent-primary" />
                  Replace existing items
                </label>
                <div className="flex gap-1 pt-1 border-t border-gray-100">
                  <button onClick={() => setCopySelectedRanks(new Set(ranks.filter(r => r.id !== selectedRankId).map(r => r.id)))} className="text-[10px] text-primary hover:underline" title="Select every rank in this style">All</button>
                  <button onClick={() => setCopySelectedRanks(new Set())} className="text-[10px] text-gray-400 hover:underline" title="Clear the rank selection">None</button>
                  <div className="flex-1" />
                  <button onClick={copyToRanks} disabled={copySelectedRanks.size === 0} className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark disabled:opacity-50" title="Copy this section's items into the ranks checked above">Copy</button>
                  <button onClick={() => setShowCopyMenu(false)} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50" title="Close without copying">Cancel</button>
                </div>
              </div>
            )}
          </div>
        }
      />
      {/* Workout-only performance columns (reps / sets / min-per-round /
          rounds / duration / distance / time limit). Demonstration and
          Information sections just need item info + video, so we hide
          the whole block for them -- both headers and cells. */}
      <table className="w-full text-sm">
        <thead className="bg-gray-100 border-b border-gray-300">
          <tr>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500" style={{ width: "100%", minWidth: "250px" }}>Item Information</th>
            {sectionType !== "information" && (
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-24">Video</th>
            )}
            {sectionType === "workout" && <>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Reps</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Sets</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Min/Rd</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Rnds</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Duration</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Distance</th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-28">Time Limit</th>
            </>}
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-32"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const subs = parseSubExercises(item.subExercises);
            const bundleOpen = !!expandedBundle[item.id];
            return (
            <React.Fragment key={item.id}>
            <tr className="border-t border-gray-200 hover:bg-gray-200">
              <td className="px-2 py-1 overflow-hidden" style={{ maxWidth: 0 }}>
                <RichInput
                  defaultValue={item.description || item.name}
                  onSave={html => { updateField(item.id, "description", html || null); updateField(item.id, "name", html?.replace(/<[^>]*>/g, "").split("\n")[0].substring(0, 100).trim() || ""); }}
                  className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                  onEditClick={() => setEditPopup({ itemId: item.id, value: item.description || "" })}
                />
                {sectionType === "workout" && subs.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-1">
                    <span className="text-[9px] font-semibold uppercase text-gray-400">Bundle</span>
                    {subs.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setExpandedBundle((prev) => ({ ...prev, [item.id]: true }))}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                        title={s.timed ? "Timed sub-exercise — click to edit bundle" : "Click to edit bundle"}
                      >
                        {s.timed && <span aria-hidden="true">⏱</span>}
                        <span>{s.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </td>
              {sectionType !== "information" && (
                <td className="px-2 py-1"><input type="text" defaultValue={(item as Record<string, unknown>).videoUrl as string || ""} onBlur={e => updateField(item.id, "videoUrl", e.target.value || null)} placeholder="URL" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              )}
              {sectionType === "workout" && <>
                <td className="px-2 py-1"><input type="number" min={0} defaultValue={item.reps ?? ""} onBlur={e => updateField(item.id, "reps", e.target.value ? parseInt(e.target.value) : null)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
                <td className="px-2 py-1"><input type="number" min={0} defaultValue={item.sets ?? ""} onBlur={e => updateField(item.id, "sets", e.target.value ? parseInt(e.target.value) : null)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
                <td className="px-2 py-1"><input type="text" defaultValue={item.roundDuration || ""} onBlur={e => updateField(item.id, "roundDuration", e.target.value || null)} placeholder="e.g. 3m" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
                <td className="px-2 py-1"><input type="number" min={0} defaultValue={item.rounds ?? ""} onBlur={e => updateField(item.id, "rounds", e.target.value ? parseInt(e.target.value) : null)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
                <td className="px-2 py-1"><input type="text" defaultValue={item.duration || ""} onBlur={e => updateField(item.id, "duration", e.target.value || null)} placeholder="e.g. 2 min" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
                <td className="px-2 py-1"><input type="text" defaultValue={item.distance || ""} onBlur={e => updateField(item.id, "distance", e.target.value || null)} placeholder="e.g. 1 mi" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
                <td className="px-2 py-1">
                  <div className="flex items-center gap-0.5">
                    <select defaultValue={(item as Record<string, unknown>).timeLimitOperator as string || "lte"} onBlur={e => updateField(item.id, "timeLimitOperator", e.target.value)} className="w-10 rounded border border-gray-300 px-0.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary bg-white">
                      <option value="lte">≤</option>
                      <option value="lt">&lt;</option>
                      <option value="eq">=</option>
                      <option value="gte">≥</option>
                      <option value="gt">&gt;</option>
                    </select>
                    <input type="text" defaultValue={item.timeLimit || ""} onBlur={e => updateField(item.id, "timeLimit", e.target.value || null)} placeholder="e.g. 1:30" className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                  </div>
                </td>
              </>}
              <td className="px-2 py-1 text-center">
                <div className="flex items-center justify-center gap-1">
                  {sectionType === "workout" && (
                    <button
                      onClick={() => setExpandedBundle((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-primaryDark"
                      title="Group several exercises under this item; one stopwatch and one checkmark cover them all."
                    >
                      {bundleOpen ? "Hide" : subs.length > 0 ? `Bundle (${subs.length})` : "Bundle"}
                    </button>
                  )}
                  <button onClick={() => deleteItem(item.id, item.name)} className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50" title="Remove this item from this rank's curriculum">Delete</button>
                </div>
              </td>
            </tr>
            {sectionType === "workout" && bundleOpen && (
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={10} className="px-4 py-3">
                  <SubExerciseEditor
                    value={subs}
                    onCommit={async (next) => {
                      await updateField(item.id, "subExercises", next);
                      // Refresh so the Bundle button flips to
                      // "Bundle (N)" with the new count and the
                      // grading sheet picks up the change.
                      await onReload();
                    }}
                  />
                </td>
              </tr>
            )}
            </React.Fragment>
            );
          })}
          {/* Add new row */}
          <tr className="border-t border-gray-200 bg-gray-100">
            <td className="px-2 py-1 overflow-hidden" style={{ maxWidth: 0 }}><input type="text" value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addItem(); }} onPaste={handleAddRowPaste} placeholder="Type to add..." className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
            {sectionType !== "information" && (
              <td className="px-2 py-1"><input type="text" value="" onChange={() => {}} placeholder="URL" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
            )}
            {sectionType === "workout" && <>
              <td className="px-2 py-1"><input type="number" min={0} value={newItemReps} onChange={e => setNewItemReps(e.target.value)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              <td className="px-2 py-1"><input type="number" min={0} value={newItemSets} onChange={e => setNewItemSets(e.target.value)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              <td className="px-2 py-1"><input type="text" value={newItemRoundDuration} onChange={e => setNewItemRoundDuration(e.target.value)} placeholder="e.g. 3m" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              <td className="px-2 py-1"><input type="number" min={0} value={newItemRounds} onChange={e => setNewItemRounds(e.target.value)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              <td className="px-2 py-1"><input type="text" value={newItemDuration} onChange={e => setNewItemDuration(e.target.value)} placeholder="e.g. 2 min" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              <td className="px-2 py-1"><input type="text" value={newItemDistance} onChange={e => setNewItemDistance(e.target.value)} placeholder="e.g. 1 mi" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
              <td className="px-2 py-1">
                <div className="flex items-center gap-0.5">
                  <select className="w-10 rounded border border-gray-300 px-0.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary bg-white">
                    <option value="lte">≤</option>
                    <option value="lt">&lt;</option>
                    <option value="eq">=</option>
                    <option value="gte">≥</option>
                    <option value="gt">&gt;</option>
                  </select>
                  <input type="text" placeholder="e.g. 1:30" className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                </div>
              </td>
            </>}
            <td className="px-2 py-1 text-center">
              {newItemDesc.trim() && <button onClick={addItem} disabled={addingItem} className="text-primary hover:text-primaryDark text-xs font-semibold">+</button>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* Description edit popup — close only via Save / Cancel / X, not backdrop click,
        so dragging the resize corner can't accidentally dismiss the popup. */}
    {editPopup && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div
          className="rounded-lg bg-white shadow-xl flex flex-col overflow-hidden"
          style={{ width: "min(640px, 95vw)", height: "min(560px, 85vh)", minWidth: 320, minHeight: 280, maxWidth: "95vw", maxHeight: "90vh", resize: "both" }}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">Edit Description <span className="text-gray-400 font-normal text-[10px]">(drag corner to resize)</span></h2>
            <button tabIndex={-1} onClick={async () => { await updateField(editPopup.itemId, "description", editPopup.value); setEditPopup(null); await onReload(); }} className="text-gray-400 hover:text-gray-600" title="Save and close">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="border-b border-gray-200 px-5 py-2 flex items-center gap-1">
            <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); document.execCommand("bold"); }} className="rounded px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100" title="Bold">B</button>
            <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); document.execCommand("italic"); }} className="rounded px-2 py-1 text-xs italic text-gray-700 hover:bg-gray-100" title="Italic">I</button>
            <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); document.execCommand("underline"); }} className="rounded px-2 py-1 text-xs underline text-gray-700 hover:bg-gray-100" title="Underline">U</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
             <div
               ref={popupEditorRef}
               id="cat-popup-editor"
               contentEditable
               suppressContentEditableWarning
               dangerouslySetInnerHTML={{ __html: editPopup.value.replace(/\n/g, "<br>") }}
               style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12, lineHeight: 1.4 }} className="w-full h-full min-h-[200px] rounded-md border border-gray-300 px-3 py-2 whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-primary"
             />
          </div>
          <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
            <button tabIndex={-1} onClick={async () => { const el = document.getElementById("cat-popup-editor"); if (el) await updateField(editPopup.itemId, "description", el.innerHTML.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0")); setEditPopup(null); await onReload(); }} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark" title="Save the edited description">Save</button>
            <button tabIndex={-1} onClick={() => setEditPopup(null)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50" title="Close without saving changes">Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function CurriculumV2Page() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [ranks, setRanks] = useState<{ id: string; name: string; order: number }[]>([]);
  const [selectedRankId, setSelectedRankId] = useState("");
  const [rankTests, setRankTests] = useState<RankTest[]>([]);
  const [allCategories, setAllCategories] = useState<{ id: string; name: string; testId: string }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  // Which top-table items have their sub-exercise editor open.
  const [topExpandedBundle, setTopExpandedBundle] = useState<Record<string, boolean>>({});
  const [popupCell, setPopupCell] = useState<{ rowIdx: number; field: keyof Row; value: string } | null>(null);
  const popupCellEditorRef = useRef<HTMLDivElement>(null);
  const popupCellTabHandledRef = useRef(false);

  // Autofocus the "Edit Content" popup editor when it opens
  useEffect(() => {
    if (!popupCell) return;
    const t = setTimeout(() => popupCellEditorRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [popupCell]);

  // Capture-phase keydown for the "Edit Content" popup: Tab inserts spaces to
  // the next tab stop, Cmd/Ctrl+B/I/U toggle formatting. focusin backup snaps
  // focus back if the browser still moves it.
  useEffect(() => {
    if (!popupCell) return;
    function handleKeyDown(e: KeyboardEvent) {
      const el = popupCellEditorRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (!target || (target !== el && !el.contains(target))) return;

      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        popupCellTabHandledRef.current = true;
        setTimeout(() => { popupCellTabHandledRef.current = false; }, 50);
        const TAB_SIZE = 4;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        let col = 0;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || "";
          const lineStart = text.lastIndexOf("\n", Math.max(0, range.startOffset - 1)) + 1;
          col = range.startOffset - lineStart;
        }
        if (e.shiftKey) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || "";
            const targetRemove = col === 0 ? 0 : ((col - 1) % TAB_SIZE) + 1;
            let actuallyRemove = 0;
            for (let i = 0; i < targetRemove; i++) {
              const ch = text.charAt(range.startOffset - 1 - i);
              if (ch === " " || ch === " ") actuallyRemove++;
              else break;
            }
            if (actuallyRemove > 0) {
              const before = text.slice(0, range.startOffset - actuallyRemove);
              const after = text.slice(range.startOffset);
              node.textContent = before + after;
              const newRange = document.createRange();
              newRange.setStart(node, before.length);
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
            }
          }
        } else {
          const spacesNeeded = TAB_SIZE - (col % TAB_SIZE);
          document.execCommand("insertHTML", false, "&nbsp;".repeat(spacesNeeded));
        }
        return;
      }
      if ((e.key === "b" || e.key === "i" || e.key === "u") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        document.execCommand(e.key === "b" ? "bold" : e.key === "i" ? "italic" : "underline");
      }
    }
    function handleFocusIn(e: FocusEvent) {
      if (!popupCellTabHandledRef.current) return;
      const el = popupCellEditorRef.current;
      if (!el) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (t === el || el.contains(t)) return;
      el.focus();
    }
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [popupCell]);

  const [showAddCategory, setShowAddCategory] = useState(false);
  // Header split-button + selector-strip overflow menu open state, plus
  // one shared outside-click closer -- same pattern SectionHeader uses.
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  useEffect(() => {
    if (!showSaveMenu && !showCategoryMenu) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest("[data-save-menu]")) setShowSaveMenu(false);
      if (!t || !t.closest("[data-category-menu]")) setShowCategoryMenu(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showSaveMenu, showCategoryMenu]);
  const [styleCatNames, setStyleCatNames] = useState<string[]>([]);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderList, setReorderList] = useState<{ id: string; name: string }[]>([]);
  const [savingReorder, setSavingReorder] = useState(false);
  const [reorderThisRankOnly, setReorderThisRankOnly] = useState(false);
  const [lockedRankIds, setLockedRankIds] = useState<Set<string>>(new Set());

  // Load locked ranks from localStorage when style changes
  useEffect(() => {
    if (!selectedStyleId) return;
    try {
      const stored = localStorage.getItem(`locked-reorder-${selectedStyleId}`);
      if (stored) setLockedRankIds(new Set(JSON.parse(stored)));
      else setLockedRankIds(new Set());
    } catch { setLockedRankIds(new Set()); }
  }, [selectedStyleId]);

  // Save locked ranks to localStorage
  function updateLockedRanks(newSet: Set<string>) {
    setLockedRankIds(newSet);
    if (selectedStyleId) {
      localStorage.setItem(`locked-reorder-${selectedStyleId}`, JSON.stringify([...newSet]));
    }
  }
  const tableRef = useRef<HTMLTableElement>(null);
  const [disclaimer, setDisclaimer] = useState("Coach has final say for promotion and not everyone will promote every ceremony. Promotion depends on the following:\nattendance, skill recollection, good behavior, effort and fitness");
  const [disclaimerSaving, setDisclaimerSaving] = useState(false);
  const [gymSettings, setGymSettings] = useState<GymSettings>({
    name: "Martial Arts School", address: "", city: "", state: "", zipCode: "", phone: "", email: "", website: "", logo: "",
  });

  // Load styles + gym settings
  useEffect(() => {
    fetch("/api/styles").then(r => r.json()).then(d => {
      setStyles(d.styles || []);
      if (d.styles?.length > 0) setSelectedStyleId(d.styles[0].id);
    }).catch(() => {}).finally(() => setLoading(false));

    fetch("/api/settings").then(r => r.json()).then(d => {
      if (d?.settings && Array.isArray(d.settings)) {
        const get = (key: string) => d.settings.find((s: { key: string; value: string }) => s.key === key)?.value || "";
        setGymSettings({
          name: get("gymName") || "Martial Arts School",
          address: get("gymAddress"),
          city: get("gymCity"),
          state: get("gymState"),
          zipCode: get("gymZipCode"),
          phone: get("gymPhone"),
          email: get("gymEmail"),
          website: get("gymWebsite"),
          logo: get("gymLogo"),
        });
      }
    }).catch(() => {});
  }, []);

  // Update ranks and load disclaimer when style changes
  useEffect(() => {
    const style = styles.find(s => s.id === selectedStyleId);
    setRanks(style?.ranks || []);
    if (style?.ranks?.length) setSelectedRankId(style.ranks[0].id);
    else setSelectedRankId("");

    // Load disclaimer and all category names for this style
    if (selectedStyleId) {
      fetch(`/api/styles/${selectedStyleId}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.style?.curriculumDisclaimer !== undefined) {
          setDisclaimer(d.style.curriculumDisclaimer || "");
        } else {
          setDisclaimer("Coach has final say for promotion and not everyone will promote every ceremony. Promotion depends on the following:\nattendance, skill recollection, good behavior, effort and fitness");
        }
      }).catch(() => {});

      // Fetch ALL category names across ALL ranks in this style (once per style change)
      const style = styles.find(s => s.id === selectedStyleId);
      if (style?.ranks?.length) {
        Promise.all(
          style.ranks.map(r => fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${r.id}`).then(res => res.ok ? res.json() : null).catch(() => null))
        ).then(results => {
          const names = new Set<string>();
          for (const d of results) {
            if (!d) continue;
            const tests: RankTest[] = d.rankTests || d.tests || [];
            for (const t of tests) for (const c of t.categories) names.add(c.name);
          }
          setStyleCatNames([...names]);
        }).catch(() => {});
      }
    }
  }, [selectedStyleId, styles]);

  // Load rank tests when rank changes
  useEffect(() => {
    if (!selectedRankId || !selectedStyleId) { setAllCategories([]); setRows([]); return; }
    let cancelled = false;

    async function loadOrCreate() {
      if (cancelled) return;
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (!res.ok) return;
      const d = await res.json();
      let tests: RankTest[] = d.rankTests || d.tests || [];

      // Auto-create structure with default categories if needed
      const defaultCats = ["Knowledge", "Techniques", "Combos", "Fitness", "Sparring", "Forms/Katas", "Board Breaking"];

      // Create test if none exists
      if (tests.length === 0) {
        const rank = ranks.find(r => r.id === selectedRankId);
        const testRes = await fetch("/api/rank-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${rank?.name || "Rank"} Curriculum`, rankId: selectedRankId, styleId: selectedStyleId }),
        });
        if (testRes.ok) {
          const testData = await testRes.json();
          const testId = testData.rankTest?.id || testData.test?.id;
          if (testId) {
            for (let i = 0; i < defaultCats.length; i++) {
              await fetch(`/api/rank-tests/${testId}/categories`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: defaultCats[i], sortOrder: i }),
              });
            }
          }
          const res2 = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
          if (res2.ok) { const d2 = await res2.json(); tests = d2.rankTests || d2.tests || []; }
        }
      }

      // Ensure default categories exist on current rank
      if (tests.length > 0) {
        const testId = tests[0].id;
        const existingCatNames = new Set(tests.flatMap(t => t.categories.map(c => c.name.trim().toLowerCase())));
        let added = false;

        for (let i = 0; i < defaultCats.length; i++) {
          if (!existingCatNames.has(defaultCats[i].toLowerCase())) {
            await fetch(`/api/rank-tests/${testId}/categories`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: defaultCats[i], sortOrder: i }),
            });
            added = true;
          }
        }

        if (added) {
          const res2 = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
          if (res2.ok) { const d2 = await res2.json(); tests = d2.rankTests || d2.tests || []; }
        }
      }

      // Use cached style-wide category names (loaded when style changes)

      if (cancelled) return;
      setRankTests(tests);

      // Build category list: current rank's categories + any from other ranks not yet on this rank
      const cats = buildCategoryList(tests);
      const currentNames = new Set(cats.map(c => c.name.trim().toLowerCase()));
      for (const name of styleCatNames) {
        if (!currentNames.has(name.trim().toLowerCase())) {
          cats.push({ id: `virtual-${name}`, name, testId: tests[0]?.id || "" });
          currentNames.add(name.trim().toLowerCase());
        }
      }
      setAllCategories(cats);

      // Auto-select first category
      if (cats.length > 0 && !cats.find(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(cats[0].id);
        buildRowsForCategory(tests, cats[0].id);
      } else if (cats.length === 0) {
        setSelectedCategoryId("");
        setRows([]);
      } else {
        buildRowsForCategory(tests, selectedCategoryId);
      }
    }

    loadOrCreate().catch(() => {});
    return () => { cancelled = true; };
  }, [selectedRankId, selectedStyleId, ranks]);

  // When styleCatNames loads/changes, merge virtual categories into dropdown
  useEffect(() => {
    if (styleCatNames.length === 0 || rankTests.length === 0) return;
    setAllCategories(prev => {
      const currentNames = new Set(prev.map(c => c.name.trim().toLowerCase()));
      let changed = false;
      const updated = [...prev];
      for (const name of styleCatNames) {
        if (!currentNames.has(name.trim().toLowerCase())) {
          updated.push({ id: `virtual-${name}`, name, testId: rankTests[0]?.id || "" });
          currentNames.add(name.trim().toLowerCase());
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }, [styleCatNames, rankTests]);

  // Rebuild rows when category changes — create category on-demand if virtual
  useEffect(() => {
    if (selectedCategoryId?.startsWith("virtual-") && rankTests.length > 0) {
      const catName = allCategories.find(c => c.id === selectedCategoryId)?.name;
      if (catName) {
        const testId = rankTests[0].id;
        fetch(`/api/rank-tests/${testId}/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: catName }),
        }).then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            // Reload rank tests to get the real category ID
            const r = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
            if (r.ok) {
              const d = await r.json();
              const tests = d.rankTests || d.tests || [];
              setRankTests(tests);
              const cats = buildCategoryList(tests);
              // Re-add virtual cats from allCategories
              const currentNames = new Set(cats.map(c => c.name.trim().toLowerCase()));
              for (const c of allCategories) {
                if (c.id.startsWith("virtual-") && !currentNames.has(c.name.trim().toLowerCase())) {
                  cats.push(c);
                  currentNames.add(c.name.trim().toLowerCase());
                }
              }
              setAllCategories(cats);
              // Select the newly created real category
              const realCat = cats.find(c => !c.id.startsWith("virtual-") && c.name.trim().toLowerCase() === catName.trim().toLowerCase());
              if (realCat) {
                setSelectedCategoryId(realCat.id);
                buildRowsForCategory(tests, realCat.id);
              }
            }
          }
        }).catch(() => {});
        return;
      }
    }
    if (selectedCategoryId && rankTests.length > 0) {
      buildRowsForCategory(rankTests, selectedCategoryId);
    }
  }, [selectedCategoryId]);

  // Build deduplicated category list sorted by sortOrder
  function buildCategoryList(tests: RankTest[]): { id: string; name: string; testId: string }[] {
    const cats: { id: string; name: string; testId: string }[] = [];
    const seen = new Set<string>();
    for (const test of tests) {
      for (const cat of test.categories.sort((a, b) => a.sortOrder - b.sortOrder)) {
        const key = cat.name.trim().toLowerCase();
        if (!seen.has(key)) {
          cats.push({ id: cat.id, name: cat.name, testId: test.id });
          seen.add(key);
        }
      }
    }
    return cats;
  }

  function buildRowsForCategory(tests: RankTest[], categoryId: string) {
    const newRows: Row[] = [];
    for (const test of tests) {
      const cat = test.categories.find(c => c.id === categoryId);
      if (!cat) continue;
      for (const item of cat.items.sort((a, b) => a.sortOrder - b.sortOrder)) {
        newRows.push({
          itemId: item.id,
          itemName: item.name,
          description: (item.description || "").replace(/^( +)/gm, (m) => "\u00A0".repeat(m.length)),
          showTitleInPdf: (item as Record<string, unknown>).showTitleInPdf !== false,
          type: item.type,
          sets: item.sets?.toString() || "",
          rounds: item.rounds?.toString() || "",
          reps: item.reps?.toString() || "",
          roundDuration: item.roundDuration || "",
          duration: item.duration || "",
          distance: item.distance || "",
          timeLimit: item.timeLimit || "",
          timeLimitOperator: (item as Record<string, unknown>).timeLimitOperator as string || "lte",
          videoUrl: (item as Record<string, unknown>).videoUrl as string || "",
          sortOrder: item.sortOrder,
        });
      }
    }
    // Add empty row at bottom
    newRows.push(emptyRow(newRows.length));
    setRows(newRows);
    setHasChanges(false);
  }

  function emptyRow(order: number): Row {
    return {
      itemId: `new-${Date.now()}-${Math.random()}`, itemName: "", description: "", showTitleInPdf: true, type: "skill",
      sets: "", rounds: "", reps: "", roundDuration: "", duration: "", distance: "",
      timeLimit: "", timeLimitOperator: "lte", videoUrl: "", isNew: true, sortOrder: order,
    };
  }

  const updateRow = useCallback((index: number, field: keyof Row, value: string) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // If typing in the last row, add another empty row
      if (index === updated.length - 1 && value && field === "description") {
        updated.push(emptyRow(updated.length));
      }
      return updated;
    });
    setHasChanges(true);
  }, []);

  // Map column index to row field
  const colFields: (keyof Row)[] = ["itemName", "videoUrl", "reps", "sets", "roundDuration", "rounds", "duration", "distance", "timeLimit"];

  function handlePaste(e: React.ClipboardEvent, rowIdx: number, colIdx: number) {
    const text = e.clipboardData.getData("text");
    const html = e.clipboardData.getData("text/html");
    if (!text) return;

    // Check if this is a single spreadsheet cell (possibly with colspan)
    // Google Sheets adds tabs for colspan but it's still one cell
    const isSingleCell = html && (html.match(/<tr/g) || []).length === 1 && (html.match(/<td/g) || []).length === 1;

    if (isSingleCell) {
      e.preventDefault();
      // Extract the inner HTML from the single <td> — preserve formatting
      const tdMatch = html.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
      if (tdMatch) {
        // Clean up Google Sheets HTML — convert spans to semantic tags
        let cellHtml = tdMatch[1]
          // Convert styled spans to semantic tags with proper closing
          .replace(/<span[^>]*font-weight:\s*bold[^>]*>([\s\S]*?)<\/span>/gi, "<b>$1</b>")
          .replace(/<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)<\/span>/gi, "<i>$1</i>")
          .replace(/<span[^>]*text-decoration:[^>]*underline[^>]*>([\s\S]*?)<\/span>/gi, "<u>$1</u>")
          // Remove remaining unstyled spans
          .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, "$1")
          .trim();
        // Store rich content in the field being pasted into
        const plainText = text.replace(/\t+$/, "").trim();
        const hasFormatting = cellHtml.includes("<b>") || cellHtml.includes("<i>") || cellHtml.includes("<u>") || cellHtml.includes("<br") || cellHtml.includes("<div");
        const targetField = colFields[colIdx];

        if (targetField === "itemName") {
          // Name field — use first line as name, full content as description
          const firstLine = plainText.split("\n")[0].trim();
          if (!rows[rowIdx]?.itemName) updateRow(rowIdx, "itemName", firstLine);
          if (hasFormatting || plainText.includes("\n")) {
            updateRow(rowIdx, "description", cellHtml);
          }
        } else {
          // Any other field — store the full content directly
          updateRow(rowIdx, targetField, hasFormatting ? cellHtml : plainText);
        }
      } else {
        updateRow(rowIdx, colFields[colIdx], text.replace(/\t+$/, "").trim());
      }
      return;
    }

    // No tabs, but has newlines
    if (!text.includes("\t")) {
      if (!text.includes("\n")) return; // single line, let default handle
      e.preventDefault();

      // Check if HTML has multiple rows — means it's a column paste from spreadsheet
      const isMultiRow = html && (html.match(/<tr/g) || []).length > 1;

      if (isMultiRow) {
        // Spread across rows (column paste)
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        setRows(prev => {
          const updated = [...prev];
          for (let r = 0; r < lines.length; r++) {
            const targetRow = rowIdx + r;
            while (targetRow >= updated.length) updated.push(emptyRow(updated.length));
            updated[targetRow] = { ...updated[targetRow], [colFields[colIdx]]: lines[r].trim() };
          }
          // Always add an empty row at the end for the next paste/input
          const last = updated[updated.length - 1];
          if (last.itemName.trim() || last.description?.trim()) updated.push(emptyRow(updated.length));
          return updated;
        });
        setHasChanges(true);
      } else {
        // Single cell with newlines — store in the target field
        const targetField = colFields[colIdx];
        if (targetField === "itemName") {
          // For name, use first line as name, rest as description
          const firstLine = text.split("\n")[0].trim();
          updateRow(rowIdx, "itemName", firstLine);
          updateRow(rowIdx, "description", text.trim().replace(/\n/g, "<br>"));
        } else {
          updateRow(rowIdx, targetField, text.trim());
        }
      }
      return;
    }

    // Split by newlines (rows) and tabs (columns)
    const pasteRows = text.split(/\r?\n/).filter(line => line.trim());

    e.preventDefault();
    setRows(prev => {
      const updated = [...prev];

      for (let r = 0; r < pasteRows.length; r++) {
        const cells = pasteRows[r].split("\t");
        const targetRow = rowIdx + r;

        // Add empty rows if needed
        while (targetRow >= updated.length) {
          updated.push(emptyRow(updated.length));
        }

        for (let c = 0; c < cells.length; c++) {
          const targetCol = colIdx + c;
          if (targetCol >= colFields.length) break;
          const field = colFields[targetCol];
          updated[targetRow] = { ...updated[targetRow], [field]: cells[c].trim() };
          if (field === "itemName" && cells[c].trim()) {
            updated[targetRow].isNew = updated[targetRow].isNew ?? true;
          }
        }
      }

      // Always add an empty row at the end for the next paste/input
      const lastRow = updated[updated.length - 1];
      if (lastRow && (lastRow.itemName.trim() || lastRow.description?.trim())) {
        updated.push(emptyRow(updated.length));
      }

      return updated;
    });
    setHasChanges(true);
  }

  function handleKeyDown(e: React.KeyboardEvent, rowIdx: number, colIdx: number) {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      // Non-workout sections only render two data-col cells
      // (description + video) so Tab needs to wrap after col 1 there
      // instead of hunting for cols 2-8 that don't exist. Information
      // sections drop video entirely -> just col 0.
      const cols = topSectionType === "workout" ? 9 : topSectionType === "information" ? 1 : 2;
      let nextRow = rowIdx;
      let nextCol = colIdx + 1;
      if (nextCol >= cols) { nextCol = 0; nextRow++; }
      // Past the last row -> append a new empty row so the operator
      // can keep typing without reaching for the mouse. Matches the
      // dedicated "add new" input behavior used by CategorySpreadsheet
      // when a section is collapsed below the fold.
      if (nextRow >= rows.length) {
        setRows((prev) => [...prev, emptyRow(prev.length)]);
        setHasChanges(true);
        // Wait for the new row to render, then focus into it.
        requestAnimationFrame(() => {
          const nextInput = tableRef.current?.querySelector(`[data-row="${nextRow}"][data-col="${nextCol}"]`) as HTMLElement;
          nextInput?.focus();
        });
        return;
      }
      const nextInput = tableRef.current?.querySelector(`[data-row="${nextRow}"][data-col="${nextCol}"]`) as HTMLElement;
      nextInput?.focus();
    }
  }

  // Find testId for the selected category
  function getTestId(): string {
    const cat = allCategories.find(c => c.id === selectedCategoryId);
    return cat?.testId || rankTests[0]?.id || "";
  }

  // Map category name to item type
  function getCategoryType(): string {
    const catName = selectedCategory?.name?.toLowerCase() || "";
    if (catName.includes("technique")) return "technique";
    if (catName.includes("combo")) return "skill";
    if (catName.includes("knowledge")) return "knowledge";
    if (catName.includes("fitness")) return "workout";
    if (catName.includes("form") || catName.includes("kata")) return "form";
    if (catName.includes("sparring")) return "sparring";
    if (catName.includes("breaking")) return "breaking";
    return "skill";
  }

  const [copyingMain, setCopyingMain] = useState(false);
  const [showMainCopyMenu, setShowMainCopyMenu] = useState(false);
  const [mainCopySelectedRanks, setMainCopySelectedRanks] = useState<Set<string>>(new Set());
  const [mainCopyReplace, setMainCopyReplace] = useState(false);

  async function copyMainCategoryToRanks() {
    if (!selectedCategoryId || !selectedCategory) return;
    if (mainCopySelectedRanks.size === 0) { alert("Select at least one rank"); return; }
    setShowMainCopyMenu(false);
    const mainMode = mainCopyReplace ? "replace" : "skip";
    // Save first if there are changes
    if (hasChanges) await handleSave();
    setCopyingMain(true);
    try {
      // Get current items from rankTests
      let currentItems: Item[] = [];
      for (const test of rankTests) {
        const cat = test.categories.find(c => c.id === selectedCategoryId);
        if (cat) { currentItems = cat.items; break; }
      }

      const targetRanks = ranks.filter(r => mainCopySelectedRanks.has(r.id));
      await Promise.all(targetRanks.map(async (rank) => {
        const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`);
        if (!res.ok) return;
        const d = await res.json();
        const tests: RankTest[] = d.rankTests || d.tests || [];
        if (tests.length === 0) return;
        const otherTestId = tests[0].id;
        let otherCat = tests.flatMap(t => t.categories).find(c => c.name.trim().toLowerCase() === selectedCategory.name.trim().toLowerCase());
        if (!otherCat) {
          const createRes = await fetch(`/api/rank-tests/${otherTestId}/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: selectedCategory.name }),
          });
          if (!createRes.ok) return;
          const createData = await createRes.json();
          otherCat = createData.category;
          if (!otherCat) return;
        }
        // Skip if mode is "skip" and category already has items
        if (mainMode === "skip" && otherCat.items && otherCat.items.length > 0) return;
        // Delete existing items if replacing
        for (const item of otherCat.items || []) {
          await fetch(`/api/rank-tests/${otherTestId}/items?itemId=${item.id}`, { method: "DELETE" });
        }
        // Copy items
        for (const item of currentItems) {
          await fetch(`/api/rank-tests/${otherTestId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId: otherCat.id,
              name: item.name,
              description: item.description || null,
              type: item.type || getCategoryType(),
              showTitleInPdf: (item as Record<string, unknown>).showTitleInPdf !== false,
              sets: item.sets || null,
              rounds: item.rounds || null,
              reps: item.reps || null,
              roundDuration: item.roundDuration || null,
              duration: item.duration || null,
              distance: item.distance || null,
              timeLimit: item.timeLimit || null,
              timeLimitOperator: (item as Record<string, unknown>).timeLimitOperator || null,
              videoUrl: (item as Record<string, unknown>).videoUrl || null,
              sortOrder: item.sortOrder,
            }),
          });
        }
      }));
      alert(`"${selectedCategory.name}" copied to ${targetRanks.length} rank${targetRanks.length !== 1 ? "s" : ""}.`);
    } catch { alert("Failed to copy to all ranks"); }
    finally { setCopyingMain(false); }
  }

  async function handleSave() {
    setSaving(true);
    const testId = getTestId();
    try {
      for (const row of rows) {
        if (!row.description?.trim()) continue;

        if (row.isNew) {
          await fetch(`/api/rank-tests/${testId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId: selectedCategoryId,
              name: row.description ? row.description.replace(/<[^>]*>/g, "").split("\n")[0].substring(0, 100).trim() || "" : "", description: row.description ? row.description.replace(/(<br\s*\/?>|<div>\s*<\/div>|<div><br\s*\/?><\/div>)+$/gi, "").trimEnd() || null : null, type: getCategoryType(), showTitleInPdf: false,
              sets: row.sets ? parseInt(row.sets) : null,
              rounds: row.rounds ? parseInt(row.rounds) : null,
              reps: row.reps ? parseInt(row.reps) : null,
              roundDuration: row.roundDuration || null,
              duration: row.duration || null,
              distance: row.distance || null,
              timeLimit: row.timeLimit || null,
              timeLimitOperator: row.timeLimit ? row.timeLimitOperator || "lte" : null,
              videoUrl: row.videoUrl || null,
            }),
          });
        } else {
          await fetch(`/api/rank-tests/${testId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: row.itemId,
              name: row.description ? row.description.replace(/<[^>]*>/g, "").split("\n")[0].substring(0, 100).trim() || "" : "", description: row.description ? row.description.replace(/(<br\s*\/?>|<div>\s*<\/div>|<div><br\s*\/?><\/div>)+$/gi, "").trimEnd() || null : null, type: getCategoryType(), showTitleInPdf: false,
              sets: row.sets ? parseInt(row.sets) : null,
              rounds: row.rounds ? parseInt(row.rounds) : null,
              reps: row.reps ? parseInt(row.reps) : null,
              roundDuration: row.roundDuration || null,
              duration: row.duration || null,
              distance: row.distance || null,
              timeLimit: row.timeLimit || null,
              timeLimitOperator: row.timeLimit ? row.timeLimitOperator || "lte" : null,
              videoUrl: row.videoUrl || null,
            }),
          });
        }
      }

      // Reload
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (res.ok) {
        const d = await res.json();
        const tests: RankTest[] = d.rankTests || d.tests || [];

        // NOTE: we used to auto-delete any non-default category that was
        // empty after save. That silently destroyed user-created categories
        // (e.g. \"Stances\", \"Fran\") that the admin had added via the UI but
        // hadn't filled in yet — they'd vanish entirely on the next save
        // and disappear from the published PDF. Empty categories are
        // already filtered out at PDF-render time, so leaving them alone
        // here is safe and preserves the admin's structure.

        setRankTests(tests);
        buildRowsForCategory(tests, selectedCategoryId);
      }
      setHasChanges(false);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(index: number) {
    const row = rows[index];
    if (row.isNew) { setRows(prev => prev.filter((_, i) => i !== index)); return; }
    if (!confirm(`Delete "${row.itemName}"?`)) return;
    const testId = getTestId();
    try {
      await fetch(`/api/rank-tests/${testId}/items?itemId=${row.itemId}`, { method: "DELETE" });
      setRows(prev => prev.filter((_, i) => i !== index));
    } catch { alert("Failed to delete"); }
  }

  async function addCategory() {
    if (!newCategoryName.trim() || !selectedStyleId) return;
    const testId = getTestId();
    if (!testId) return;
    const catName = newCategoryName.trim();
    try {
      // Create on current rank
      const res = await fetch(`/api/rank-tests/${testId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: catName }),
      });
      if (res.ok) {
        const data = await res.json();
        // Reload categories to get correct sort order
        const reloadRes = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
        if (reloadRes.ok) {
          const d = await reloadRes.json();
          const tests = d.rankTests || d.tests || [];
          setRankTests(tests);
          const cats = buildCategoryList(tests);
          // Re-add virtual categories from styleCatNames
          const currentNames = new Set(cats.map(c => c.name.trim().toLowerCase()));
          for (const name of styleCatNames) {
            if (!currentNames.has(name.trim().toLowerCase())) {
              cats.push({ id: `virtual-${name}`, name, testId: tests[0]?.id || "" });
              currentNames.add(name.trim().toLowerCase());
            }
          }
          setAllCategories(cats);
        }
        setSelectedCategoryId(data.category.id);
        setNewCategoryName("");
        setShowAddCategory(false);
        setRows([emptyRow(0)]);
        setHasChanges(false);

        // Also create on all other ranks in the same style (fire and forget)
        for (const rank of ranks) {
          if (rank.id === selectedRankId) continue;
          fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(async (d) => {
              const tests = d?.rankTests || d?.tests || [];
              if (tests.length === 0) return;
              const otherTestId = tests[0].id;
              const existingCats: string[] = tests.flatMap((t: RankTest) => t.categories.map((c: Category) => c.name));
              if (!existingCats.includes(catName)) {
                await fetch(`/api/rank-tests/${otherTestId}/categories`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: catName }),
                });
              }
            })
            .catch(() => {});
        }
      }
    } catch { alert("Failed to create category"); }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function openReorderModal() {
    setReorderList(allCategories.map(c => ({ id: c.id, name: c.name })));
    setReorderThisRankOnly(lockedRankIds.has(selectedRankId));
    setShowReorderModal(true);
  }

  function handleReorderDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setReorderList(prev => {
      const oldIndex = prev.findIndex(c => c.id === active.id);
      const newIndex = prev.findIndex(c => c.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function saveReorder() {
    setSavingReorder(true);
    const testId = getTestId();
    if (!testId) { setSavingReorder(false); return; }
    try {
      // Save order on current rank.
      //
      // reorderList can contain "virtual" entries (id starts with "virtual-")
      // for categories that exist style-wide but aren't materialized on this
      // rank yet. Patching a virtual id used to 500 silently — fetch doesn't
      // throw on HTTP errors, Promise.all resolved fine, and the user saw the
      // modal close without anything saving (the symptom on Brown/Black Belt
      // after its categories were nuked by the earlier rank-rename bug).
      //
      // Materialize each virtual entry on the current rank first (the POST
      // endpoint upserts by name + rankTestId), then PATCH every category's
      // sortOrder using its real DB id.
      const resolved: { id: string; name: string }[] = [];
      for (const entry of reorderList) {
        if (entry.id.startsWith("virtual-")) {
          try {
            const res = await fetch(`/api/rank-tests/${testId}/categories`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: entry.name }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.category?.id) {
                resolved.push({ id: data.category.id, name: entry.name });
                continue;
              }
            }
          } catch { /* fall through — skip this entry */ }
          // Failed create → drop it; the remaining real categories still get
          // tight sortOrder values.
          continue;
        }
        resolved.push({ id: entry.id, name: entry.name });
      }

      await Promise.all(resolved.map((cat, i) =>
        fetch(`/api/rank-tests/${testId}/categories`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: cat.id, sortOrder: i }),
        })
      ));

      // Update locked state for this rank
      const newLocked = new Set(lockedRankIds);
      if (reorderThisRankOnly) {
        newLocked.add(selectedRankId);
      } else {
        newLocked.delete(selectedRankId);
      }
      updateLockedRanks(newLocked);

      // Apply to all other unlocked ranks
      if (!reorderThisRankOnly) {
        const orderByName: Record<string, number> = {};
        reorderList.forEach((cat, i) => { orderByName[cat.name.trim().toLowerCase()] = i; });

        const otherRanks = ranks.filter(r => r.id !== selectedRankId && !newLocked.has(r.id));
        await Promise.all(otherRanks.map(async (rank) => {
          const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`);
          if (!res.ok) return;
          const d = await res.json();
          const tests: RankTest[] = d.rankTests || d.tests || [];
          for (const t of tests) {
            await Promise.all(t.categories.map(cat => {
              const newOrder = orderByName[cat.name.trim().toLowerCase()];
              if (newOrder !== undefined && newOrder !== cat.sortOrder) {
                return fetch(`/api/rank-tests/${t.id}/categories`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ categoryId: cat.id, sortOrder: newOrder }),
                });
              }
              return Promise.resolve();
            }));
          }
        }));
      }

      // Reload
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (res.ok) {
        const d = await res.json();
        const tests = d.rankTests || d.tests || [];
        setRankTests(tests);
        setAllCategories(buildCategoryList(tests));
        buildRowsForCategory(tests, selectedCategoryId);
      }
      setShowReorderModal(false);
    } catch { alert("Failed to save order"); }
    finally { setSavingReorder(false); }
  }

  async function deleteCustomCategory(categoryId: string, categoryName: string) {
    if (!confirm(`Clear all items from "${categoryName}" on all ranks in this style?`)) return;
    try {
      // Clear items from current rank
      const testId = getTestId();
      if (testId) {
        let currentItems: Item[] = [];
        for (const test of rankTests) {
          const cat = test.categories.find(c => c.id === categoryId);
          if (cat) { currentItems = cat.items; break; }
        }
        await Promise.all(currentItems.map(item =>
          fetch(`/api/rank-tests/${testId}/items?itemId=${item.id}`, { method: "DELETE" })
        ));
      }

      // Clear items from all other ranks in the style (parallel)
      const otherRanks = ranks.filter(r => r.id !== selectedRankId);
      await Promise.all(otherRanks.map(async (rank) => {
        const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`);
        if (!res.ok) return;
        const d = await res.json();
        const tests: RankTest[] = d.rankTests || d.tests || [];
        for (const t of tests) {
          const cat = t.categories.find(c => c.name === categoryName);
          if (cat) {
            await Promise.all(cat.items.map(item =>
              fetch(`/api/rank-tests/${t.id}/items?itemId=${item.id}`, { method: "DELETE" })
            ));
          }
        }
      }));

      // Reload current rank
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (res.ok) {
        const d = await res.json();
        const tests = d.rankTests || d.tests || [];
        setRankTests(tests);
        setAllCategories(buildCategoryList(tests));
        buildRowsForCategory(tests, selectedCategoryId);
      }
    } catch { alert("Failed to clear category items"); }
  }

  async function deleteCategory(categoryId: string, categoryName: string) {
    if (!confirm(`Clear all items from "${categoryName}" on this rank?`)) return;
    const testId = getTestId();
    if (!testId) return;
    try {
      // Delete all items in the category but keep the category itself
      let categoryItems: Item[] = [];
      for (const test of rankTests) {
        const cat = test.categories.find(c => c.id === categoryId);
        if (cat) { categoryItems = cat.items; break; }
      }
      await Promise.all(categoryItems.map(item =>
        fetch(`/api/rank-tests/${testId}/items?itemId=${item.id}`, { method: "DELETE" })
      ));

      // Reload
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (res.ok) {
        const d = await res.json();
        const tests = d.rankTests || d.tests || [];
        setRankTests(tests);
        const cats = buildCategoryList(tests);
        setAllCategories(cats);
        if (categoryId === selectedCategoryId) {
          const recreated = cats.find(c => c.name === categoryName);
          const target = recreated || cats[0];
          if (target) { setSelectedCategoryId(target.id); buildRowsForCategory(tests, target.id); }
          else { setSelectedCategoryId(""); setRows([]); }
        } else {
          buildRowsForCategory(tests, selectedCategoryId);
        }
      }
    } catch { alert("Failed to delete category"); }
  }

  const [publishing, setPublishing] = useState(false);

  // Shared publish helper
  async function publishRanks(ranksToPublish: { id: string; name: string; order: number }[]) {
    const styleRes = await fetch(`/api/styles/${selectedStyleId}`);
    if (!styleRes.ok) throw new Error("Failed to fetch style");
    const styleData = await styleRes.json();
    const style = styleData.style;

    let beltConfig: { ranks: Array<{ id: string; name: string; layers?: { fabricColor?: string } }> } = { ranks: [] };
    if (style.beltConfig) {
      try { beltConfig = typeof style.beltConfig === "string" ? JSON.parse(style.beltConfig) : style.beltConfig; } catch { /* use default */ }
    }

    let logoImg: HTMLImageElement | undefined;
    if (gymSettings.logo) {
      logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Logo failed"));
        img.src = gymSettings.logo;
      }).catch(() => undefined);
    }

    // Each rank's PDF uses that rank's own saved category sortOrder.
    // (Previously we built one orderMap from the page's current allCategories
    // and forced every rank to match — so Publish All from White Belt would
    // render Brown/Black's PDF with White Belt's order, ignoring Brown/Black's
    // locked custom order.)
    const rankTestResults = await Promise.all(
      ranksToPublish.map(rank =>
        fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(data => {
            const tests = (data?.rankTests || data?.tests || []) as PdfRankTest[];
            for (const test of tests) {
              test.categories.sort((a, b) => a.sortOrder - b.sortOrder);
            }
            return { rank, tests };
          })
      )
    );

    let successCount = 0;
    const errors: string[] = [];
    const savePromises: Promise<void>[] = [];

    for (const { rank, tests } of rankTestResults) {
      const hasCurriculum = tests.length > 0 && tests.some(t => t.categories.some(c => c.items.length > 0));
      if (!hasCurriculum) continue;

      const configRank = beltConfig.ranks?.find(r => r.id === rank.id)
        || beltConfig.ranks?.find(r => r.name.toLowerCase() === rank.name.toLowerCase());
      const beltColor = (configRank?.layers as Record<string, unknown>)?.fabricColor as string || "#ffffff";

      const pdfDataUrl = generateCurriculumPdf(style.name, rank.name, tests, beltColor, gymSettings, logoImg, disclaimer);

      savePromises.push(
        fetch(`/api/ranks/${rank.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfDocument: pdfDataUrl }),
        }).then(res => {
          if (res.ok) successCount++;
          else errors.push(`${rank.name}: ${res.status}`);
        })
      );
    }

    await Promise.all(savePromises);
    return { successCount, errors };
  }

  // Save & Publish — current rank only
  async function handleSaveAndPublish() {
    if (!selectedStyleId || !selectedRankId) return;
    setPublishing(true);
    try {
      if (hasChanges) await handleSave();
      const rank = ranks.find(r => r.id === selectedRankId);
      if (!rank) throw new Error("Rank not found");
      const { successCount, errors } = await publishRanks([rank]);
      if (errors.length > 0) {
        alert(`Failed to publish ${rank.name}: ${errors.join(", ")}`);
      } else if (successCount > 0) {
        alert(`${rank.name} PDF published.`);
      } else {
        alert("No curriculum to publish for this rank.");
      }
    } catch (err) {
      console.error("Publish error:", err);
      alert("Failed to publish: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setPublishing(false);
    }
  }

  // Publish All — all ranks in the style
  async function handlePublishAll() {
    if (!selectedStyleId) return;
    setPublishing(true);
    try {
      if (hasChanges) await handleSave();
      const styleRes = await fetch(`/api/styles/${selectedStyleId}`);
      if (!styleRes.ok) throw new Error("Failed to fetch style");
      const styleData = await styleRes.json();
      const allRanks: { id: string; name: string; order: number }[] = styleData.style?.ranks || [];
      const { successCount, errors } = await publishRanks(allRanks);
      if (errors.length > 0) {
        alert(`Published ${successCount}/${successCount + errors.length} PDFs. Failed: ${errors.join(", ")}`);
      } else if (successCount > 0) {
        alert(`All published! ${successCount} rank PDF${successCount !== 1 ? "s" : ""} generated.`);
      } else {
        alert("No curriculum to publish.");
      }
    } catch (err) {
      console.error("Publish error:", err);
      alert("Failed to publish: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setPublishing(false);
    }
  }

  const selectedStyle = styles.find(s => s.id === selectedStyleId);
  const selectedRank = ranks.find(r => r.id === selectedRankId);
  const selectedCategory = allCategories.find(c => c.id === selectedCategoryId);

  // The selected/top category renders through its own inline table
  // (not the CategorySpreadsheet component), so it needs its own copy
  // of the "type" state + change handler. Look the live value up on
  // rankTests since allCategories only carries id/name/testId.
  let topSectionType: CategoryType = "demonstration";
  let topVisibleOnTest = true;
  for (const test of rankTests) {
    const c = test.categories.find((tc) => tc.id === selectedCategoryId);
    if (c) {
      if (c.type) topSectionType = c.type;
      topVisibleOnTest = c.visibleOnTest !== false;
      break;
    }
  }
  async function changeTopSectionType(nextType: CategoryType) {
    if (!selectedCategoryId) return;
    // Optimistic update so the dropdown flips instantly.
    setRankTests((prev) => prev.map((t) => ({
      ...t,
      categories: t.categories.map((c) =>
        c.id === selectedCategoryId ? { ...c, type: nextType } : c,
      ),
    })));
    const testId = rankTests.find((t) =>
      t.categories.some((c) => c.id === selectedCategoryId),
    )?.id;
    if (!testId) return;
    const res = await fetch(`/api/rank-tests/${testId}/categories`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: selectedCategoryId, type: nextType }),
    });
    if (!res.ok) {
      const r = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (r.ok) { const d = await r.json(); setRankTests(d.rankTests || d.tests || []); }
    }
  }
  async function toggleTopVisibleOnTest() {
    if (!selectedCategoryId) return;
    const next = !topVisibleOnTest;
    setRankTests((prev) => prev.map((t) => ({
      ...t,
      categories: t.categories.map((c) =>
        c.id === selectedCategoryId ? { ...c, visibleOnTest: next } : c,
      ),
    })));
    const testId = rankTests.find((t) =>
      t.categories.some((c) => c.id === selectedCategoryId),
    )?.id;
    if (!testId) return;
    const res = await fetch(`/api/rank-tests/${testId}/categories`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: selectedCategoryId, visibleOnTest: next }),
    });
    if (!res.ok) {
      const r = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (r.ok) { const d = await r.json(); setRankTests(d.rankTests || d.tests || []); }
    }
  }
  // Mirrors the CategorySpreadsheet flow: propagate whichever value
  // the toggle currently sits at to every rank's same-named category.
  async function applyTopVisibilityToAllRanks() {
    if (!selectedCategory) return;
    const wantVisible = topVisibleOnTest;
    const nameLc = selectedCategory.name.trim().toLowerCase();
    const targets: Array<{ testId: string; categoryId: string }> = [];
    // Iterate every rank of the current style.
    for (const rank of ranks) {
      const rr = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`);
      if (!rr.ok) continue;
      const dd = await rr.json();
      const tests: RankTest[] = dd.rankTests || dd.tests || [];
      for (const t of tests) {
        const match = t.categories.find((c) => c.name.trim().toLowerCase() === nameLc);
        if (match) targets.push({ testId: t.id, categoryId: match.id });
      }
    }
    await Promise.all(targets.map((t) =>
      fetch(`/api/rank-tests/${t.testId}/categories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: t.categoryId, visibleOnTest: wantVisible }),
      })
    ));
    // Refresh the current rank so the toggle reflects the truth.
    const r = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
    if (r.ok) { const d = await r.json(); setRankTests(d.rankTests || d.tests || []); }
  }

  return (
    <AppLayout>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Curriculum Builder</h1>
            <p className="text-sm text-gray-500">Select a category and start typing</p>
          </div>
          {/* Split-button: primary Save on the left, small ▾ on the
              right revealing the two Publish variants. Keeps the
              header from carrying three near-identical buttons while
              every action stays one click away. */}
          <div className="relative inline-flex" data-save-menu>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-l-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              title="Save your edits to this rank's curriculum. Members won't see the changes until you also Publish."
            >
              {saving ? "Saving..." : hasChanges ? "Save Changes" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowSaveMenu((v) => !v)}
              disabled={publishing}
              className="rounded-r-md bg-primary px-2 py-1 text-xs font-semibold text-white border-l border-white/30 hover:bg-primaryDark disabled:opacity-50"
              title="More save + publish options"
              aria-haspopup="menu"
              aria-expanded={showSaveMenu}
            >
              ▾
            </button>
            {showSaveMenu && (
              <div className="absolute right-0 top-full mt-1 z-40 w-64 rounded-lg border border-gray-200 bg-white shadow-xl py-1" role="menu">
                <button
                  type="button"
                  onClick={() => { setShowSaveMenu(false); handleSaveAndPublish(); }}
                  disabled={publishing}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  role="menuitem"
                  title="Save your edits AND publish this rank's curriculum PDF so members and testing can use the new version."
                >
                  {publishing ? "Publishing..." : "Save & Publish (this rank)"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSaveMenu(false); handlePublishAll(); }}
                  disabled={publishing}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  role="menuitem"
                  title="Regenerate and publish the curriculum PDF for EVERY rank in this style at once. Use after big changes that touched many ranks."
                >
                  {publishing ? "Publishing..." : "Publish All Ranks"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Style, Rank, Category Selection */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Style</label>
            <select value={selectedStyleId} onChange={e => setSelectedStyleId(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rank</label>
            <select value={selectedRankId} onChange={e => setSelectedRankId(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              {ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <div className="flex items-center gap-2">
              <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {allCategories.length === 0 && <option value="">No categories</option>}
                {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {/* Category management collapsed into a single ⋯ menu so
                  the header stays a Style / Rank / Category strip
                  instead of a wall of buttons. Individual actions
                  keep their existing behavior. */}
              <div className="relative" data-category-menu>
                <button
                  type="button"
                  onClick={() => setShowCategoryMenu((v) => !v)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  title="Category actions: add, remove, reorder"
                  aria-haspopup="menu"
                  aria-expanded={showCategoryMenu}
                >
                  ⋯
                </button>
                {showCategoryMenu && (
                  <div className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-gray-200 bg-white shadow-xl py-1" role="menu">
                    <button
                      type="button"
                      onClick={() => { setShowCategoryMenu(false); setShowAddCategory((v) => !v); }}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                      role="menuitem"
                      title={showAddCategory ? "Cancel adding a new category" : "Create a new curriculum category on this rank"}
                    >
                      {showAddCategory ? "Cancel Add Category" : "Add Category"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCategoryMenu(false); openReorderModal(); }}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
                      role="menuitem"
                      title="Drag categories to change the order they appear in on this rank (and optionally across every rank)"
                    >
                      Reorder Categories
                    </button>
                    {selectedCategoryId && !["Knowledge", "Techniques", "Combos", "Fitness", "Sparring", "Forms/Katas", "Board Breaking"].includes(allCategories.find(c => c.id === selectedCategoryId)?.name || "") && (
                      <>
                        <div className="my-1 border-t border-gray-100" />
                        <button
                          type="button"
                          onClick={async () => {
                            setShowCategoryMenu(false);
                            const cat = allCategories.find(c => c.id === selectedCategoryId);
                            if (!cat) return;
                            if (!confirm(`Remove "${cat.name}" from all ranks? This deletes the category and all its items permanently.`)) return;
                            try {
                              const testId = getTestId();
                              if (testId) await fetch(`/api/rank-tests/${testId}/categories?categoryId=${cat.id}`, { method: "DELETE" });
                              const otherRanks = ranks.filter(r => r.id !== selectedRankId);
                              await Promise.all(otherRanks.map(async (rank) => {
                                const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`);
                                if (!res.ok) return;
                                const d = await res.json();
                                const tests: RankTest[] = d.rankTests || d.tests || [];
                                for (const t of tests) {
                                  const c = t.categories.find(tc => tc.name.trim().toLowerCase() === cat.name.trim().toLowerCase());
                                  if (c) await fetch(`/api/rank-tests/${t.id}/categories?categoryId=${c.id}`, { method: "DELETE" });
                                }
                              }));
                              const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
                              if (res.ok) {
                                const d = await res.json();
                                const tests = d.rankTests || d.tests || [];
                                setRankTests(tests);
                                const cats = buildCategoryList(tests);
                                setAllCategories(cats);
                                const target = cats[0];
                                if (target) { setSelectedCategoryId(target.id); buildRowsForCategory(tests, target.id); }
                                else { setSelectedCategoryId(""); setRows([]); }
                              }
                            } catch { alert("Failed to remove category"); }
                          }}
                          className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-red-50 hover:text-red-700"
                          role="menuitem"
                          title="Delete this category and all of its items from EVERY rank in this style. Can't be undone."
                        >
                          Remove Category
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {showAddCategory && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addCategory(); }}
                placeholder="New category name..."
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
              <button onClick={addCategory} disabled={!newCategoryName.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50" title="Create the new category with the name you typed">
                Add
              </button>
            </div>
          )}
        </div>

        {/* Spreadsheet */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : !selectedRankId ? (
          <p className="text-sm text-gray-500">Select a style and rank to edit curriculum.</p>
        ) : !selectedCategoryId ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">Setting up {selectedRank?.name}...</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-100 overflow-x-auto">
            <SectionHeader
              name={selectedCategory?.name || ""}
              sectionType={topSectionType}
              onChangeSectionType={changeTopSectionType}
              itemCount={rows.filter(r => r.description?.trim()).length}
              visibleOnTest={topVisibleOnTest}
              onToggleVisibleOnTest={toggleTopVisibleOnTest}
              onApplyVisibilityToAllRanks={applyTopVisibilityToAllRanks}
              onDeleteSection={() => selectedCategory && deleteCategory(selectedCategory.id, selectedCategory.name)}
              onDeleteFromAllRanks={() => selectedCategory && deleteCustomCategory(selectedCategory.id, selectedCategory.name)}
              copyToRanksSlot={
                <div className="relative inline-block">
                  <button onClick={() => setShowMainCopyMenu(!showMainCopyMenu)} disabled={copyingMain || rows.filter(r => r.description?.trim()).length === 0} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50" title="Copy every item in this whole category into other ranks of the same style">
                    {copyingMain ? "Copying..." : "Copy to Ranks"}
                  </button>
                  {showMainCopyMenu && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-3 space-y-2">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase">Select ranks</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {ranks.filter(r => r.id !== selectedRankId).map(r => (
                          <label key={r.id} className={`flex items-center gap-2 text-xs cursor-pointer p-1 rounded ${mainCopySelectedRanks.has(r.id) ? "bg-primary/10" : "hover:bg-gray-50"}`}>
                            <input type="checkbox" checked={mainCopySelectedRanks.has(r.id)} onChange={() => setMainCopySelectedRanks(prev => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="accent-primary" />
                            {r.name}
                          </label>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 text-[10px] text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={mainCopyReplace} onChange={e => setMainCopyReplace(e.target.checked)} className="accent-primary" />
                        Replace existing items
                      </label>
                      <div className="flex gap-1 pt-1 border-t border-gray-100">
                        <button onClick={() => setMainCopySelectedRanks(new Set(ranks.filter(r => r.id !== selectedRankId).map(r => r.id)))} className="text-[10px] text-primary hover:underline" title="Select every rank in this style">All</button>
                        <button onClick={() => setMainCopySelectedRanks(new Set())} className="text-[10px] text-gray-400 hover:underline" title="Clear the rank selection">None</button>
                        <div className="flex-1" />
                        <button onClick={copyMainCategoryToRanks} disabled={mainCopySelectedRanks.size === 0} className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark disabled:opacity-50" title="Copy this category's items into the ranks checked above">Copy</button>
                        <button onClick={() => setShowMainCopyMenu(false)} className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-50" title="Close without copying">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              }
            />
            <table ref={tableRef} className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500" style={{ width: "100%", minWidth: "250px" }}>Item Information</th>
                  {topSectionType !== "information" && (
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-24">Video</th>
                  )}
                  {topSectionType === "workout" && <>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Reps</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Sets</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Min/Rd</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Rnds</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Duration</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Distance</th>
                    <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-28">Time Limit</th>
                  </>}
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  // Bundle only exists once the row is persisted (needs a
                  // real itemId to look up subExercises + PATCH back). Look
                  // up the live item straight from rankTests -- Row does
                  // not carry subExercises through the save cycle.
                  let liveItem: Item | null = null;
                  if (!row.isNew) {
                    for (const test of rankTests) {
                      const c = test.categories.find((tc) => tc.id === selectedCategoryId);
                      const it = c?.items.find((i) => i.id === row.itemId);
                      if (it) { liveItem = it; break; }
                    }
                  }
                  const topSubs = liveItem ? parseSubExercises(liveItem.subExercises) : [];
                  const topBundleOpen = !!topExpandedBundle[row.itemId];
                  return (
                  <React.Fragment key={row.itemId}>
                  <tr className={`border-t border-gray-200 hover:bg-gray-200 ${row.isNew && !row.description ? "bg-gray-100" : ""}`}>
                    <td className="px-2 py-1 overflow-hidden" style={{ maxWidth: 0 }}>
                      <div className="flex items-center gap-1">
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          data-row={idx} data-col={0}
                          dangerouslySetInnerHTML={{ __html: (row.description || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/?div[^>]*>/gi, " ").replace(/\n/g, " ") }}
                          onBlur={e => {
                            const html = (e.target as HTMLDivElement).innerHTML;
                            const clean = html === "<br>" ? "" : html.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0");
                            if (clean !== row.description) {
                              updateRow(idx, "description", clean);
                            }
                          }}
                          onPaste={e => {
                            const text = e.clipboardData.getData("text");
                            const html = e.clipboardData.getData("text/html");
                            if (!text) return;

                            const isSingleCell = html && (html.match(/<td/g) || []).length <= 1;
                            const isMultiRow = html && (html.match(/<tr/g) || []).length > 1;

                            if (isSingleCell || !isMultiRow) {
                              e.preventDefault();
                              if (html && html.includes("<td")) {
                                const tdMatch = html.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
                                const cellHtml = tdMatch ? tdMatch[1]
                                  .replace(/<span[^>]*font-weight:\s*bold[^>]*>([\s\S]*?)<\/span>/gi, "<b>$1</b>")
                                  .replace(/<span[^>]*font-style:\s*italic[^>]*>([\s\S]*?)<\/span>/gi, "<i>$1</i>")
                                  .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, "$1")
                                  .trim() : text.replace(/\t+$/, "").trim();
                                document.execCommand("insertHTML", false, cellHtml);
                              } else {
                                document.execCommand("insertText", false, text.trim());
                              }
                              return;
                            }

                            e.preventDefault();
                            const lines = text.split(/\r?\n/).filter(l => l.trim());
                            setRows(prev => {
                              const updated = [...prev];
                              for (let r = 0; r < lines.length; r++) {
                                const targetRow = idx + r;
                                while (targetRow >= updated.length) updated.push(emptyRow(updated.length));
                                updated[targetRow] = { ...updated[targetRow], description: lines[r].trim() };
                              }
                              const last = updated[updated.length - 1];
                              if (last.itemName.trim() || last.description?.trim()) updated.push(emptyRow(updated.length));
                              return updated;
                            });
                            setHasChanges(true);
                          }}
                          onKeyDown={e => {
                            if (e.key === "b" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("bold"); }
                            if (e.key === "i" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("italic"); }
                            if (e.key === "u" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.execCommand("underline"); }
                            if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
                          }}
                          onDoubleClick={() => { if (row.description) setPopupCell({ rowIdx: idx, field: "description", value: row.description }); }}
                          data-placeholder={row.isNew ? "Type to add..." : ""}
                          className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white overflow-hidden whitespace-nowrap empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                          style={{ height: "28px", lineHeight: "28px", display: "flex", alignItems: "center" }}
                        />
                        {row.description && (() => {
                          const hasRich = /<br|<div|<b>|<i>|<u>|\n/.test(row.description);
                          const plainLen = row.description.replace(/<[^>]*>/g, "").length;
                          return (hasRich || plainLen > 40) ? (
                            <button
                              type="button"
                              onClick={() => setPopupCell({ rowIdx: idx, field: "description", value: row.description })}
                              className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark"
                              title="Open a full-size editor for this item's description (bold, italics, longer text)"
                            >
                              Edit
                            </button>
                          ) : null;
                        })()}
                      </div>
                      {topSectionType === "workout" && topSubs.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 pl-1">
                          <span className="text-[9px] font-semibold uppercase text-gray-400">Bundle</span>
                          {topSubs.map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setTopExpandedBundle((prev) => ({ ...prev, [row.itemId]: true }))}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                              title={s.timed ? "Timed sub-exercise — click to edit bundle" : "Click to edit bundle"}
                            >
                              {s.timed && <span aria-hidden="true">⏱</span>}
                              <span>{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    {topSectionType !== "information" && (
                      <td className="px-2 py-1">
                        <input type="text" data-row={idx} data-col={1} value={row.videoUrl} onChange={e => updateRow(idx, "videoUrl", e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 1)} placeholder="URL" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                    )}
                    {topSectionType === "workout" && <>
                      <td className="px-2 py-1">
                        <input type="number" min={0} data-row={idx} data-col={2} value={row.reps} onChange={e => updateRow(idx, "reps", e.target.value)} onPaste={e => handlePaste(e, idx, 2)} onKeyDown={e => handleKeyDown(e, idx, 2)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} data-row={idx} data-col={3} value={row.sets} onChange={e => updateRow(idx, "sets", e.target.value)} onPaste={e => handlePaste(e, idx, 3)} onKeyDown={e => handleKeyDown(e, idx, 3)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" data-row={idx} data-col={4} value={row.roundDuration} onChange={e => updateRow(idx, "roundDuration", e.target.value)} onPaste={e => handlePaste(e, idx, 4)} onKeyDown={e => handleKeyDown(e, idx, 4)} placeholder="e.g. 3m" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} data-row={idx} data-col={5} value={row.rounds} onChange={e => updateRow(idx, "rounds", e.target.value)} onPaste={e => handlePaste(e, idx, 5)} onKeyDown={e => handleKeyDown(e, idx, 5)} placeholder="#" className="no-spinner w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" data-row={idx} data-col={6} value={row.duration} onChange={e => updateRow(idx, "duration", e.target.value)} onPaste={e => handlePaste(e, idx, 6)} onKeyDown={e => handleKeyDown(e, idx, 6)} placeholder="e.g. 2 min" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" data-row={idx} data-col={7} value={row.distance} onChange={e => updateRow(idx, "distance", e.target.value)} onPaste={e => handlePaste(e, idx, 7)} onKeyDown={e => handleKeyDown(e, idx, 7)} placeholder="e.g. 1 mi" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-0.5">
                          <select value={row.timeLimitOperator} onChange={e => updateRow(idx, "timeLimitOperator" as keyof Row, e.target.value)} className="w-10 rounded border border-gray-300 px-0.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary bg-white">
                            <option value="lte">≤</option>
                            <option value="lt">&lt;</option>
                            <option value="eq">=</option>
                            <option value="gte">≥</option>
                            <option value="gt">&gt;</option>
                          </select>
                          <input type="text" data-row={idx} data-col={8} value={row.timeLimit} onChange={e => updateRow(idx, "timeLimit", e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 8)} placeholder="e.g. 1:30" className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                        </div>
                      </td>
                    </>}
                    <td className="px-2 py-1 text-center">
                      {!row.isNew && (
                        <div className="flex items-center justify-center gap-1">
                          {topSectionType === "workout" && (
                            <button
                              onClick={() => setTopExpandedBundle((prev) => ({ ...prev, [row.itemId]: !prev[row.itemId] }))}
                              className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-primaryDark"
                              title="Group several exercises under this item; one stopwatch and one checkmark cover them all."
                            >
                              {topBundleOpen ? "Hide" : topSubs.length > 0 ? `Bundle (${topSubs.length})` : "Bundle"}
                            </button>
                          )}
                          <button onClick={() => deleteRow(idx)} className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50" title="Remove this item from this rank's curriculum">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {topSectionType === "workout" && !row.isNew && topBundleOpen && (
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={topSectionType === "workout" ? 10 : 3} className="px-4 py-3">
                        <SubExerciseEditor
                          value={topSubs}
                          onCommit={async (next) => {
                            const testId = getTestId();
                            await fetch(`/api/rank-tests/${testId}/items`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ itemId: row.itemId, subExercises: next }),
                            });
                            // Refresh rankTests so subs.length + the
                            // grading sheet pick up the new bundle.
                            const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
                            if (res.ok) {
                              const d = await res.json();
                              setRankTests(d.rankTests || d.tests || []);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Other categories with content for this rank — full editable spreadsheets */}
        {selectedRankId && rankTests.length > 0 && (() => {
          const catsWithItems = allCategories.filter(cat => {
            if (cat.id === selectedCategoryId) return false;
            for (const test of rankTests) {
              const c = test.categories.find(tc => tc.id === cat.id);
              if (c && c.items.length > 0) return true;
            }
            return false;
          }).sort((a, b) => {
            // Sort by category sortOrder (matches dropdown order)
            const getSortOrder = (catId: string) => {
              for (const test of rankTests) {
                const c = test.categories.find(tc => tc.id === catId);
                if (c) return c.sortOrder;
              }
              return Infinity;
            };
            return getSortOrder(a.id) - getSortOrder(b.id);
          });
          if (catsWithItems.length === 0) return null;

          // Compute item counts once so the collapsed header can show
          // "N items" without hitting rankTests again per render.
          const itemCountFor = (catId: string): number => {
            let n = 0;
            for (const test of rankTests) {
              const c = test.categories.find((tc) => tc.id === catId);
              if (c) n += c.items.length;
            }
            return n;
          };

          return (
            <div className="space-y-2 mt-2">
              {/* Section header + expand-all/collapse-all */}
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Other Categories on This Rank ({catsWithItems.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Open every <details> inside this section.
                      document
                        .querySelectorAll<HTMLDetailsElement>("[data-other-cat-details]")
                        .forEach((d) => { d.open = true; });
                    }}
                    className="text-[10px] text-primary hover:underline"
                    title="Expand every other category"
                  >
                    Expand all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .querySelectorAll<HTMLDetailsElement>("[data-other-cat-details]")
                        .forEach((d) => { d.open = false; });
                    }}
                    className="text-[10px] text-gray-400 hover:underline"
                    title="Collapse every other category"
                  >
                    Collapse all
                  </button>
                </div>
              </div>
              {catsWithItems.map(cat => {
                // allCategories only tracks id/name/testId; the full
                // Category (with `type`) lives on rankTests. Look it up
                // once here so we can pass the current type down.
                let liveType: CategoryType = "demonstration";
                for (const test of rankTests) {
                  const c = test.categories.find((tc) => tc.id === cat.id);
                  if (c?.type) { liveType = c.type; break; }
                }
                const count = itemCountFor(cat.id);
                return (
                <details
                  key={cat.id}
                  data-other-cat-details
                  className="group rounded-lg border border-gray-200 bg-white overflow-hidden"
                >
                  <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between hover:bg-gray-50 select-none">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform group-open:rotate-90"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-sm font-medium text-gray-800 truncate">{cat.name}</span>
                      <span className="text-[10px] font-normal text-gray-400 whitespace-nowrap">
                        {count} {count === 1 ? "item" : "items"}
                      </span>
                    </div>
                  </summary>
                  <div className="border-t border-gray-100">
                <CategorySpreadsheet
                  key={cat.id}
                  categoryId={cat.id}
                  categoryName={cat.name}
                  sectionType={liveType}
                  onChangeSectionType={async (nextType) => {
                    // Optimistic: patch the local rankTests tree so the
                    // dropdown flips instantly, then persist. On failure
                    // we snap back to the server's copy via onReload.
                    setRankTests((prev) =>
                      prev.map((t) => ({
                        ...t,
                        categories: t.categories.map((c) =>
                          c.id === cat.id ? { ...c, type: nextType } : c,
                        ),
                      })),
                    );
                    const testId = rankTests.find((t) =>
                      t.categories.some((c) => c.id === cat.id),
                    )?.id;
                    if (!testId) return;
                    const res = await fetch(`/api/rank-tests/${testId}/categories`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ categoryId: cat.id, type: nextType }),
                    });
                    if (!res.ok) {
                      const r = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
                      if (r.ok) { const d = await r.json(); setRankTests(d.rankTests || d.tests || []); }
                    }
                  }}
                  rankTests={rankTests}
                  selectedStyleId={selectedStyleId}
                  selectedRankId={selectedRankId}
                  selectedCategoryId={selectedCategoryId}
                  onReload={async () => {
                    const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
                    if (res.ok) { const d = await res.json(); const tests = d.rankTests || d.tests || []; setRankTests(tests); buildRowsForCategory(tests, selectedCategoryId); }
                  }}
                  getCategoryType={() => {
                    const name = cat.name.toLowerCase();
                    if (name.includes("technique")) return "technique";
                    if (name.includes("combo")) return "skill";
                    if (name.includes("knowledge")) return "knowledge";
                    if (name.includes("fitness")) return "workout";
                    if (name.includes("form") || name.includes("kata")) return "form";
                    if (name.includes("sparring")) return "sparring";
                    if (name.includes("breaking")) return "breaking";
                    return "skill";
                  }}
                  onDeleteCategory={() => deleteCategory(cat.id, cat.name)}
                  onDeleteFromAllRanks={() => deleteCustomCategory(cat.id, cat.name)}
                  ranks={ranks}
                />
                  </div>
                </details>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Reorder Sections Modal */}
      {showReorderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowReorderModal(false)}>
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-bold text-gray-900">Reorder Sections</h2>
              <button onClick={() => setShowReorderModal(false)} className="text-gray-400 hover:text-gray-600" title="Close without saving the new order">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorderDragEnd}>
                <SortableContext items={reorderList.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {reorderList.map(cat => (
                      <SortableCategoryItem key={cat.id} id={cat.id} name={cat.name} isActive={cat.id === selectedCategoryId} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <div className="border-t border-gray-200 px-5 py-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reorderThisRankOnly}
                  onChange={e => setReorderThisRankOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-primary"
                />
                <span className="text-xs text-gray-600">Lock this rank&apos;s order</span>
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={saveReorder} disabled={savingReorder} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50" title="Save the new category order">
                  {savingReorder ? "Saving..." : "Save Order"}
                </button>
                <button onClick={() => setShowReorderModal(false)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50" title="Close without saving the new order">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Disclaimer (per style) */}
      {selectedStyleId && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-700">PDF Disclaimer</label>
            <button
              onClick={async () => {
                setDisclaimerSaving(true);
                try {
                  await fetch(`/api/styles/${selectedStyleId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ curriculumDisclaimer: disclaimer }),
                  });
                } catch { alert("Failed to save disclaimer"); }
                finally { setDisclaimerSaving(false); }
              }}
              disabled={disclaimerSaving}
              className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              title="Save the disclaimer text shown at the bottom of every curriculum PDF for this style"
            >
              {disclaimerSaving ? "Saving..." : "Save"}
            </button>
          </div>
          <textarea
            value={disclaimer}
            onChange={e => setDisclaimer(e.target.value)}
            rows={2}
            placeholder="Text shown at the bottom of every curriculum PDF for this style..."
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">This text appears centered above the footer on every published PDF for this style.</p>
        </div>
      )}

      {/* Full content popup editor — close only via Save / Cancel / X. */}
      {popupCell && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div
            className="rounded-lg bg-white shadow-xl flex flex-col overflow-hidden"
            style={{ width: "min(640px, 95vw)", height: "min(560px, 85vh)", minWidth: 320, minHeight: 280, maxWidth: "95vw", maxHeight: "90vh", resize: "both" }}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-bold text-gray-900">Edit Content <span className="text-gray-400 font-normal text-[10px]">(drag corner to resize)</span></h2>
              <button
                tabIndex={-1}
                onClick={() => {
                  const el = document.getElementById("popup-editor");
                  if (el) updateRow(popupCell.rowIdx, popupCell.field, el.innerHTML.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0"));
                  setPopupCell(null);
                }}
                className="text-gray-400 hover:text-gray-600"
                title="Save and close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Formatting toolbar */}
            <div className="border-b border-gray-200 px-5 py-2 flex items-center gap-1">
              <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); document.execCommand("bold"); }} className="rounded px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100" title="Bold">B</button>
              <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); document.execCommand("italic"); }} className="rounded px-2 py-1 text-xs italic text-gray-700 hover:bg-gray-100" title="Italic">I</button>
              <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); document.execCommand("underline"); }} className="rounded px-2 py-1 text-xs underline text-gray-700 hover:bg-gray-100" title="Underline">U</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              <div
                ref={popupCellEditorRef}
                id="popup-editor"
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: popupCell.value.replace(/\n/g, "<br>") }}
                style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12, lineHeight: 1.4 }} className="w-full h-full min-h-[200px] rounded-md border border-gray-300 px-3 py-2 whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
              <button tabIndex={-1}
                onClick={() => {
                  const el = document.getElementById("popup-editor");
                  if (el) updateRow(popupCell.rowIdx, popupCell.field, el.innerHTML.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0"));
                  setPopupCell(null);
                }}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                title="Save the edited description"
              >
                Save
              </button>
              <button tabIndex={-1}
                onClick={() => setPopupCell(null)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                title="Close without saving changes"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
