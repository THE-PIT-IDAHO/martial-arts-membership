"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";

type Style = { id: string; name: string; ranks: { id: string; name: string; order: number }[] };
type RankTest = { id: string; name: string; rankId: string; categories: Category[] };
type Category = { id: string; name: string; sortOrder: number; items: Item[] };
type Item = {
  id: string; name: string; type: string; description?: string | null;
  sets?: number | null; rounds?: number | null; reps?: number | null;
  roundDuration?: string | null; duration?: string | null; distance?: string | null;
  timeLimit?: string | null; sortOrder: number;
};

type Row = {
  categoryId: string;
  categoryName: string;
  itemId: string;
  itemName: string;
  type: string;
  sets: string;
  rounds: string;
  reps: string;
  roundDuration: string;
  duration: string;
  distance: string;
  timeLimit: string;
  isNew?: boolean;
  isCategoryHeader?: boolean;
  testId: string;
};

const ITEM_TYPES = [
  { value: "skill", label: "Skill" },
  { value: "form", label: "Form/Kata" },
  { value: "technique", label: "Technique" },
  { value: "workout", label: "Workout" },
  { value: "sparring", label: "Sparring" },
  { value: "knowledge", label: "Knowledge" },
  { value: "breaking", label: "Breaking" },
  { value: "other", label: "Other" },
];

