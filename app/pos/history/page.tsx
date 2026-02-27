"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { parsePaymentMethod, formatPaymentMethod } from "@/lib/payment-utils";

type POSLineItem = {
  id: string;
  itemId: string | null;
  itemName: string;
  itemSku: string | null;
  type: string;
  membershipPlanId: string | null;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
};

type POSTransaction = {
  id: string;
  transactionNumber: string | null;
  memberId: string | null;
  memberName: string | null;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  POSLineItem: POSLineItem[];
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  REFUNDED: "bg-orange-100 text-orange-800",
  VOIDED: "bg-red-100 text-red-800",
  PENDING: "bg-yellow-100 text-yellow-800",
};

export default function POSHistoryPage() {
  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Detail view
  const [selectedTransaction, setSelectedTransaction] = useState<POSTransaction | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/transactions");
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filter transactions
  const filteredTransactions = transactions.filter(txn => {
    // Status filter
    if (statusFilter !== "all" && txn.status !== statusFilter) return false;

    // Date filter
    if (dateFilter !== "all") {
      const txnDate = new Date(txn.createdAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateFilter === "today") {
        const txnDay = new Date(txnDate);
        txnDay.setHours(0, 0, 0, 0);
        if (txnDay.getTime() !== today.getTime()) return false;
      } else if (dateFilter === "week") {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (txnDate < weekAgo) return false;
      } else if (dateFilter === "month") {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        if (txnDate < monthAgo) return false;
      }
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        txn.transactionNumber?.toLowerCase().includes(searchLower) ||
        txn.memberName?.toLowerCase().includes(searchLower) ||
        txn.POSLineItem.some(item => item.itemName.toLowerCase().includes(searchLower))
      );
    }

    return true;
  });

  // Calculate summary
  const summary = {
    total: filteredTransactions.length,
    completed: filteredTransactions.filter(t => t.status === "COMPLETED").length,
    refunded: filteredTransactions.filter(t => t.status === "REFUNDED").length,
    voided: filteredTransactions.filter(t => t.status === "VOIDED").length,
    revenue: filteredTransactions
      .filter(t => t.status === "COMPLETED")
      .reduce((sum, t) => sum + t.totalCents, 0),
  };

  async function handleRefund(txn: POSTransaction) {
    if (!confirm(`Are you sure you want to refund transaction #${txn.transactionNumber}? This will restore inventory for product items.`)) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/pos/transactions/${txn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REFUNDED" }),
      });

      if (!res.ok) {
        throw new Error("Failed to process refund");
      }

      fetchTransactions();
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error processing refund:", error);
      alert("Failed to process refund");
    } finally {
      setProcessing(false);
    }
  }

  async function handleVoid(txn: POSTransaction) {
    if (!confirm(`Are you sure you want to void transaction #${txn.transactionNumber}? This will restore inventory for product items.`)) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/pos/transactions/${txn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "VOIDED" }),
      });

      if (!res.ok) {
        throw new Error("Failed to void transaction");
      }

      fetchTransactions();
      setSelectedTransaction(null);
    } catch (error) {
      console.error("Error voiding transaction:", error);
      alert("Failed to void transaction");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading transactions...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Transaction History</h1>
            <p className="text-sm text-gray-600">View and manage past transactions</p>
          </div>
          <Link
            href="/pos"
            className="px-3 py-1 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primaryDark"
          >
            New Sale
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Total</p>
            <p className="text-2xl font-bold">{summary.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Completed</p>
            <p className="text-2xl font-bold text-green-600">{summary.completed}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Refunded</p>
            <p className="text-2xl font-bold text-orange-600">{summary.refunded}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Voided</p>
            <p className="text-2xl font-bold text-red-600">{summary.voided}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">Revenue</p>
            <p className="text-2xl font-bold text-primary">{formatCents(summary.revenue)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="REFUNDED">Refunded</option>
              <option value="VOIDED">Voided</option>
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>
        </div>

        {/* Transactions table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {transactions.length === 0 ? (
                <>
                  <p>No transactions yet.</p>
                  <Link href="/pos" className="mt-2 text-primary hover:underline">
                    Make your first sale
                  </Link>
                </>
              ) : (
                <p>No transactions match your filters.</p>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map(txn => (
                  <tr
                    key={txn.id}
                    className={`hover:bg-gray-50 cursor-pointer ${
                      txn.status !== "COMPLETED" ? "bg-gray-50" : ""
                    }`}
                    onClick={() => setSelectedTransaction(txn)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-sm">#{txn.transactionNumber}</p>
                        <p className="text-xs text-gray-500">{formatDate(txn.createdAt)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {txn.memberName || <span className="text-gray-400">Walk-in</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {txn.POSLineItem.length} item{txn.POSLineItem.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatPaymentMethod(txn.paymentMethod)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {formatCents(txn.totalCents)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[txn.status] || "bg-gray-100"}`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransaction(txn);
                        }}
                        className="text-primary hover:text-primary/80 text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  Transaction #{selectedTransaction.transactionNumber}
                </h2>
                <p className="text-sm text-gray-600">
                  {formatDate(selectedTransaction.createdAt)}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${STATUS_COLORS[selectedTransaction.status] || "bg-gray-100"}`}>
                {selectedTransaction.status}
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Customer */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Customer</p>
                <p className="font-medium">
                  {selectedTransaction.memberName || "Walk-in Customer"}
                </p>
              </div>

              {/* Line items */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-2">Items</p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                  {selectedTransaction.POSLineItem.map(item => (
                    <div key={item.id} className="p-3 flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{item.itemName}</p>
                        <p className="text-xs text-gray-500">
                          {item.type === "membership" ? "Membership" : "Product"}
                          {item.itemSku && ` · ${item.itemSku}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatCents(item.unitPriceCents)} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium">{formatCents(item.subtotalCents)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatCents(selectedTransaction.subtotalCents)}</span>
                </div>
                {selectedTransaction.taxCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax</span>
                    <span>{formatCents(selectedTransaction.taxCents)}</span>
                  </div>
                )}
                {selectedTransaction.discountCents > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount</span>
                    <span>-{formatCents(selectedTransaction.discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{formatCents(selectedTransaction.totalCents)}</span>
                </div>
              </div>

              {/* Payment info */}
              <div>
                <p className="text-xs text-gray-500 uppercase">Payment Method</p>
                {(() => {
                  const splits = parsePaymentMethod(selectedTransaction.paymentMethod);
                  if (splits.length === 1 && !splits[0].label) {
                    return <p className="font-medium">{splits[0].method}</p>;
                  }
                  return (
                    <div className="space-y-1 mt-1">
                      {splits.map((s, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>
                            {s.method}
                            {s.label && <span className="text-gray-500"> ({s.label})</span>}
                          </span>
                          <span className="font-medium">{formatCents(s.amountCents)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Notes */}
              {selectedTransaction.notes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex gap-3 justify-between">
              <div className="flex gap-2">
                {selectedTransaction.status === "COMPLETED" && (
                  <>
                    <button
                      onClick={() => handleRefund(selectedTransaction)}
                      disabled={processing}
                      className="px-3 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Refund
                    </button>
                    <button
                      onClick={() => handleVoid(selectedTransaction)}
                      disabled={processing}
                      className="px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5 rounded-md transition-colors disabled:opacity-50"
                    >
                      Void
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
