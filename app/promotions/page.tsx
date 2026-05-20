"use client";

// Promotions page. Replaces the old "grading ceremony" flow with a flat
// quick-promote / bulk-promote workflow. Eligibility (all attendance reqs
// met) is shown as a visual badge; admin can promote anyone regardless.
//
// Data flow:
//   GET  /api/promotions/eligible  → rows per (member, style) ready to promote
//   POST /api/promotions           → records the promotion + POS transaction
//   GET  /api/promotions           → history of past promotions
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { getTodayString } from "@/lib/dates";

type EligibleRow = {
  memberId: string;
  memberName: string;
  photoUrl: string | null;
  styleId: string;
  styleName: string;
  fromRank: string | null;
  toRank: string;
  classRequirements: Array<{ label: string; attended: number; required: number; met: boolean }>;
  allRequirementsMet: boolean;
  attendanceResetDate: string | null;
  lastPromotionDate: string | null;
  fee: {
    baseCostCents: number;
    discountCents: number;
    costCents: number;
    discountSourcePlanName: string | null;
    source: "member" | "style" | "global" | "none";
  };
};

type HistoryRow = {
  id: string;
  promotedAt: string;
  toRank: string;
  fromRank: string | null;
  styleName: string;
  testResult: string | null;
  costCents: number;
  paymentStatus: string;
  paymentMethod: string | null;
  member: { id: string; firstName: string; lastName: string };
};

type PaymentMethod = "CARD" | "CASH" | "ACCOUNT" | "CHECK";
type TestResult = "PASSED" | "FAILED" | "NA";

