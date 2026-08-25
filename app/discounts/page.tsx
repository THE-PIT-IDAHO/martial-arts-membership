"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type Scope = "POS" | "MEMBERSHIP" | "PROMOTION" | "ALL";

type Template = {
  id: string;
  name: string;
  description: string | null;
  appliesTo: Scope;
  percentOff: number | null;
  flatCents: number | null;
  oneTime: boolean;
  active: boolean;
  sortOrder: number;
};

type EditorState = {
  id: string | null;
  name: string;
  description: string;
  appliesTo: Scope;
  percentStr: string;
  flatDollars: string;
  oneTime: boolean;
  active: boolean;
  saving: boolean;
  error: string | null;
};

const SCOPE_LABEL: Record<Scope, string> = {
  ALL: "All charges",
  POS: "POS purchases only",
  MEMBERSHIP: "Membership billing only",
  PROMOTION: "Promotion / test fees only",
};

function formatAmount(t: Template): string {
  if (t.percentOff && t.flatCents) return `${t.percentOff}% + $${(t.flatCents / 100).toFixed(2)}`;
  if (t.percentOff) return `${t.percentOff}%`;
  if (t.flatCents) return `$${(t.flatCents / 100).toFixed(2)}`;
  return "—";
}

export default function DiscountsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/discount-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch {
      /* ignore -- table just stays empty */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function openNew() {
    setEditor({
      id: null,
      name: "",
      description: "",
      appliesTo: "ALL",
      percentStr: "",
      flatDollars: "",
      oneTime: false,
      active: true,
      saving: false,
      error: null,
    });
  }

  function openEdit(t: Template) {
    setEditor({
      id: t.id,
      name: t.name,
      description: t.description || "",
      appliesTo: t.appliesTo,
      percentStr: t.percentOff != null ? String(t.percentOff) : "",
      flatDollars: t.flatCents != null ? (t.flatCents / 100).toFixed(2) : "",
      oneTime: t.oneTime,
      active: t.active,
      saving: false,
      error: null,
    });
  }

  function closeEditor() {
    setEditor(null);
  }

  async function saveEditor() {
    if (!editor) return;
    if (!editor.name.trim()) {
      setEditor({ ...editor, error: "Give the discount a name." });
      return;
    }
    const percent = editor.percentStr.trim() ? Number(editor.percentStr) : 0;
    const flat = editor.flatDollars.trim() ? Math.round(Number(editor.flatDollars) * 100) : 0;
    if ((!percent || Number.isNaN(percent)) && (!flat || Number.isNaN(flat))) {
      setEditor({ ...editor, error: "Enter a percent or flat amount." });
      return;
    }
    setEditor({ ...editor, saving: true, error: null });
    try {
      const payload = {
        name: editor.name.trim(),
        description: editor.description.trim() || null,
        appliesTo: editor.appliesTo,
        percentOff: percent || null,
        flatCents: flat || null,
        oneTime: editor.oneTime,
        active: editor.active,
      };
      const res = await fetch(
        editor.id ? `/api/discount-templates/${editor.id}` : "/api/discount-templates",
        {
          method: editor.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditor((prev) => (prev ? { ...prev, saving: false, error: data.error || "Failed to save" } : prev));
        return;
      }
      await reload();
      closeEditor();
    } catch {
      setEditor((prev) => (prev ? { ...prev, saving: false, error: "Failed to save" } : prev));
    }
  }

  async function toggleActive(t: Template) {
    try {
      await fetch(`/api/discount-templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          description: t.description,
          appliesTo: t.appliesTo,
          percentOff: t.percentOff,
          flatCents: t.flatCents,
          oneTime: t.oneTime,
          active: !t.active,
          sortOrder: t.sortOrder,
        }),
      });
      await reload();
    } catch {
      /* leave the row visibly stale; user can retry */
    }
  }

  async function handleDelete(t: Template) {
    if (
      !window.confirm(
        `Delete template "${t.name}"? Members who already have this discount attached keep it -- the template just stops appearing in the picker for new attachments.`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/discount-templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Failed to delete template");
        return;
      }
      await reload();
    } catch {
      alert("Failed to delete template");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Discounts</h1>
            <p className="mt-1 text-sm text-gray-600">
              Reusable discount templates. Attach one to a member from their profile to apply it at POS + recurring
              billing without re-typing amounts.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primaryDark"
          >
            Add Discount
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No discount templates yet. Use <button type="button" onClick={openNew} className="text-primary hover:underline">Add Discount</button> to create your first one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Amount</th>
                  <th className="px-4 py-2 font-semibold">Applies To</th>
                  <th className="px-4 py-2 font-semibold">Duration</th>
                  <th className="px-4 py-2 font-semibold">Active</th>
                  <th className="px-4 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((t) => (
                  <tr key={t.id} className={t.active ? "" : "opacity-60"}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-gray-900">{t.name}</div>
                      {t.description && (
                        <div className="mt-0.5 text-xs text-gray-500">{t.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top font-semibold text-gray-900">{formatAmount(t)}</td>
                    <td className="px-4 py-3 align-top text-gray-700">{SCOPE_LABEL[t.appliesTo]}</td>
                    <td className="px-4 py-3 align-top text-gray-700">{t.oneTime ? "One-time" : "Lasting"}</td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => toggleActive(t)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          t.active
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        title={t.active ? "Hide from picker" : "Show in picker"}
                      >
                        {t.active ? "On" : "Off"}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="text-xs font-semibold text-primary hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeEditor}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editor.id ? "Edit Discount" : "New Discount"}</h2>
              <button type="button" onClick={closeEditor} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="e.g. Family Discount"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Notes (optional)</label>
                <input
                  type="text"
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                  placeholder="e.g. 10% off any extra family member"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">Applies To</label>
                <select
                  value={editor.appliesTo}
                  onChange={(e) => setEditor({ ...editor, appliesTo: e.target.value as Scope })}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="ALL">All charges</option>
                  <option value="POS">POS purchases only</option>
                  <option value="MEMBERSHIP">Membership billing only</option>
                  <option value="PROMOTION">Promotion / test fees only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Percent off</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editor.percentStr}
                    onChange={(e) => setEditor({ ...editor, percentStr: e.target.value })}
                    placeholder="e.g. 10"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Flat $ off</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editor.flatDollars}
                    onChange={(e) => setEditor({ ...editor, flatDollars: e.target.value })}
                    placeholder="e.g. 5.00"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                Either or both. Both stack additively on top of any plan-level discount.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.oneTime}
                  onChange={(e) => setEditor({ ...editor, oneTime: e.target.checked })}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                One-time (auto-disables after first charge)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.active}
                  onChange={(e) => setEditor({ ...editor, active: e.target.checked })}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                Show in the member-profile picker
              </label>
              {editor.error && <p className="text-xs text-red-600">{editor.error}</p>}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditor}
                disabled={editor.saving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {editor.saving ? "Saving..." : editor.id ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
