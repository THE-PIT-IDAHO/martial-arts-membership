"use client";

// Promotions page. Three tabs:
//   - Ready to Promote: live list of (member, style) rows. Quick promote
//     or select many for bulk. Style chips filter the list; multiple
//     selected styles intersect (show only those styles' rows).
//   - Events: scheduled promotion events. Each has a date + styles +
//     roster. Eligibility for an event is computed using each rank's
//     attendanceWindow against the event date (so a 6-month window from
//     a March 15 event counts classes Sept 15 - March 15).
//   - History: past Promotion records.
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
  fromRankOrder: number;
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

type EventRow = {
  id: string;
  name: string;
  date: string;
  status: string;
  styleId: string | null;
  styleName: string | null;
  styleIds: string | null;
  location: string | null;
  notes: string | null;
  applyAttendanceWindow: boolean;
  participants: Array<{ id: string; memberId: string; status: string }>;
};

type StyleOption = { id: string; name: string };

type PaymentMethod = "CARD" | "CASH" | "ACCOUNT" | "CHECK";
type TestResult = "PASSED" | "FAILED" | "NA";

type DraftItem = {
  row: EligibleRow;
  date: string;
  paymentMethod: PaymentMethod;
  testResult: TestResult;
  notes: string;
  // Admin can override the computed cost in the modal.
  costDollars: string;
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function rowKey(r: { memberId: string; styleId: string }) {
  return `${r.memberId}|${r.styleId}`;
}
function parseEventStyleIds(e: EventRow): string[] {
  if (e.styleIds) {
    try {
      const arr = JSON.parse(e.styleIds);
      if (Array.isArray(arr)) return arr.filter((s) => typeof s === "string");
    } catch { /* ignore */ }
  }
  return e.styleId ? [e.styleId] : [];
}

/** Standard button styling used across the app — solid red for primary
 * actions, outlined red for secondary. Both use the gym's "primary" (red)
 * Tailwind token. */
const BTN_PRIMARY =
  "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50";
// Secondary uses the same solid red as primary — almost every action
// button on the page is the brand red.
const BTN_SECONDARY = BTN_PRIMARY;
// White/gray neutral, reserved for the two dismissive actions on the
// event detail modal (Close + Delete event) so they visually de-emphasize
// against the red action buttons everywhere else.
const BTN_NEUTRAL =
  "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";

export default function PromotionsPage() {
  const [tab, setTab] = useState<"eligible" | "events" | "history">("eligible");
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState<EligibleRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [styles, setStyles] = useState<StyleOption[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showOnlyEligible, setShowOnlyEligible] = useState(false);
  const [styleFilter, setStyleFilter] = useState<Set<string>>(new Set());

  // Per-row fee overrides edited inline in the Ready-to-Promote table.
  // Keyed by rowKey(memberId|styleId). When the user opens the modal,
  // any pending override is passed into the draft so the modal opens with
  // the same number they just typed.
  const [feeOverrides, setFeeOverrides] = useState<Record<string, string>>({});
  function setFeeOverride(key: string, value: string) {
    setFeeOverrides((prev) => ({ ...prev, [key]: value }));
  }

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, hRes, evRes, stRes] = await Promise.all([
        fetch("/api/promotions/eligible"),
        fetch("/api/promotions"),
        fetch("/api/promotion-events"),
        fetch("/api/styles"),
      ]);
      if (eRes.ok) {
        const d = await eRes.json();
        setEligible(d.promotions || []);
      }
      if (hRes.ok) {
        const d = await hRes.json();
        setHistory(d.promotions || []);
      }
      if (evRes.ok) {
        const d = await evRes.json();
        setEvents(d.events || []);
      }
      if (stRes.ok) {
        const d = await stRes.json();
        setStyles((d.styles || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Style options that actually appear in the eligible list (don't show
  // chips for styles that have no promotable members).
  const stylesInList = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of eligible) {
      if (!seen.has(r.styleId)) seen.set(r.styleId, r.styleName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [eligible]);

  const filtered = useMemo(() => {
    return eligible.filter((r) => {
      if (showOnlyEligible && !r.allRequirementsMet) return false;
      if (styleFilter.size > 0 && !styleFilter.has(r.styleId)) return false;
      if (search.trim().length >= 2) {
        const q = search.trim().toLowerCase();
        if (!r.memberName.toLowerCase().includes(q) && !r.styleName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [eligible, search, showOnlyEligible, styleFilter]);

  function toggleStyleFilter(styleId: string) {
    setStyleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(styleId)) next.delete(styleId);
      else next.add(styleId);
      return next;
    });
  }

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

  function makeDraft(row: EligibleRow): DraftItem {
    // Honor the inline override if the admin already edited the fee in
    // the table, otherwise default to the computed cost.
    const override = feeOverrides[rowKey(row)];
    return {
      row,
      date: getTodayString(),
      paymentMethod: "CASH",
      testResult: row.allRequirementsMet ? "PASSED" : "NA",
      notes: "",
      costDollars:
        override !== undefined && override !== ""
          ? override
          : (row.fee.costCents / 100).toFixed(2),
    };
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
      const payload = drafts.map((d) => {
        const overrideDollars = Number(d.costDollars);
        const costOverrideCents =
          Number.isFinite(overrideDollars) && overrideDollars >= 0
            ? Math.round(overrideDollars * 100)
            : undefined;
        return {
          memberId: d.row.memberId,
          styleId: d.row.styleId,
          toRank: d.row.toRank,
          fromRank: d.row.fromRank,
          date: d.date,
          testResult: d.testResult === "NA" ? null : d.testResult,
          paymentMethod: d.paymentMethod,
          notes: d.notes.trim() || undefined,
          costOverrideCents,
        };
      });
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
            <p className="text-xs text-gray-500">Promote students individually, in bulk, or via a scheduled event.</p>
          </div>
          <Link href="/settings/promotions" className={BTN_PRIMARY}>
            Promotion Settings
          </Link>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
          {(["eligible", "events", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "eligible" ? "Ready to Promote" : t === "events" ? "Events" : "History"}
            </button>
          ))}
        </div>

        {tab === "eligible" && (
          <EligibleTab
            loading={loading}
            eligible={eligible}
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            showOnlyEligible={showOnlyEligible}
            setShowOnlyEligible={setShowOnlyEligible}
            stylesInList={stylesInList}
            styleFilter={styleFilter}
            toggleStyleFilter={toggleStyleFilter}
            selected={selected}
            toggleSelected={toggleSelected}
            clearSelection={clearSelection}
            selectAllVisible={selectAllVisible}
            openQuickPromote={openQuickPromote}
            openBulkPromote={openBulkPromote}
            feeOverrides={feeOverrides}
            setFeeOverride={setFeeOverride}
          />
        )}

        {tab === "events" && (
          <EventsTab
            events={events}
            styles={styles}
            onChange={refresh}
          />
        )}

        {tab === "history" && <HistoryTab history={history} />}
      </div>

      {drafts.length > 0 && (
        <PromoteModal
          drafts={drafts}
          submitting={submitting}
          errorMsg={errorMsg}
          updateDraft={updateDraft}
          removeDraft={removeDraft}
          submit={submitPromotions}
          close={closeModal}
        />
      )}
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ready to Promote tab
// ─────────────────────────────────────────────────────────────────────────

function EligibleTab(props: {
  loading: boolean;
  eligible: EligibleRow[];
  filtered: EligibleRow[];
  search: string;
  setSearch: (v: string) => void;
  showOnlyEligible: boolean;
  setShowOnlyEligible: (v: boolean) => void;
  stylesInList: Array<{ id: string; name: string }>;
  styleFilter: Set<string>;
  toggleStyleFilter: (id: string) => void;
  selected: Set<string>;
  toggleSelected: (r: EligibleRow) => void;
  clearSelection: () => void;
  selectAllVisible: () => void;
  openQuickPromote: (r: EligibleRow) => void;
  openBulkPromote: () => void;
  feeOverrides: Record<string, string>;
  setFeeOverride: (key: string, value: string) => void;
}) {
  const { loading, eligible, filtered, search, setSearch, showOnlyEligible, setShowOnlyEligible,
    stylesInList, styleFilter, toggleStyleFilter, selected, toggleSelected, clearSelection,
    selectAllVisible, openQuickPromote, openBulkPromote, feeOverrides, setFeeOverride } = props;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or style…"
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-64 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" checked={showOnlyEligible} onChange={(e) => setShowOnlyEligible(e.target.checked)} />
          Eligible only
        </label>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">
          {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} shown`}
        </span>
        {selected.size > 0 && (
          <button type="button" onClick={clearSelection} className="text-xs text-gray-600 hover:text-gray-800">
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
        <button type="button" onClick={openBulkPromote} disabled={selected.size === 0} className={BTN_PRIMARY}>
          Promote {selected.size > 0 ? `(${selected.size})` : "selected"}
        </button>
      </div>

      {/* Style filter chips — click to toggle multiple */}
      {stylesInList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 mr-1">Styles:</span>
          {stylesInList.map((s) => {
            const on = styleFilter.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStyleFilter(s.id)}
                className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                  on
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {s.name}
              </button>
            );
          })}
          {styleFilter.size > 0 && (
            <button
              type="button"
              onClick={() => stylesInList.forEach((s) => styleFilter.has(s.id) && toggleStyleFilter(s.id))}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline ml-1"
            >
              clear
            </button>
          )}
        </div>
      )}

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
                const showDiscountLine = r.fee.costCents > 0 && r.fee.discountCents > 0;
                return (
                  <tr key={key} className={isSelected ? "bg-primary/5" : "hover:bg-gray-50"}>
                    <td className="px-3 py-2 align-middle">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(r)} />
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
                                req.met ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
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
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              feeOverrides[key] !== undefined
                                ? feeOverrides[key]
                                : (r.fee.costCents / 100).toFixed(2)
                            }
                            onChange={(e) => setFeeOverride(key, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-20 px-1.5 py-0.5 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        {showDiscountLine && (
                          <div className="text-[10px] text-gray-500">was {dollars(r.fee.baseCostCents)}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      <button type="button" onClick={() => openQuickPromote(r)} className={BTN_PRIMARY}>
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
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Events tab
// ─────────────────────────────────────────────────────────────────────────

function EventsTab(props: {
  events: EventRow[];
  styles: StyleOption[];
  onChange: () => Promise<void>;
}) {
  const { events, styles, onChange } = props;
  const [showCreate, setShowCreate] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const openEvent = events.find((e) => e.id === openEventId);

  return (
    <>
      <div className="flex items-center justify-end mb-3 gap-2">
        <button type="button" onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
          Create Event
        </button>
      </div>

      {events.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-500">No promotion events yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Styles</th>
                <th className="px-3 py-2 text-left">Roster</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((e) => {
                const ids = parseEventStyleIds(e);
                const styleNames = ids
                  .map((id) => styles.find((s) => s.id === id)?.name)
                  .filter(Boolean)
                  .join(", ") || e.styleName || "—";
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-xs font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{styleNames}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{e.participants.length}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        e.status === "COMPLETED" ? "bg-green-100 text-green-700"
                          : e.status === "CANCELLED" ? "bg-gray-100 text-gray-600"
                          : "bg-blue-100 text-blue-700"
                      }`}>{e.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setOpenEventId(e.id)} className={BTN_SECONDARY}>
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <EventCreateModal
          styles={styles}
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false);
            await onChange();
            setOpenEventId(id);
          }}
        />
      )}

      {openEvent && (
        <EventDetailModal
          event={openEvent}
          styles={styles}
          onClose={() => setOpenEventId(null)}
          onChange={onChange}
        />
      )}
    </>
  );
}