type DraftItem = {
  row: EligibleRow;
  date: string;            // yyyy-mm-dd
  paymentMethod: PaymentMethod;
  testResult: TestResult;
  notes: string;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function rowKey(r: { memberId: string; styleId: string }) {
  return `${r.memberId}|${r.styleId}`;
}

export default function PromotionsPage() {
  const [tab, setTab] = useState<"eligible" | "history">("eligible");
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState<EligibleRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showOnlyEligible, setShowOnlyEligible] = useState(false);

  // Modal state — list of drafts being promoted at once (1 = quick, N = bulk)
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, hRes] = await Promise.all([
        fetch("/api/promotions/eligible"),
        fetch("/api/promotions"),
      ]);
      if (eRes.ok) {
        const d = await eRes.json();
        setEligible(d.promotions || []);
      }
      if (hRes.ok) {
        const d = await hRes.json();
        setHistory(d.promotions || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return eligible.filter((r) => {
      if (showOnlyEligible && !r.allRequirementsMet) return false;
      if (search.trim().length >= 2) {
        const q = search.trim().toLowerCase();
        if (!r.memberName.toLowerCase().includes(q) && !r.styleName.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [eligible, search, showOnlyEligible]);

  function toggleSelected(r: EligibleRow) {
    const key = rowKey(r);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }
  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) next.add(rowKey(r));
      return next;
    });
  }

  function openQuickPromote(row: EligibleRow) {
    setErrorMsg(null);
    setDrafts([makeDraft(row)]);
  }
  function openBulkPromote() {
    setErrorMsg(null);
    const rows = filtered.filter((r) => selected.has(rowKey(r)));
    if (rows.length === 0) return;
    setDrafts(rows.map(makeDraft));
  }
  function closeModal() {
    setDrafts([]);
    setErrorMsg(null);
  }

  function makeDraft(row: EligibleRow): DraftItem {
    return {
      row,
      date: getTodayString(),
      paymentMethod: row.fee.costCents > 0 ? "CASH" : "CASH",
      testResult: row.allRequirementsMet ? "PASSED" : "NA",
      notes: "",
    };
  }

  function updateDraft(idx: number, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitPromotions() {
    if (drafts.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = drafts.map((d) => ({
        memberId: d.row.memberId,
        styleId: d.row.styleId,
        toRank: d.row.toRank,
        fromRank: d.row.fromRank,
        date: d.date,
        testResult: d.testResult === "NA" ? null : d.testResult,
        paymentMethod: d.paymentMethod,
        notes: d.notes.trim() || undefined,
      }));
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || `Failed (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      const failures = (data.results || []).filter((r: { ok: boolean }) => !r.ok);
      if (failures.length > 0) {
        setErrorMsg(`Some promotions failed: ${failures.map((f: { error?: string }) => f.error || "unknown").join("; ")}`);
        return;
      }
      closeModal();
      clearSelection();
      await refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Promotions</h1>
            <p className="text-xs text-gray-500">Promote a student to their next rank — single or bulk.</p>
          </div>
          <Link
            href="/settings/promotions"
            className="text-xs text-primary hover:text-primaryDark"
          >
            Promotion settings →
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
          <button
            type="button"
            onClick={() => setTab("eligible")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === "eligible"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Ready to Promote
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            History
          </button>
        </div>

        {tab === "eligible" && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or style…"
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={showOnlyEligible}
                  onChange={(e) => setShowOnlyEligible(e.target.checked)}
                />
                Eligible only
              </label>
              <div className="flex-1" />
              <span className="text-xs text-gray-500">
                {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} shown`}
              </span>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={filtered.length === 0}
                className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={openBulkPromote}
                disabled={selected.size === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                Promote {selected.size > 0 ? `(${selected.size})` : "selected"}
              </button>
            </div>

            {loading ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-sm text-gray-500">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
                <p className="text-sm text-gray-500">
                  {eligible.length === 0
                    ? "No members currently set up for promotion."
                    : "No members match your filter."}
                </p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left w-8"></th>
                      <th className="px-3 py-2 text-left">Member</th>
                      <th className="px-3 py-2 text-left">Style</th>
                      <th className="px-3 py-2 text-left">Promoting</th>
                      <th className="px-3 py-2 text-left">Progress</th>
                      <th className="px-3 py-2 text-right">Fee</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => {
                      const key = rowKey(r);
                      const isSelected = selected.has(key);
                      return (
                        <tr key={key} className={isSelected ? "bg-primary/5" : "hover:bg-gray-50"}>
                          <td className="px-3 py-2 align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelected(r)}
                            />
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex items-center gap-2">
                              {r.photoUrl ? (
                                <img src={r.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gray-200" />
                              )}
                              <Link href={`/members/${r.memberId}`} className="font-medium text-gray-900 hover:text-primary">
                                {r.memberName}
                              </Link>
                              {r.allRequirementsMet && (
                                <span className="ml-1 inline-block px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold uppercase">
                                  Eligible
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 align-middle">{r.styleName}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 align-middle">
                            <span className="font-medium">{r.fromRank || "—"}</span>
                            <span className="mx-1 text-gray-400">→</span>
                            <span className="font-medium">{r.toRank}</span>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            {r.classRequirements.length === 0 ? (
                              <span className="text-[11px] text-gray-400">No requirements set</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {r.classRequirements.map((req, i) => (
                                  <span
                                    key={i}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      req.met
                                        ? "bg-green-100 text-green-700"
                                        : "bg-amber-100 text-amber-700"
                                    }`}
                                    title={req.label}
                                  >
                                    {req.label}: {req.attended}/{req.required}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            {r.fee.costCents === 0 && r.fee.baseCostCents === 0 ? (
                              <span className="text-[11px] text-gray-400">—</span>
                            ) : (
                              <div className="text-xs">
                                <div className="font-semibold text-gray-900">{dollars(r.fee.costCents)}</div>
                                {r.fee.discountCents > 0 && (
                                  <div className="text-[10px] text-gray-500">
                                    was {dollars(r.fee.baseCostCents)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right align-middle">
                            <button
                              type="button"
                              onClick={() => openQuickPromote(r)}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                            >
                              Promote
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {history.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500">No promotions recorded yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Member</th>
                    <th className="px-3 py-2 text-left">Style</th>
                    <th className="px-3 py-2 text-left">Promotion</th>
                    <th className="px-3 py-2 text-left">Test</th>
                    <th className="px-3 py-2 text-right">Fee</th>
                    <th className="px-3 py-2 text-left">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2 text-xs text-gray-700">{new Date(h.promotedAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/members/${h.member.id}`} className="text-gray-900 hover:text-primary font-medium">
                          {h.member.firstName} {h.member.lastName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{h.styleName}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {h.fromRank || "—"} <span className="text-gray-400">→</span> <span className="font-medium">{h.toRank}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {h.testResult === "PASSED" ? (
                          <span className="text-green-700 font-medium">Passed</span>
                        ) : h.testResult === "FAILED" ? (
                          <span className="text-red-700 font-medium">Failed</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-right text-gray-700">{dollars(h.costCents)}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {h.paymentMethod || "—"}
                        {h.paymentStatus !== "PAID" && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-100 text-red-700">
                            {h.paymentStatus}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* PROMOTE MODAL */}
      {drafts.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                {drafts.length === 1 ? "Promote member" : `Promote ${drafts.length} members`}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {drafts.map((d, idx) => (
                <div key={`${d.row.memberId}|${d.row.styleId}`} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm">
                      <span className="font-semibold">{d.row.memberName}</span>
                      <span className="text-gray-500 mx-1">·</span>
                      <span className="text-gray-700">{d.row.styleName}</span>
                      <span className="text-gray-500 mx-1">·</span>
                      <span className="text-gray-700">
                        {d.row.fromRank || "—"} <span className="text-gray-400">→</span> <span className="font-medium">{d.row.toRank}</span>
                      </span>
                    </div>
                    {drafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDraft(idx)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Promotion date
                      </label>
                      <input
                        type="date"
                        value={d.date}
                        onChange={(e) => updateDraft(idx, { date: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Test result
                      </label>
                      <select
                        value={d.testResult}
                        onChange={(e) => updateDraft(idx, { testResult: e.target.value as TestResult })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="NA">N/A</option>
                        <option value="PASSED">Passed</option>
                        <option value="FAILED">Failed</option>
                      </select>
                    </div>
                  </div>

                  {/* Fee */}
                  <div className="mt-3 bg-gray-50 rounded p-2 text-xs">
                    {d.row.fee.baseCostCents === 0 ? (
                      <div className="text-gray-500">No fee configured for this promotion.</div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Base fee ({d.row.fee.source})</span>
                          <span>{dollars(d.row.fee.baseCostCents)}</span>
                        </div>
                        {d.row.fee.discountCents > 0 && (
                          <div className="flex justify-between text-green-700">
                            <span>Discount{d.row.fee.discountSourcePlanName ? ` (${d.row.fee.discountSourcePlanName})` : ""}</span>
                            <span>−{dollars(d.row.fee.discountCents)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold border-t border-gray-200 pt-1 mt-1">
                          <span>Member owes</span>
                          <span>{dollars(d.row.fee.costCents)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {d.row.fee.costCents > 0 && (
                    <div className="mt-2">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Payment method
                      </label>
                      <select
                        value={d.paymentMethod}
                        onChange={(e) => updateDraft(idx, { paymentMethod: e.target.value as PaymentMethod })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card on file</option>
                        <option value="ACCOUNT">Account credit</option>
                        <option value="CHECK">Check</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {errorMsg && (
              <div className="px-5 pb-2 text-xs text-red-700">{errorMsg}</div>
            )}

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPromotions}
                disabled={submitting || drafts.length === 0}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {submitting ? "Promoting…" : `Promote ${drafts.length === 1 ? "member" : `${drafts.length} members`}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
