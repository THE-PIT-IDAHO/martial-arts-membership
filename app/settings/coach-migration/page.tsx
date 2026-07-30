"use client";

// One-off migration tool: copies each member's plan-linked Membership
// Type name into the `coach` field on their PRIMARY-style stylesNotes
// entry. Meant for gyms that were using Membership Type as a stand-in
// for the coach who promoted them before the placard Coach field
// existed. Not linked from the sidebar -- navigate here manually.
//
// Reads through /api/members (which already returns membershipTypeName
// + stylesNotes) and writes back through PATCH /api/members/[id] one
// member at a time. No new API surface. Safe to re-run: the default
// "Fill blanks only" mode skips any member whose primary style
// already has a coach set.

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type MemberRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryStyle: string | null;
  membershipTypeName: string | null;
  membershipType: string | null;
  stylesNotes: string | null;
};

type StyleEntry = {
  name?: string;
  rank?: string;
  coach?: string | null;
  [k: string]: unknown;
};

type PlanRow = {
  id: string;
  memberName: string;
  primaryStyle: string;
  sourceValue: string;
  currentCoach: string;
  action: "will-set" | "would-overwrite" | "skip-blank-source" | "skip-no-primary-style" | "skip-already-set";
};

export default function CoachMigrationPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [includeLegacyFallback, setIncludeLegacyFallback] = useState(true);

  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<null | { updated: number; skipped: number; failed: number }>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/members");
        if (!res.ok) throw new Error("Failed to load members");
        const data = await res.json();
        setMembers((data.members || []).map((m: MemberRow) => m));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load members");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Build the plan. Runs on every settings change so the preview live-
  // updates as the user toggles the two checkboxes.
  const plan: PlanRow[] = members.map((m) => {
    const source =
      (m.membershipTypeName?.trim() || "") ||
      (includeLegacyFallback ? (m.membershipType?.trim() || "") : "");
    const name = `${m.firstName || ""} ${m.lastName || ""}`.trim() || "(unnamed)";
    if (!m.primaryStyle) {
      return {
        id: m.id, memberName: name, primaryStyle: "",
        sourceValue: source, currentCoach: "", action: "skip-no-primary-style" as const,
      };
    }
    if (!source) {
      return {
        id: m.id, memberName: name, primaryStyle: m.primaryStyle,
        sourceValue: "", currentCoach: "", action: "skip-blank-source" as const,
      };
    }
    let entries: StyleEntry[] = [];
    try { entries = m.stylesNotes ? JSON.parse(m.stylesNotes) : []; } catch { entries = []; }
    const primary = entries.find((s) => (s.name || "").toLowerCase() === m.primaryStyle!.toLowerCase());
    const currentCoach = primary?.coach ? String(primary.coach) : "";
    if (currentCoach && !overwriteExisting) {
      return {
        id: m.id, memberName: name, primaryStyle: m.primaryStyle,
        sourceValue: source, currentCoach, action: "skip-already-set" as const,
      };
    }
    return {
      id: m.id, memberName: name, primaryStyle: m.primaryStyle,
      sourceValue: source, currentCoach,
      action: currentCoach ? ("would-overwrite" as const) : ("will-set" as const),
    };
  });

  const toWrite = plan.filter((p) => p.action === "will-set" || p.action === "would-overwrite");
  const skipped = plan.filter((p) => p.action.startsWith("skip"));

  async function apply() {
    if (!confirm(`Apply coach to ${toWrite.length} member${toWrite.length === 1 ? "" : "s"}? This overwrites their stylesNotes JSON on the primary style entry only.`)) return;
    setApplying(true);
    setProgress({ done: 0, total: toWrite.length });
    setSummary(null);
    let updated = 0;
    let failed = 0;
    for (const row of toWrite) {
      try {
        const member = members.find((m) => m.id === row.id);
        if (!member) { failed += 1; continue; }
        let entries: StyleEntry[] = [];
        try { entries = member.stylesNotes ? JSON.parse(member.stylesNotes) : []; } catch { entries = []; }
        // Locate the primary-style entry; create one if the member
        // doesn't have that style row yet (rare, but possible if the
        // primary style was set on Member without a matching entry).
        let idx = entries.findIndex((s) => (s.name || "").toLowerCase() === row.primaryStyle.toLowerCase());
        if (idx < 0) {
          entries.push({ name: row.primaryStyle, coach: row.sourceValue });
          idx = entries.length - 1;
        } else {
          entries[idx] = { ...entries[idx], coach: row.sourceValue };
        }
        const res = await fetch(`/api/members/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stylesNotes: JSON.stringify(entries) }),
        });
        if (!res.ok) { failed += 1; }
        else { updated += 1; }
      } catch { failed += 1; }
      setProgress({ done: (updated + failed), total: toWrite.length });
    }
    setSummary({ updated, skipped: skipped.length, failed });
    setApplying(false);
    // Reload so the preview reflects the post-migration state
    // (already-set skips will now include the newly-written rows).
    try {
      const res = await fetch("/api/members");
      if (res.ok) {
        const data = await res.json();
        setMembers((data.members || []).map((m: MemberRow) => m));
      }
    } catch { /* non-fatal */ }
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coach Migration</h1>
          <p className="text-sm text-gray-500 mt-1">
            One-off tool: copy each member&apos;s Membership Type into the Coach field on their primary style&apos;s placard.
            Reads the plan-linked Membership Type name (the value shown on the Members list). Writes to the primary-style
            entry only. Safe to re-run.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteExisting}
                onChange={(e) => setOverwriteExisting(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Overwrite existing coach values (default: fill blanks only)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLegacyFallback}
                onChange={(e) => setIncludeLegacyFallback(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Fall back to legacy free-text Membership Type when plan-linked is blank
            </label>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              {toWrite.length} will change
            </span>
            <span className="rounded-full bg-gray-100 text-gray-600 px-3 py-1 text-xs font-semibold">
              {skipped.length} skipped
            </span>
            <span className="text-xs text-gray-400">Total members: {members.length}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={apply}
              disabled={applying || toWrite.length === 0}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
            >
              {applying ? "Applying..." : `Apply to ${toWrite.length} member${toWrite.length === 1 ? "" : "s"}`}
            </button>
          </div>
          {progress && (
            <div className="text-xs text-gray-500">
              Progress: {progress.done} / {progress.total}
              <div className="h-1.5 mt-1 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {summary && (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              Done. Updated {summary.updated}, skipped {summary.skipped}, failed {summary.failed}.
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading members...</p>
        ) : error ? (
          <p className="text-sm text-red-600">Error: {error}</p>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">Member</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">Primary Style</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">Membership Type (source)</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">Current Coach</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-900">{p.memberName}</td>
                    <td className="px-3 py-1.5 text-gray-700">{p.primaryStyle || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-700">{p.sourceValue || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-700">{p.currentCoach || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-1.5">
                      {p.action === "will-set" && (
                        <span className="inline-block rounded bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-semibold">
                          Will set → {p.sourceValue}
                        </span>
                      )}
                      {p.action === "would-overwrite" && (
                        <span className="inline-block rounded bg-yellow-100 text-yellow-800 px-2 py-0.5 text-[11px] font-semibold">
                          Overwrite → {p.sourceValue}
                        </span>
                      )}
                      {p.action === "skip-blank-source" && (
                        <span className="inline-block rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-semibold">
                          Skip — no membership type
                        </span>
                      )}
                      {p.action === "skip-no-primary-style" && (
                        <span className="inline-block rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-semibold">
                          Skip — no primary style
                        </span>
                      )}
                      {p.action === "skip-already-set" && (
                        <span className="inline-block rounded bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px] font-semibold">
                          Skip — coach already set
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
