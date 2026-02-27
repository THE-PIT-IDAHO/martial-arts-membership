"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type AuditEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  changes: string | null;
  createdAt: string;
};

const ENTITY_TYPES = ["Member", "Membership", "Invoice", "Settings", "ClassSession", "Billing"];

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  CANCEL: "bg-orange-100 text-orange-700",
  STATUS_CHANGE: "bg-purple-100 text-purple-700",
  BILLING_RUN: "bg-yellow-100 text-yellow-700",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 30;

  useEffect(() => {
    fetchLogs();
  }, [entityType, page]);

  async function fetchLogs() {
    setLoading(true);
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (search) params.set("search", search);
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));

    try {
      const res = await fetch(`/api/audit-log?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    fetchLogs();
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderChanges(changesJson: string) {
    try {
      const changes = JSON.parse(changesJson);
      return (
        <div className="mt-2 bg-gray-50 rounded-md p-3 text-xs space-y-1">
          {Object.entries(changes).map(([field, diff]: [string, any]) => (
            <div key={field} className="flex gap-2">
              <span className="font-medium text-gray-700 min-w-[120px]">{field}:</span>
              <span className="text-red-600 line-through">{String(diff.from ?? "—")}</span>
              <span className="text-gray-400">→</span>
              <span className="text-green-600">{String(diff.to ?? "—")}</span>
            </div>
          ))}
        </div>
      );
    } catch {
      return null;
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-gray-500">Track all changes across the system</p>
          </div>
          <span className="text-xs text-gray-400">{total} entries</span>
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search summaries..."
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs w-60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Search
            </button>
          </form>
        </div>

        {/* Table */}
        <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No audit log entries found.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 uppercase">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Summary</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {log.entityType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900">
                      {log.summary}
                      {expandedId === log.id && log.changes && renderChanges(log.changes)}
                    </td>
                    <td className="px-3 py-2">
                      {log.changes && (
                        <button
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          className="text-primary hover:text-primaryDark text-[10px] font-medium"
                        >
                          {expandedId === log.id ? "Hide" : "Diff"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