function EventCreateModal(props: {
  styles: StyleOption[];
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(getTodayString());
  const [pickedStyles, setPickedStyles] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  // When checked, the eligible-promotions API uses each rank's
  // attendanceWindow (e.g. "6 months back from event date") as the
  // start cutoff. When unchecked, all attendance since the member's
  // last promotion counts.
  const [applyAttendanceWindow, setApplyAttendanceWindow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleStyle(id: string) {
    setPickedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || !date) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/promotion-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          date,
          styleIds: Array.from(pickedStyles),
          notes: notes.trim() || undefined,
          applyAttendanceWindow,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || `Failed (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      await props.onCreated(data.event.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Create Promotion Event" onClose={props.onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spring Promotion 2026"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* Sits on the right of the Date row. Default on; flip off
              for one-off events where you want all attendance since the
              member's last promotion to count regardless of the rank's
              configured window. */}
          <label className="flex items-center gap-2 text-xs text-gray-700 pb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={applyAttendanceWindow}
              onChange={(e) => setApplyAttendanceWindow(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-primary"
            />
            Attach Attendance Windows
          </label>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Styles</label>
          <div className="flex flex-wrap gap-1.5">
            {props.styles.length === 0 ? (
              <span className="text-xs text-gray-500">No styles set up yet.</span>
            ) : (
              props.styles.map((s) => {
                const on = pickedStyles.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStyle(s.id)}
                    className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                      on ? "bg-primary text-white border-primary"
                         : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {err && <div className="text-xs text-red-700">{err}</div>}
      </div>
      <div className="flex items-center justify-end gap-2 mt-4">
        <button type="button" onClick={props.onClose} className={BTN_SECONDARY}>Cancel</button>
        <button type="button" onClick={submit} disabled={!name.trim() || !date || submitting} className={BTN_PRIMARY}>
          {submitting ? "Creating…" : "Create Event"}
        </button>
      </div>
    </ModalShell>
  );
}

function EventDetailModal(props: {
  event: EventRow;
  styles: StyleOption[];
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const { event, styles, onClose, onChange } = props;
  const eventStyleIds = parseEventStyleIds(event);
  const eventStyleNames = eventStyleIds
    .map((id) => styles.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(", ") || event.styleName || "—";

  const [eligible, setEligible] = useState<EligibleRow[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline edit panel state — toggled by the "Edit details" button at
  // the top of the modal. Snapshot the current event's values so Cancel
  // restores them; Save PATCHes and refreshes the parent list.
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(event.name);
  const [editDate, setEditDate] = useState(() => new Date(event.date).toISOString().split("T")[0]);
  const [editNotes, setEditNotes] = useState(event.notes || "");
  const [editStyles, setEditStyles] = useState<Set<string>>(new Set(eventStyleIds));
  const [editApplyWindow, setEditApplyWindow] = useState(event.applyAttendanceWindow !== false);
  const [savingEdit, setSavingEdit] = useState(false);

  function openEditPanel() {
    // Reset to current event values whenever the panel opens (in case
    // the event was updated elsewhere since this modal first opened).
    setEditName(event.name);
    setEditDate(new Date(event.date).toISOString().split("T")[0]);
    setEditNotes(event.notes || "");
    setEditStyles(new Set(eventStyleIds));
    setEditApplyWindow(event.applyAttendanceWindow !== false);
    setEditing(true);
  }

  function toggleEditStyle(id: string) {
    setEditStyles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/promotion-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || event.name,
          date: editDate,
          notes: editNotes.trim() || null,
          styleIds: Array.from(editStyles),
          applyAttendanceWindow: editApplyWindow,
        }),
      });
      if (res.ok) {
        setEditing(false);
        await onChange();
      }
    } finally {
      setSavingEdit(false);
    }
  }

  const loadEligible = useCallback(async () => {
    setLoadingEligible(true);
    try {
      const res = await fetch(`/api/promotions/eligible?eventId=${event.id}`);
      if (res.ok) {
        const d = await res.json();
        setEligible(d.promotions || []);
      }
    } finally {
      setLoadingEligible(false);
    }
  }, [event.id]);
  useEffect(() => { loadEligible(); }, [loadEligible]);

  async function addByStyle(styleId: string) {
    setAdding(true);
    try {
      // Pull every active member in the gym for this style.
      const membersRes = await fetch(`/api/members?styleId=${styleId}&limit=500`);
      if (!membersRes.ok) return;
      const data = await membersRes.json();
      const memberIds: string[] = (data.members || []).map((m: { id: string }) => m.id);
      if (memberIds.length === 0) return;
      await fetch(`/api/promotion-events/${event.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds }),
      });
      await onChange();
    } finally {
      setAdding(false);
    }
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setAdding(true);
    try {
      await fetch(`/api/promotion-events/${event.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: Array.from(selected) }),
      });
      setSelected(new Set());
      await Promise.all([onChange(), loadEligible()]);
    } finally {
      setAdding(false);
    }
  }

  async function removeParticipant(participantId: string) {
    if (!confirm("Remove this member from the event?")) return;
    await fetch(`/api/promotion-events/${event.id}/participants?participantId=${participantId}`, { method: "DELETE" });
    await onChange();
  }

  async function deleteEvent() {
    if (!confirm("Delete this event? Participants will be removed.")) return;
    await fetch(`/api/promotion-events/${event.id}`, { method: "DELETE" });
    onClose();
    await onChange();
  }


  return (
    <ModalShell title={event.name} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs text-gray-600">
          {new Date(event.date).toLocaleDateString()} · Styles: {eventStyleNames} · Roster: {event.participants.length}
          {event.applyAttendanceWindow === false && (
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              Attendance Window Off
            </span>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={openEditPanel} className={BTN_SECONDARY}>
            Edit details
          </button>
        )}
      </div>

      {/* Inline edit panel — toggled by the "Edit details" button. PATCHes
          /api/promotion-events/[id] on Save. Cancel discards changes. */}
      {editing && (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700 pb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={editApplyWindow}
                onChange={(e) => setEditApplyWindow(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-primary"
              />
              Attach Attendance Windows
            </label>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Styles</label>
            <div className="flex flex-wrap gap-1.5">
              {styles.length === 0 ? (
                <span className="text-xs text-gray-500">No styles set up yet.</span>
              ) : (
                styles.map((s) => {
                  const on = editStyles.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleEditStyle(s.id)}
                      className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                        on ? "bg-primary text-white border-primary"
                           : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={BTN_SECONDARY} disabled={savingEdit}>Cancel</button>
            <button type="button" onClick={saveEdit} disabled={savingEdit || !editName.trim() || !editDate} className={BTN_PRIMARY}>
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Roster + eligible candidates are grouped per event style, then
          ordered by current rank low → high inside each style. A member
          enrolled in multiple event styles appears in each section
          (they may be promoting in one style and not another). */}
      <div className="space-y-4">
        {(() => {
          const rosterMemberIdSet = new Set(event.participants.map((p) => p.memberId));
          // Members covered by at least one event-style eligible row;
          // anything left in `participants` not covered here is rendered
          // in an "Other" section so admin can still see + remove them.
          const coveredRosterIds = new Set<string>();

          if (loadingEligible) {
            return <div className="text-xs text-gray-500">Loading…</div>;
          }

          // Group eligible rows by styleId.
          const byStyle = new Map<string, EligibleRow[]>();
          for (const row of eligible) {
            const list = byStyle.get(row.styleId) || [];
            list.push(row);
            byStyle.set(row.styleId, list);
          }

          // Walk event.styleIds in original order so admins always see
          // sections in the order they configured the event.
          const styleSections = eventStyleIds.map((styleId) => {
            const styleName = styles.find((s) => s.id === styleId)?.name || "Style";
            const rows = (byStyle.get(styleId) || [])
              .slice()
              .sort((a, b) => {
                if (a.fromRankOrder !== b.fromRankOrder) return a.fromRankOrder - b.fromRankOrder;
                return a.memberName.localeCompare(b.memberName);
              });
            const rostered = rows.filter((r) => rosterMemberIdSet.has(r.memberId));
            const addable = rows.filter((r) => !rosterMemberIdSet.has(r.memberId));
            for (const r of rostered) coveredRosterIds.add(r.memberId);
            return { styleId, styleName, rostered, addable };
          });

          // Participant rows not represented in any eligible row (e.g.
          // manually added member with no enrolled style matching the
          // event). Surfaces them under a final "Other" group.
          const orphanRoster = event.participants.filter((p) => !coveredRosterIds.has(p.memberId));

          return (
            <>
              {selected.size > 0 && (
                <div className="sticky top-0 z-10 -mx-3 px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-end">
                  <button type="button" onClick={addSelected} disabled={adding} className={BTN_PRIMARY}>
                    Add {selected.size} to roster
                  </button>
                </div>
              )}

              {styleSections.map(({ styleId, styleName, rostered, addable }) => (
                <div key={styleId} className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <div className="text-sm font-semibold text-gray-800">
                      {styleName}
                      <span className="ml-2 text-[11px] font-normal text-gray-500">
                        {rostered.length} on roster · {addable.length} eligible to add
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => addByStyle(styleId)}
                      className={BTN_SECONDARY}
                    >
                      Add all from {styleName}
                    </button>
                  </div>

                  {/* On roster */}
                  <div className="px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">On Roster</div>
                    {rostered.length === 0 ? (
                      <div className="text-xs text-gray-400">No one yet.</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {rostered.map((r) => {
                          const participant = event.participants.find((p) => p.memberId === r.memberId);
                          return (
                            <div key={`r-${r.memberId}-${r.styleId}`} className="flex items-center justify-between py-1.5 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 w-24 truncate">
                                  {r.fromRank || "—"}
                                </span>
                                <span>{r.memberName}</span>
                                <span className="text-xs text-gray-500">→ {r.toRank}</span>
                                {r.allRequirementsMet && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold uppercase">
                                    Eligible
                                  </span>
                                )}
                              </div>
                              {participant && (
                                <button type="button" onClick={() => removeParticipant(participant.id)} className={BTN_NEUTRAL}>
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Eligible to add */}
                  <div className="px-3 py-2 border-t border-gray-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Eligible to Add</div>
                    {addable.length === 0 ? (
                      <div className="text-xs text-gray-400">No additional candidates.</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {addable.map((r) => {
                          const on = selected.has(r.memberId);
                          return (
                            <label key={`a-${r.memberId}-${r.styleId}`} className="flex items-center gap-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setSelected((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(r.memberId)) n.delete(r.memberId);
                                  else n.add(r.memberId);
                                  return n;
                                })}
                              />
                              <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 w-24 truncate">
                                {r.fromRank || "—"}
                              </span>
                              <span className="flex-1">{r.memberName}</span>
                              <span className="text-xs text-gray-500">→ {r.toRank}</span>
                              {r.allRequirementsMet && (
                                <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold uppercase">
                                  Eligible
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Roster members who aren't enrolled in any of the event's
                  styles still need to be visible (and removable). */}
              {orphanRoster.length > 0 && (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 text-sm font-semibold text-gray-800">
                    Other roster members
                    <span className="ml-2 text-[11px] font-normal text-gray-500">
                      not enrolled in an event style
                    </span>
                  </div>
                  <div className="px-3 py-2 divide-y divide-gray-100">
                    {orphanRoster.map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>{(p as { memberName?: string }).memberName || "Member"}</span>
                        <button type="button" onClick={() => removeParticipant(p.id)} className={BTN_NEUTRAL}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {styleSections.length === 0 && orphanRoster.length === 0 && (
                <div className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-md p-3 text-center">
                  No styles attached to this event yet — edit the event to add styles, then candidates will appear here.
                </div>
              )}
            </>
          );
        })()}

        <div className="flex items-center justify-between border-t border-gray-200 pt-3">
          <button type="button" onClick={deleteEvent} className={BTN_NEUTRAL}>
            Delete event
          </button>
          <button type="button" onClick={onClose} className={BTN_NEUTRAL}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// History tab
// ─────────────────────────────────────────────────────────────────────────

function HistoryTab({ history }: { history: HistoryRow[] }) {
  if (history.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-12 text-center text-sm text-gray-500">
        No promotions recorded yet.
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
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
                {h.testResult === "PASSED" ? <span className="text-green-700 font-medium">Passed</span>
                  : h.testResult === "FAILED" ? <span className="text-red-700 font-medium">Failed</span>
                  : <span className="text-gray-400">—</span>}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Promote modal
// ─────────────────────────────────────────────────────────────────────────

function PromoteModal(props: {
  drafts: DraftItem[];
  submitting: boolean;
  errorMsg: string | null;
  updateDraft: (idx: number, patch: Partial<DraftItem>) => void;
  removeDraft: (idx: number) => void;
  submit: () => void;
  close: () => void;
}) {
  const { drafts, submitting, errorMsg, updateDraft, removeDraft, submit, close } = props;

  return (
    <ModalShell
      title={drafts.length === 1 ? "Promote member" : `Promote ${drafts.length} members`}
      onClose={close}
      wide
    >
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {drafts.map((d, idx) => {
          const showDiscountLine = d.row.fee.costCents > 0 && d.row.fee.discountCents > 0;
          return (
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
                  <button type="button" onClick={() => removeDraft(idx)} className="text-xs text-red-600 hover:text-red-700">
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

              {/* Fee — editable, with breakdown */}
              <div className="mt-3 bg-gray-50 rounded p-2 text-xs">
                {d.row.fee.baseCostCents === 0 && Number(d.costDollars) === 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 flex-1">Fee</span>
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={d.costDollars}
                      onChange={(e) => updateDraft(idx, { costDollars: e.target.value })}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                    />
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {d.row.fee.baseCostCents > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Base fee ({d.row.fee.source})</span>
                        <span>{dollars(d.row.fee.baseCostCents)}</span>
                      </div>
                    )}
                    {d.row.fee.discountCents > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Discount{d.row.fee.discountSourcePlanName ? ` (${d.row.fee.discountSourcePlanName})` : ""}</span>
                        <span>−{dollars(d.row.fee.discountCents)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-gray-200 pt-1 mt-1">
                      <span className="font-semibold">Member owes</span>
                      <div className="flex items-center gap-1">
                        <span>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={d.costDollars}
                          onChange={(e) => updateDraft(idx, { costDollars: e.target.value })}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {/* keep showDiscountLine referenced — used only in EligibleTab row, harmless here */}
                {showDiscountLine ? null : null}
              </div>

              {Number(d.costDollars) > 0 && (
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
          );
        })}
      </div>

      {errorMsg && <div className="mt-2 text-xs text-red-700">{errorMsg}</div>}

      <div className="flex items-center justify-end gap-2 mt-4">
        <button type="button" onClick={close} disabled={submitting} className={BTN_SECONDARY}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={submitting || drafts.length === 0} className={BTN_PRIMARY}>
          {submitting ? "Promoting…" : `Promote ${drafts.length === 1 ? "member" : `${drafts.length} members`}`}
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────────────────

function ModalShell(props: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full my-8 ${props.wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">{props.title}</h2>
          <button type="button" onClick={props.onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <div className="px-5 py-4">{props.children}</div>
      </div>
    </div>
  );
}
