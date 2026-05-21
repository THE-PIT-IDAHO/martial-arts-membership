"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  signed: boolean;
  signedAt: string | null;
  signedTemplateName: string | null;
};

export default function WaiverListByTypePage() {
  const params = useParams<{ typeSlug: string }>();
  const typeSlug = params.typeSlug;

  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"all" | "signed" | "pending">("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/waivers/by-type/${encodeURIComponent(typeSlug)}`);
        if (!res.ok) {
          setError("Failed to load");
          return;
        }
        const data = await res.json();
        setRows(data.members || []);
        setLabel(data.typeLabel || typeSlug);
      } catch (err) {
        setError("Failed to load");
      } finally {
        setLoading(false);
      }
    }
    if (typeSlug) load();
  }, [typeSlug]);

  const filtered = rows.filter((m) => {
    if (filter === "signed" && !m.signed) return false;
    if (filter === "pending" && m.signed) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${m.firstName} ${m.lastName}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const signedCount = rows.filter((m) => m.signed).length;
  const pendingCount = rows.length - signedCount;

  async function resetWaiver(memberId: string) {
    if (!window.confirm("Reset this member's waiver status?")) return;
    setActionMsg(null);
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiverSigned: false, waiverSignedAt: null }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === memberId ? { ...r, signed: false, signedAt: null } : r)),
        );
        setActionMsg("Waiver status reset.");
      } else {
        setActionMsg("Failed to reset.");
      }
    } catch {
      setActionMsg("Failed to reset.");
    }
  }

  function copyLink(memberId: string) {
    const url = `${window.location.origin}/waiver/sign/${memberId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(memberId);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function sendLink(memberId: string) {
    setSendingId(memberId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/waivers/send-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setActionMsg(`Waiver link sent${data?.sentTo ? ` to ${data.sentTo}` : ""}.`);
      } else {
        setActionMsg(data?.error || "Failed to send link.");
      }
    } catch {
      setActionMsg("Failed to send link.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <AppLayout>
      <div className="px-4 py-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{label}</h1>
            <p className="text-sm text-gray-500">
              {typeSlug === "all"
                ? "Every member and their overall waiver status."
                : typeSlug === "untyped"
                ? "Members with signed waivers that aren't grouped under a type yet."
                : `Members with waivers grouped under "${label}".`}
            </p>
          </div>
          <Link
            href="/waivers"
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
          >
            Back to Waivers
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {actionMsg && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            {actionMsg}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === "all"
                    ? "bg-primary text-white hover:bg-primaryDark"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                All ({rows.length})
              </button>
              <button
                onClick={() => setFilter("signed")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === "signed"
                    ? "bg-primary text-white hover:bg-primaryDark"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Signed ({signedCount})
              </button>
              <button
                onClick={() => setFilter("pending")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === "pending"
                    ? "bg-primary text-white hover:bg-primaryDark"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Pending ({pendingCount})
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No members match.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/members/${m.id}`}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {m.firstName} {m.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {m.email || m.phone || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {m.signed ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Signed
                          </span>
                          {m.signedAt && (
                            <div className="text-xs text-gray-400">
                              {new Date(m.signedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-600 text-sm font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => copyLink(m.id)}
                          className="rounded-md bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
                        >
                          {copiedId === m.id ? "Copied!" : "Copy Link"}
                        </button>
                        <button
                          onClick={() => sendLink(m.id)}
                          disabled={sendingId === m.id || !m.email}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors disabled:opacity-50"
                          title={!m.email ? "No email on file" : "Email a waiver link"}
                        >
                          {sendingId === m.id ? "Sending…" : "Send Link"}
                        </button>
                        {m.signed && (
                          <button
                            onClick={() => resetWaiver(m.id)}
                            className="rounded-md bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
