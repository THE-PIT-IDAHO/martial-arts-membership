"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
type Category = { id: string; name: string; sortOrder: number; items: Item[] };
type Item = {
  id: string; name: string; type: string; description?: string | null;
  sets?: number | null; rounds?: number | null; reps?: number | null;
  roundDuration?: string | null; duration?: string | null; distance?: string | null;
  timeLimit?: string | null; sortOrder: number; createdAt?: string;
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
        <button type="button" onClick={onEditClick} className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark">Edit</button>
      )}
    </div>
  );
}

function CategorySpreadsheet({ categoryId, categoryName, rankTests, selectedStyleId, selectedRankId, selectedCategoryId, onReload, getCategoryType, onDeleteCategory, onDeleteFromAllRanks, ranks }: {
  categoryId: string; categoryName: string; rankTests: RankTest[];
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
  const [editPopup, setEditPopup] = useState<{ itemId: string; value: string } | null>(null);
  const [copying, setCopying] = useState(false);

  async function copyToAllRanks() {
    if (!confirm(`Copy "${categoryName}" items to all other ranks in this style?`)) return;
    setCopying(true);
    try {
      const otherRanks = ranks.filter(r => r.id !== selectedRankId);
      await Promise.all(otherRanks.map(async (rank) => {
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
        // Delete existing items in this category on the other rank
        for (const item of otherCat.items) {
          await fetch(`/api/rank-tests/${otherTestId}/items?itemId=${item.id}`, { method: "DELETE" });
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
      alert(`"${categoryName}" copied to ${otherRanks.length} rank${otherRanks.length !== 1 ? "s" : ""}.`);
    } catch { alert("Failed to copy to all ranks"); }
    finally { setCopying(false); }
  }

  let items: Item[] = [];
  let testId = "";
  for (const test of rankTests) {
    const c = test.categories.find(tc => tc.id === categoryId);
    if (c) { items = [...c.items].sort((a, b) => a.sortOrder - b.sortOrder); testId = test.id; }
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
      <div className="bg-gray-200 border-b border-gray-300 px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{categoryName}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{items.length} items</span>
          <button onClick={copyToAllRanks} disabled={copying || items.length === 0} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
            {copying ? "Copying..." : "Copy to All Ranks"}
          </button>
          <button onClick={onDeleteCategory} className="rounded-md bg-white border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Delete Section</button>
          <button onClick={onDeleteFromAllRanks} className="rounded-md bg-white border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Delete from All Ranks</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-100 border-b border-gray-300">
          <tr>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500" style={{ width: "100%", minWidth: "250px" }}>Item Information</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-24">Video</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Reps</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Sets</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Min/Rd</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Rnds</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Duration</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Distance</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-28">Time Limit</th>
            <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-t border-gray-200 hover:bg-gray-200">
              <td className="px-2 py-1 overflow-hidden" style={{ maxWidth: 0 }}>
                <RichInput
                  defaultValue={item.description || item.name}
                  onSave={html => { updateField(item.id, "description", html || null); updateField(item.id, "name", html?.replace(/<[^>]*>/g, "").split("\n")[0].substring(0, 100).trim() || ""); }}
                  className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                  onEditClick={() => setEditPopup({ itemId: item.id, value: item.description || "" })}
                />
              </td>
              <td className="px-2 py-1"><input type="text" defaultValue={(item as Record<string, unknown>).videoUrl as string || ""} onBlur={e => updateField(item.id, "videoUrl", e.target.value || null)} placeholder="URL" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
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
              <td className="px-2 py-1 text-center"><button onClick={() => deleteItem(item.id, item.name)} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Delete</button></td>
            </tr>
          ))}
          {/* Add new row */}
          <tr className="border-t border-gray-200 bg-gray-100">
            <td className="px-2 py-1 overflow-hidden" style={{ maxWidth: 0 }}><input type="text" value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addItem(); }} onPaste={handleAddRowPaste} placeholder="Type to add..." className="w-full rounded border border-gray-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
            <td className="px-2 py-1"><input type="text" value="" onChange={() => {}} placeholder="URL" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" /></td>
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
            <td className="px-2 py-1 text-center">
              {newItemDesc.trim() && <button onClick={addItem} disabled={addingItem} className="text-primary hover:text-primaryDark text-xs font-semibold">+</button>}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* Description edit popup */}
    {editPopup && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={async () => {
        await updateField(editPopup.itemId, "description", editPopup.value);
        setEditPopup(null);
        await onReload();
      }}>
        <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">Edit Description</h2>
            <button onClick={async () => { await updateField(editPopup.itemId, "description", editPopup.value); setEditPopup(null); await onReload(); }} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="border-b border-gray-200 px-5 py-2 flex items-center gap-1">
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("bold"); }} className="rounded px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100">B</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("italic"); }} className="rounded px-2 py-1 text-xs italic text-gray-700 hover:bg-gray-100">I</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("underline"); }} className="rounded px-2 py-1 text-xs underline text-gray-700 hover:bg-gray-100">U</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <div id="cat-popup-editor" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: editPopup.value.replace(/\n/g, "<br>") }} className="w-full min-h-[256px] rounded-md border border-gray-300 px-3 py-2 text-sm whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
            <button onClick={async () => { const el = document.getElementById("cat-popup-editor"); if (el) await updateField(editPopup.itemId, "description", el.innerHTML.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0")); setEditPopup(null); await onReload(); }} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Save</button>
            <button onClick={() => setEditPopup(null)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
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
  const [popupCell, setPopupCell] = useState<{ rowIdx: number; field: keyof Row; value: string } | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderList, setReorderList] = useState<{ id: string; name: string }[]>([]);
  const [savingReorder, setSavingReorder] = useState(false);
  const [reorderThisRankOnly, setReorderThisRankOnly] = useState(false);
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

    // Load disclaimer from style detail
    if (selectedStyleId) {
      fetch(`/api/styles/${selectedStyleId}`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.style?.curriculumDisclaimer !== undefined) {
          setDisclaimer(d.style.curriculumDisclaimer || "");
        } else {
          setDisclaimer("Coach has final say for promotion and not everyone will promote every ceremony. Promotion depends on the following:\nattendance, skill recollection, good behavior, effort and fitness");
        }
      }).catch(() => {});
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

      // Ensure default categories + custom categories from other ranks exist
      if (tests.length > 0) {
        const testId = tests[0].id;
        const existingCatNames = new Set(tests.flatMap(t => t.categories.map(c => c.name)));
        let added = false;

        // Add missing default categories
        for (let i = 0; i < defaultCats.length; i++) {
          if (!existingCatNames.has(defaultCats[i])) {
            await fetch(`/api/rank-tests/${testId}/categories`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: defaultCats[i], sortOrder: i }),
            });
            added = true;
          }
        }

        // Pull custom categories from other ranks in the same style (parallel fetch)
        const otherRanks = ranks.filter(r => r.id !== selectedRankId);
        if (otherRanks.length > 0) {
          const otherResults = await Promise.all(
            otherRanks.map(r => fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${r.id}`).then(res => res.ok ? res.json() : null).catch(() => null))
          );
          const missingCats: { name: string; sortOrder: number }[] = [];
          for (const otherData of otherResults) {
            if (!otherData) continue;
            const otherTests: RankTest[] = otherData.rankTests || otherData.tests || [];
            for (const ot of otherTests) {
              for (const oc of ot.categories) {
                if (!existingCatNames.has(oc.name)) {
                  missingCats.push({ name: oc.name, sortOrder: oc.sortOrder });
                  existingCatNames.add(oc.name);
                }
              }
            }
          }
          if (missingCats.length > 0) {
            await Promise.all(missingCats.map(cat =>
              fetch(`/api/rank-tests/${testId}/categories`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: cat.name, sortOrder: cat.sortOrder }),
              })
            ));
            added = true;
          }
        }

        if (added) {
          const res2 = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
          if (res2.ok) { const d2 = await res2.json(); tests = d2.rankTests || d2.tests || []; }
        }
      }

      if (cancelled) return;
      setRankTests(tests);

      // Build category list from all tests (deduplicated)
      const cats = buildCategoryList(tests);
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

  // Rebuild rows when category changes
  useEffect(() => {
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
      const cols = 9;
      let nextRow = rowIdx;
      let nextCol = colIdx + 1;
      if (nextCol >= cols) { nextCol = 0; nextRow++; }
      if (nextRow >= rows.length) return;
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

  async function copyMainCategoryToAllRanks() {
    if (!selectedCategoryId || !selectedCategory) return;
    if (!confirm(`Copy "${selectedCategory.name}" items to all other ranks in this style?`)) return;
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

      const otherRanks = ranks.filter(r => r.id !== selectedRankId);
      await Promise.all(otherRanks.map(async (rank) => {
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
        // Delete existing items
        for (const item of otherCat.items) {
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
      alert(`"${selectedCategory.name}" copied to ${otherRanks.length} rank${otherRanks.length !== 1 ? "s" : ""}.`);
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
        let tests: RankTest[] = d.rankTests || d.tests || [];

        // Check if the current category is now empty — if it's not a default, delete it
        // If it IS a default, just leave it empty (it'll stay in the dropdown)
        const defaultCats = ["Knowledge", "Techniques", "Combos", "Fitness", "Sparring", "Forms/Katas", "Board Breaking"];
        let needsReload = false;

        for (const test of tests) {
          for (const cat of test.categories) {
            if (cat.items.length === 0 && !defaultCats.includes(cat.name)) {
              // Non-default empty category — delete it
              await fetch(`/api/rank-tests/${test.id}/categories?categoryId=${cat.id}`, { method: "DELETE" });
              needsReload = true;
            }
          }
        }

        if (needsReload) {
          const res2 = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
          if (res2.ok) { const d2 = await res2.json(); tests = d2.rankTests || d2.tests || []; }
          const updatedCats = buildCategoryList(tests);
          setAllCategories(updatedCats);
          if (!updatedCats.find(c => c.id === selectedCategoryId) && updatedCats.length > 0) {
            setSelectedCategoryId(updatedCats[0].id);
          }
        }

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
        const newCat = { id: data.category.id, name: data.category.name, testId };
        setAllCategories(prev => [...prev, newCat]);
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
    // Use the current saved order (allCategories is already sorted by sortOrder)
    setReorderList(allCategories.map(c => ({ id: c.id, name: c.name })));
    setReorderThisRankOnly(false);
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
      // Save order on current rank
      await Promise.all(reorderList.map((cat, i) =>
        fetch(`/api/rank-tests/${testId}/categories`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: cat.id, sortOrder: i }),
        })
      ));

      // Apply to all other ranks unless "this rank only" is checked
      if (!reorderThisRankOnly) {
        const orderByName: Record<string, number> = {};
        reorderList.forEach((cat, i) => { orderByName[cat.name.trim().toLowerCase()] = i; });

        const otherRanks = ranks.filter(r => r.id !== selectedRankId);
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

    const categoryOrderMap: Record<string, number> = {};
    allCategories.forEach((cat, i) => { categoryOrderMap[cat.name.trim().toLowerCase()] = i; });
    console.log("Category order for publish:", allCategories.map((c, i) => `${i}: ${c.name}`));

    const rankTestResults = await Promise.all(
      ranksToPublish.map(rank =>
        fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${rank.id}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(data => {
            const tests = (data?.rankTests || data?.tests || []) as PdfRankTest[];
            for (const test of tests) {
              test.categories.sort((a, b) => {
                const aOrder = categoryOrderMap[a.name.trim().toLowerCase()] ?? 999;
                const bOrder = categoryOrderMap[b.name.trim().toLowerCase()] ?? 999;
                return aOrder - bOrder;
              });
              test.categories.forEach((cat, i) => { cat.sortOrder = i; });
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

  return (
    <AppLayout>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Curriculum Builder</h1>
            <p className="text-sm text-gray-500">Select a category and start typing</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
              {saving ? "Saving..." : hasChanges ? "Save Changes" : "Save"}
            </button>
            <button onClick={handleSaveAndPublish} disabled={publishing} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
              {publishing ? "Publishing..." : "Save & Publish"}
            </button>
            <button onClick={handlePublishAll} disabled={publishing} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">
              {publishing ? "Publishing..." : "Publish All Ranks"}
            </button>
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
              <button onClick={() => setShowAddCategory(!showAddCategory)} className="rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark">
                {showAddCategory ? "Cancel" : "Add Category"}
              </button>
              {selectedCategoryId && !["Knowledge", "Techniques", "Combos", "Fitness", "Sparring", "Forms/Katas", "Board Breaking"].includes(allCategories.find(c => c.id === selectedCategoryId)?.name || "") && (
                <button
                  onClick={async () => {
                    const cat = allCategories.find(c => c.id === selectedCategoryId);
                    if (!cat) return;
                    if (!confirm(`Remove "${cat.name}" from all ranks? This deletes the category and all its items permanently.`)) return;
                    try {
                      // Delete from current rank
                      const testId = getTestId();
                      if (testId) await fetch(`/api/rank-tests/${testId}/categories?categoryId=${cat.id}`, { method: "DELETE" });
                      // Delete from all other ranks
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
                      // Reload
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
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                >
                  Remove Category
                </button>
              )}
              <button
                onClick={openReorderModal}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
              >
                Reorder
              </button>
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
              <button onClick={addCategory} disabled={!newCategoryName.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
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
            <div className="bg-gray-200 border-b border-gray-300 px-4 py-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{selectedCategory?.name}</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{rows.filter(r => r.description?.trim()).length} items</span>
                <button onClick={copyMainCategoryToAllRanks} disabled={copyingMain || rows.filter(r => r.description?.trim()).length === 0} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                  {copyingMain ? "Copying..." : "Copy to All Ranks"}
                </button>
                <button onClick={() => selectedCategory && deleteCategory(selectedCategory.id, selectedCategory.name)} className="rounded-md bg-white border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Delete Section</button>
                <button onClick={() => selectedCategory && deleteCustomCategory(selectedCategory.id, selectedCategory.name)} className="rounded-md bg-white border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Delete from All Ranks</button>
              </div>
            </div>
            <table ref={tableRef} className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500" style={{ width: "100%", minWidth: "250px" }}>Item Information</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-24">Video</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Reps</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Sets</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Min/Rd</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Rnds</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Duration</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Distance</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-28">Time Limit</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.itemId} className={`border-t border-gray-200 hover:bg-gray-200 ${row.isNew && !row.description ? "bg-gray-100" : ""}`}>
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
                            >
                              Edit
                            </button>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input type="text" data-row={idx} data-col={1} value={row.videoUrl} onChange={e => updateRow(idx, "videoUrl", e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 1)} placeholder="URL" className="w-full rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white" />
                    </td>
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
                    <td className="px-2 py-1 text-center">
                      {!row.isNew && (
                        <button onClick={() => deleteRow(idx)} className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
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

          return (
            <div className="space-y-3 mt-2">
              {catsWithItems.map(cat => (
                <CategorySpreadsheet
                  key={cat.id}
                  categoryId={cat.id}
                  categoryName={cat.name}
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
              ))}
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
              <button onClick={() => setShowReorderModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-gray-500 mb-3">Drag to reorder. This only affects the current rank.</p>
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
                <span className="text-xs text-gray-600">Apply to this rank only</span>
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={saveReorder} disabled={savingReorder} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                  {savingReorder ? "Saving..." : "Save Order"}
                </button>
                <button onClick={() => setShowReorderModal(false)} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
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

      {/* Full content popup editor */}
      {popupCell && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => {
          // Save and close
          updateRow(popupCell.rowIdx, popupCell.field, popupCell.value);
          setPopupCell(null);
        }}>
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h2 className="text-sm font-bold text-gray-900">Edit Content</h2>
              <button
                onClick={() => {
                  const el = document.getElementById("popup-editor");
                  if (el) updateRow(popupCell.rowIdx, popupCell.field, el.innerHTML.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0"));
                  setPopupCell(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Formatting toolbar */}
            <div className="border-b border-gray-200 px-5 py-2 flex items-center gap-1">
              <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("bold"); }} className="rounded px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100" title="Bold">B</button>
              <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("italic"); }} className="rounded px-2 py-1 text-xs italic text-gray-700 hover:bg-gray-100" title="Italic">I</button>
              <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("underline"); }} className="rounded px-2 py-1 text-xs underline text-gray-700 hover:bg-gray-100" title="Underline">U</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div
                id="popup-editor"
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: popupCell.value.replace(/\n/g, "<br>") }}
                className="w-full min-h-[256px] rounded-md border border-gray-300 px-3 py-2 text-sm whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="border-t border-gray-200 px-5 py-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  const el = document.getElementById("popup-editor");
                  if (el) updateRow(popupCell.rowIdx, popupCell.field, el.innerHTML.replace(/([^\s>])&nbsp;/g, "$1 ").replace(/&nbsp;/g, "\u00A0"));
                  setPopupCell(null);
                }}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Save
              </button>
              <button
                onClick={() => setPopupCell(null)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
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