export default function CurriculumV2Page() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [ranks, setRanks] = useState<{ id: string; name: string; order: number }[]>([]);
  const [selectedRankId, setSelectedRankId] = useState("");
  const [rankTests, setRankTests] = useState<RankTest[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  // Load styles
  useEffect(() => {
    fetch("/api/styles").then(r => r.json()).then(d => {
      setStyles(d.styles || []);
      if (d.styles?.length > 0) setSelectedStyleId(d.styles[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Update ranks when style changes
  useEffect(() => {
    const style = styles.find(s => s.id === selectedStyleId);
    setRanks(style?.ranks || []);
    if (style?.ranks?.length) setSelectedRankId(style.ranks[0].id);
    else setSelectedRankId("");
  }, [selectedStyleId, styles]);

  // Load rank tests when rank changes
  useEffect(() => {
    if (!selectedRankId || !selectedStyleId) { setRows([]); return; }
    fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`)
      .then(r => r.json())
      .then(d => {
        setRankTests(d.tests || []);
        buildRows(d.tests || []);
      })
      .catch(() => {});
  }, [selectedRankId, selectedStyleId]);

  function buildRows(tests: RankTest[]) {
    const newRows: Row[] = [];
    for (const test of tests) {
      for (const cat of test.categories.sort((a, b) => a.sortOrder - b.sortOrder)) {
        for (const item of cat.items.sort((a, b) => a.sortOrder - b.sortOrder)) {
          newRows.push({
            categoryId: cat.id,
            categoryName: cat.name,
            itemId: item.id,
            itemName: item.name,
            type: item.type,
            sets: item.sets?.toString() || "",
            rounds: item.rounds?.toString() || "",
            reps: item.reps?.toString() || "",
            roundDuration: item.roundDuration || "",
            duration: item.duration || "",
            distance: item.distance || "",
            timeLimit: item.timeLimit || "",
            testId: test.id,
          });
        }
      }
    }
    // Add empty row at bottom for new entries
    if (tests.length > 0) {
      newRows.push(emptyRow(tests[0].id, tests[0].categories[0]?.id || "", tests[0].categories[0]?.name || ""));
    }
    setRows(newRows);
    setHasChanges(false);
  }

  function emptyRow(testId: string, categoryId: string, categoryName: string): Row {
    return {
      categoryId, categoryName, itemId: `new-${Date.now()}`, itemName: "",
      type: "skill", sets: "", rounds: "", reps: "", roundDuration: "",
      duration: "", distance: "", timeLimit: "", isNew: true, testId,
    };
  }

  const updateRow = useCallback((index: number, field: keyof Row, value: string) => {
    setRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // If editing the last row (empty one), add another empty row
      if (index === updated.length - 1 && value && field === "itemName") {
        const lastRow = updated[index];
        updated.push(emptyRow(lastRow.testId, lastRow.categoryId, lastRow.categoryName));
      }

      return updated;
    });
    setHasChanges(true);
  }, []);

  // Handle Tab/Enter to move between cells
  function handleKeyDown(e: React.KeyboardEvent, rowIdx: number, colIdx: number) {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      const cols = 8; // number of editable columns
      let nextRow = rowIdx;
      let nextCol = colIdx + 1;
      if (nextCol >= cols) { nextCol = 0; nextRow++; }
      if (nextRow >= rows.length) return;

      // Focus next cell
      const nextInput = tableRef.current?.querySelector(
        `[data-row="${nextRow}"][data-col="${nextCol}"]`
      ) as HTMLElement;
      nextInput?.focus();
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const row of rows) {
        if (!row.itemName.trim()) continue;

        if (row.isNew) {
          // Need a category — find or create
          let categoryId = row.categoryId;
          if (!categoryId || categoryId.startsWith("new-")) {
            // Create category first
            const catRes = await fetch(`/api/rank-tests/${row.testId}/categories`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: row.categoryName || "General" }),
            });
            if (catRes.ok) {
              const catData = await catRes.json();
              categoryId = catData.category.id;
            } else continue;
          }

          // Create item
          await fetch(`/api/rank-tests/${row.testId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId,
              name: row.itemName,
              type: row.type,
              sets: row.sets ? parseInt(row.sets) : null,
              rounds: row.rounds ? parseInt(row.rounds) : null,
              reps: row.reps ? parseInt(row.reps) : null,
              roundDuration: row.roundDuration || null,
              duration: row.duration || null,
              distance: row.distance || null,
              timeLimit: row.timeLimit || null,
            }),
          });
        } else {
          // Update existing item
          await fetch(`/api/rank-tests/${row.testId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: row.itemId,
              name: row.itemName,
              type: row.type,
              sets: row.sets ? parseInt(row.sets) : null,
              rounds: row.rounds ? parseInt(row.rounds) : null,
              reps: row.reps ? parseInt(row.reps) : null,
              roundDuration: row.roundDuration || null,
              duration: row.duration || null,
              distance: row.distance || null,
              timeLimit: row.timeLimit || null,
            }),
          });
        }
      }

      // Reload
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}&rankId=${selectedRankId}`);
      if (res.ok) {
        const d = await res.json();
        setRankTests(d.tests || []);
        buildRows(d.tests || []);
      }
      setHasChanges(false);
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save some changes");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(index: number) {
    const row = rows[index];
    if (row.isNew) {
      setRows(prev => prev.filter((_, i) => i !== index));
      return;
    }
    if (!confirm(`Delete "${row.itemName}"?`)) return;
    try {
      await fetch(`/api/rank-tests/${row.testId}/items?itemId=${row.itemId}`, { method: "DELETE" });
      setRows(prev => prev.filter((_, i) => i !== index));
    } catch {
      alert("Failed to delete");
    }
  }

  const selectedStyle = styles.find(s => s.id === selectedStyleId);
  const selectedRank = ranks.find(r => r.id === selectedRankId);

  // Get unique categories for the category dropdown
  const categories = [...new Set(rows.filter(r => r.categoryName).map(r => r.categoryName))];

  return (
    <AppLayout>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Curriculum Builder <span className="text-xs text-gray-400 font-normal">v2</span></h1>
            <p className="text-sm text-gray-500">Spreadsheet-style editing — just type and tab</p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button onClick={handleSave} disabled={saving} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
            <a href="/curriculum" className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Switch to Classic
            </a>
          </div>
        </div>

        {/* Style & Rank Selection */}
        <div className="flex flex-wrap gap-4">
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
        </div>

        {/* Spreadsheet */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : !selectedRankId ? (
          <p className="text-sm text-gray-500">Select a style and rank to edit curriculum.</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500 mb-3">No curriculum for {selectedRank?.name} yet.</p>
            <p className="text-xs text-gray-400">This rank needs a test created first. Use the <a href="/curriculum" className="text-primary hover:underline">Classic view</a> to create the initial test and categories.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table ref={tableRef} className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 w-36">Category</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 w-12">Type</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Name</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Sets</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Rnds</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-14">Reps</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Min/Rd</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-20">Duration</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 w-10">Del</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.itemId} className={`border-t border-gray-100 hover:bg-gray-50 ${row.isNew && !row.itemName ? "bg-gray-50/50" : ""}`}>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        data-row={idx} data-col={0}
                        value={row.categoryName}
                        onChange={e => updateRow(idx, "categoryName", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 0)}
                        list="categories-list"
                        placeholder="Category..."
                        className="w-full rounded border border-transparent px-1 py-0.5 text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        data-row={idx} data-col={1}
                        value={row.type}
                        onChange={e => updateRow(idx, "type", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 1)}
                        className="w-full rounded border border-transparent px-0.5 py-0.5 text-[11px] focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        data-row={idx} data-col={2}
                        value={row.itemName}
                        onChange={e => updateRow(idx, "itemName", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 2)}
                        placeholder={row.isNew ? "Type to add..." : ""}
                        className="w-full rounded border border-transparent px-1 py-0.5 text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number" min={0}
                        data-row={idx} data-col={3}
                        value={row.sets}
                        onChange={e => updateRow(idx, "sets", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 3)}
                        placeholder="#"
                        className="no-spinner w-full rounded border border-transparent px-1 py-0.5 text-center text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number" min={0}
                        data-row={idx} data-col={4}
                        value={row.rounds}
                        onChange={e => updateRow(idx, "rounds", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 4)}
                        placeholder="#"
                        className="no-spinner w-full rounded border border-transparent px-1 py-0.5 text-center text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number" min={0}
                        data-row={idx} data-col={5}
                        value={row.reps}
                        onChange={e => updateRow(idx, "reps", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 5)}
                        placeholder="#"
                        className="no-spinner w-full rounded border border-transparent px-1 py-0.5 text-center text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        data-row={idx} data-col={6}
                        value={row.roundDuration}
                        onChange={e => updateRow(idx, "roundDuration", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 6)}
                        placeholder="e.g. 3m"
                        className="w-full rounded border border-transparent px-1 py-0.5 text-center text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        data-row={idx} data-col={7}
                        value={row.duration}
                        onChange={e => updateRow(idx, "duration", e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 7)}
                        placeholder="e.g. 2 min"
                        className="w-full rounded border border-transparent px-1 py-0.5 text-center text-xs focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      {!row.isNew && (
                        <button onClick={() => deleteRow(idx)} className="text-gray-400 hover:text-gray-600 text-xs" title="Delete">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="categories-list">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
