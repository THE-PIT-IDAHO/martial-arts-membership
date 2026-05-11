"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";

type Invoice = {
  id: string;
  invoiceNumber: string | null;
  amountCents: number;
  status: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  externalPaymentId: string | null;
  paymentProcessor: string | null;
  notes: string | null;
  createdAt: string;
  member: { id: string; firstName: string; lastName: string };
  membership: {
    id: string;
    membershipPlan: { name: string; billingCycle: string };
  };
};

const STATUS_OPTIONS = ["ALL", "PENDING", "PAID", "PAST_DUE", "FAILED", "VOID"] as const;

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    PAID: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    PAST_DUE: "bg-red-100 text-red-700",
    FAILED: "bg-orange-100 text-orange-700",
    VOID: "bg-gray-100 text-gray-500",
  };
  return colors[status] || "bg-gray-100 text-gray-500";
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Actions
  const [runningBilling, setRunningBilling] = useState(false);
  const [billingResult, setBillingResult] = useState<string | null>(null);

  // Mark Paid modal
  const [markPaidInvoice, setMarkPaidInvoice] = useState<Invoice | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState("CASH");
  const [markPaidSaving, setMarkPaidSaving] = useState(false);

  const loadInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error("Error loading invoices:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Filtered by search query (client-side)
  const filtered = searchQuery.trim()
    ? invoices.filter(inv => {
        const name = `${inv.member.firstName} ${inv.member.lastName}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        return name.includes(q) || inv.invoiceNumber?.toLowerCase().includes(q);
      })
    : invoices;

  // Summary stats
  const pendingCount = invoices.filter(i => i.status === "PENDING").length;
  const pastDueCount = invoices.filter(i => i.status === "PAST_DUE").length;
  const pendingTotal = invoices.filter(i => i.status === "PENDING").reduce((sum, i) => sum + i.amountCents, 0);
  const pastDueTotal = invoices.filter(i => i.status === "PAST_DUE").reduce((sum, i) => sum + i.amountCents, 0);
  const paidThisMonth = invoices.filter(i => {
    if (i.status !== "PAID" || !i.paidAt) return false;
    const paid = new Date(i.paidAt);
    const now = new Date();
    return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear();
  }).reduce((sum, i) => sum + i.amountCents, 0);

  async function runBilling() {
    setRunningBilling(true);
    setBillingResult(null);
    try {
      const [billRes, pastDueRes] = await Promise.all([
        fetch("/api/billing/run", { method: "POST" }),
        fetch("/api/billing/past-due", { method: "POST" }),
      ]);
      const billData = billRes.ok ? await billRes.json() : null;
      const pastDueData = pastDueRes.ok ? await pastDueRes.json() : null;
      const parts: string[] = [];
      if (billData?.created) parts.push(`${billData.created} invoice${billData.created !== 1 ? "s" : ""} created`);
      if (pastDueData?.marked) parts.push(`${pastDueData.marked} marked past due`);
      if (parts.length === 0) parts.push("No invoices to generate");
      setBillingResult(parts.join(", "));
      await loadInvoices();
    } catch {
      setBillingResult("Billing run failed");
    } finally {
      setRunningBilling(false);
    }
  }

  async function handleMarkPaid() {
    if (!markPaidInvoice) return;
    setMarkPaidSaving(true);
    try {
      const res = await fetch(`/api/invoices/${markPaidInvoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID", paymentMethod: markPaidMethod }),
      });
      if (res.ok) {
        setMarkPaidInvoice(null);
        await loadInvoices();
      } else {
        alert("Failed to mark invoice as paid");
      }
    } catch {
      alert("Failed to mark invoice as paid");
    } finally {
      setMarkPaidSaving(false);
    }
  }

  async function voidInvoice(invoice: Invoice) {
    if (!confirm(`Void invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}?`)) return;
    try {
      await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "VOID" }),
      });
      await loadInvoices();
    } catch {
      alert("Failed to void invoice");
    }
  }

  async function refundInvoice(invoice: Invoice) {
    if (!invoice.externalPaymentId || !invoice.paymentProcessor) {
      alert("This invoice was not paid through a payment processor and cannot be refunded automatically. Use Void instead.");
      return;
    }
    if (!confirm(`Refund ${formatCents(invoice.amountCents)} to ${invoice.member.firstName} ${invoice.member.lastName}? This will reverse the payment through ${invoice.paymentProcessor}.`)) return;
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        alert("Refund processed successfully.");
        await loadInvoices();
      } else {
        const data = await res.json();
        alert(data.error || "Refund failed");
      }
    } catch {
      alert("Failed to process refund");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-4 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Billing</h1>
            <p className="text-sm text-gray-600">Manage invoices and billing across all members.</p>
          </div>
          <div className="flex items-center gap-2">
            {billingResult && (
              <span className="text-xs text-gray-500">{billingResult}</span>
            )}
            <button
              onClick={runBilling}
              disabled={runningBilling}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
            >
              {runningBilling ? "Running..." : "Run Billing"}
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase text-gray-500">Pending</p>
            <p className="text-lg font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-gray-400">{formatCents(pendingTotal)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase text-gray-500">Past Due</p>
            <p className="text-lg font-bold text-red-600">{pastDueCount}</p>
            <p className="text-xs text-gray-400">{formatCents(pastDueTotal)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase text-gray-500">Collected This Month</p>
            <p className="text-lg font-bold text-green-600">{formatCents(paidThisMonth)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase text-gray-500">Total Invoices</p>
            <p className="text-lg font-bold">{invoices.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div>
            <label className="block text-[11px] font-medium uppercase text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setLoading(true); }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setLoading(true); }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setLoading(true); }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[11px] font-medium uppercase text-gray-500 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Member name or invoice #..."
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {(statusFilter !== "ALL" || fromDate || toDate || searchQuery) && (
            <button
              onClick={() => { setStatusFilter("ALL"); setFromDate(""); setToDate(""); setSearchQuery(""); setLoading(true); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Invoice Table */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading invoices...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">No invoices found.</p>
            <p className="text-xs text-gray-400 mt-1">Invoices are created automatically when memberships are due, or you can run billing manually.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Invoice #</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Member</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Plan</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Period</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-500">Amount</th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Due</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Paid</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{inv.invoiceNumber || inv.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/members/${inv.member.id}`} className="text-primary hover:underline text-xs font-medium">
                        {inv.member.firstName} {inv.member.lastName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{inv.membership?.membershipPlan?.name || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {formatDate(inv.billingPeriodStart)} – {formatDate(inv.billingPeriodEnd)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-medium">{formatCents(inv.amountCents)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(inv.status)}`}>
                        {inv.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(inv.dueDate)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{inv.paidAt ? formatDate(inv.paidAt) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(inv.status === "PENDING" || inv.status === "PAST_DUE") && (
                          <>
                            <button
                              onClick={() => { setMarkPaidInvoice(inv); setMarkPaidMethod("CASH"); }}
                              className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-green-200"
                            >
                              Mark Paid
                            </button>
                            <button
                              onClick={() => voidInvoice(inv)}
                              className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100"
                            >
                              Void
                            </button>
                          </>
                        )}
                        {inv.status === "PAID" && (
                          <button
                            onClick={() => refundInvoice(inv)}
                            className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark"
                          >
                            Refund
                          </button>
                        )}
                        {inv.status === "FAILED" && (
                          <button
                            onClick={() => voidInvoice(inv)}
                            className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      {markPaidInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMarkPaidInvoice(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold">Mark Invoice Paid</h2>
              <button onClick={() => setMarkPaidInvoice(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
                <p><span className="font-medium">Invoice:</span> {markPaidInvoice.invoiceNumber || markPaidInvoice.id.slice(0, 8)}</p>
                <p><span className="font-medium">Member:</span> {markPaidInvoice.member.firstName} {markPaidInvoice.member.lastName}</p>
                <p><span className="font-medium">Amount:</span> {formatCents(markPaidInvoice.amountCents)}</p>
                <p><span className="font-medium">Plan:</span> {markPaidInvoice.membership?.membershipPlan?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={markPaidMethod}
                  onChange={e => setMarkPaidMethod(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="CHECK">Check</option>
                  <option value="STRIPE">Stripe</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setMarkPaidInvoice(null)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkPaid}
                  disabled={markPaidSaving}
                  className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {markPaidSaving ? "Saving..." : "Confirm Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
