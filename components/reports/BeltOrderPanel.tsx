"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TestingEventLite = { id: string; name: string; date: string; endDate: string | null; status: string; styleNames: string | null; styleName: string; participants: unknown[] };
type StyleLite = { id: string; name: string };
type Result = {
  title: string;
  rows: Array<{ belt: string; size: string; count: number }>;
  total: number;
  counted: Array<{ memberId: string; name: string; style: string; belt: string; size: string }>;
  skipped: Array<{ memberId: string; name: string; reason: string }>;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Belt Order: Belt | Size | Count, from a testing event or a style.
// Rendered as the built-in "Belt Order" report tab on /reports.
export default function BeltOrderPanel() {
  const [source, setSource] = useState<"test" | "style">("test");
  const [events, setEvents] = useState<TestingEventLite[]>([]);
  const [styles, setStyles] = useState<StyleLite[]>([]);

  const [testingEventId, setTestingEventId] = useState("");
  const [include, setInclude] = useState<"all" | "passed">("all");
  const [onlyStyleId, setOnlyStyleId] = useState("");

  const [styleId, setStyleId] = useState("");
  const [belt, setBelt] = useState<"current" | "next">("next");
  const [membersScope, setMembersScope] = useState<"active" | "all">("active");

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/testing?lite=1").then((r) => (r.ok ? r.json() : { events: [] })).then((d) => setEvents(d.events || [])).catch(() => {});
    fetch("/api/styles").then((r) => (r.ok ? r.json() : { styles: [] })).then((d) => setStyles((d.styles || []).map((s: StyleLite) => ({ id: s.id, name: s.name })))).catch(() => {});
  }, []);

  const selectedEvent = events.find((e) => e.id === testingEventId);
  const eventStyleNames: string[] = (() => {
    if (!selectedEvent) return [];
    try {
      const p = selectedEvent.styleNames ? JSON.parse(selectedEvent.styleNames) : null;
      if (Array.isArray(p) && p.length > 0) return p;
    } catch { /* ignore */ }
    return selectedEvent.styleName ? [selectedEvent.styleName] : [];
  })();
  const eventStyles = styles.filter((s) => eventStyleNames.some((n) => n.toLowerCase() === s.name.toLowerCase()));

  // Re-run whenever a choice changes -- no "apply" step to forget.
  useEffect(() => {
    const params = new URLSearchParams();
    if (source === "test") {
      if (!testingEventId) { setResult(null); return; }
      params.set("testingEventId", testingEventId);
      params.set("include", include);
      if (onlyStyleId) params.set("onlyStyleId", onlyStyleId);
    } else {
      if (!styleId) { setResult(null); return; }
      params.set("styleId", styleId);
      params.set("belt", belt);
      params.set("members", membersScope);
    }
    setLoading(true);
    setError("");
    fetch(`/api/reports/belt-order?${params}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        setResult(d);
      })
      .catch((e) => { setError(e.message); setResult(null); })
      .finally(() => setLoading(false));
  }, [source, testingEventId, include, onlyStyleId, styleId, belt, membersScope]);

  const downloadCsv = () => {
    if (!result) return;
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      esc(result.title),
      "",
      "Belt,Size,Count",
      ...result.rows.map((r) => `${esc(r.belt)},${esc(r.size)},${r.count}`),
      `Total,,${result.total}`,
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `belt-order-${(result.title || "report").replace(/[^a-z0-9-_ ]/gi, "").trim() || "report"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-semibold border ${active ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`;

  return (
      <div className="space-y-4 max-w-3xl">

        {/* Choices */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4 print:hidden">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Count belts from</p>
            <div className="flex gap-2">
              <button type="button" className={pill(source === "test")} onClick={() => setSource("test")}>A testing event</button>
              <button type="button" className={pill(source === "style")} onClick={() => setSource("style")}>A style</button>
            </div>
          </div>

          {source === "test" ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Testing event</label>
                <select
                  value={testingEventId}
                  onChange={(e) => { setTestingEventId(e.target.value); setOnlyStyleId(""); }}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Choose a test…</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} — {fmtDate(ev.date)}{ev.endDate ? ` to ${fmtDate(ev.endDate)}` : ""} ({ev.participants.length} signed up{ev.status === "COMPLETED" ? ", completed" : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Who to count</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={pill(include === "all")} onClick={() => setInclude("all")}>Everyone signed up</button>
                  <button type="button" className={pill(include === "passed")} onClick={() => setInclude("passed")}>Passed only</button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Counts the belt each person is testing <b>for</b>. Failed, no-show and cancelled are never counted.</p>
              </div>
              {eventStyles.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Style</label>
                  <select value={onlyStyleId} onChange={(e) => setOnlyStyleId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                    <option value="">All styles on this test</option>
                    {eventStyles.map((s) => <option key={s.id} value={s.id}>{s.name} only</option>)}
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Style</label>
                <select value={styleId} onChange={(e) => setStyleId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Choose a style…</option>
                  {styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Which belt</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={pill(belt === "next")} onClick={() => setBelt("next")}>Next belt (for promotion)</button>
                  <button type="button" className={pill(belt === "current")} onClick={() => setBelt("current")}>Current belt</button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Members</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={pill(membersScope === "active")} onClick={() => setMembersScope("active")}>Active only</button>
                  <button type="button" className={pill(membersScope === "all")} onClick={() => setMembersScope("all")}>Everyone in the style</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Result */}
        {loading && <p className="text-sm text-gray-500">Counting…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && result && (
          <>
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold">{result.title}</h2>
                <div className="flex gap-2 print:hidden">
                  <button type="button" onClick={() => window.print()} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Print</button>
                  <button type="button" onClick={downloadCsv} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Download CSV</button>
                </div>
              </div>
              {result.rows.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">Nobody to count with these choices.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                      <th className="px-4 py-2 font-medium">Belt</th>
                      <th className="px-4 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={`${r.belt}|${r.size}`} className="border-b border-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.belt}</td>
                        <td className={`px-4 py-2 ${r.size === "No size" ? "text-amber-600" : "text-gray-700"}`}>{r.size}</td>
                        <td className="px-4 py-2 text-right font-semibold">{r.count}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 font-semibold" colSpan={2}>Total belts</td>
                      <td className="px-4 py-2 text-right font-bold">{result.total}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Exactly who was counted, so the numbers are never a mystery. */}
            <details className="rounded-lg border border-gray-200 bg-white" open>
              <summary className="px-4 py-3 text-sm font-semibold cursor-pointer">Who's counted ({result.counted.length})</summary>
              <div className="divide-y divide-gray-50">
                {result.counted.map((c) => (
                  <div key={`${c.memberId}|${c.belt}`} className="flex items-center justify-between px-4 py-1.5 text-sm">
                    <Link href={`/members/${c.memberId}`} className="text-primary hover:underline">{c.name}</Link>
                    <span className="text-xs text-gray-600">
                      {c.belt} · size <span className={c.size === "No size" ? "text-amber-600" : ""}>{c.size}</span>
                      <span className="text-gray-400"> · {c.style}</span>
                    </span>
                  </div>
                ))}
              </div>
            </details>

            {result.skipped.length > 0 && (
              <details className="rounded-lg border border-gray-200 bg-white print:hidden">
                <summary className="px-4 py-3 text-sm font-semibold cursor-pointer">Not counted ({result.skipped.length})</summary>
                <div className="divide-y divide-gray-50">
                  {result.skipped.map((s) => (
                    <div key={s.memberId} className="flex items-center justify-between px-4 py-1.5 text-sm">
                      <Link href={`/members/${s.memberId}`} className="text-primary hover:underline">{s.name}</Link>
                      <span className="text-xs text-gray-500">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
  );
}
