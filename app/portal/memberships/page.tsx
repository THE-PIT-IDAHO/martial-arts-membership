"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Membership {
  id: string;
  status: string;
  startDate: string;
  endDate?: string;
  nextPaymentDate?: string;
  lastPaymentDate?: string;
  customPriceCents?: number;
  pauseEndDate?: string;
  membershipPlan: {
    name: string;
    priceCents?: number;
    billingCycle: string;
    autoRenew: boolean;
    description?: string;
    contractLengthMonths?: number;
    cancellationNoticeDays?: number;
  };
}

interface Invoice {
  id: string;
  invoiceNumber?: string;
  amountCents: number;
  status: string;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
  membership: {
    membershipPlan: { name: string };
  };
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatContractLength(days: number): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} ${months === 1 ? "month" : "months"}`;
  }
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

const statusColors: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  PENDING: "bg-yellow-100 text-yellow-700",
  PAST_DUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  REFUNDED: "bg-blue-100 text-blue-700",
};

const brandIcons: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  diners: "Diners",
  jcb: "JCB",
  unionpay: "UnionPay",
};

function MembershipsContent() {
  const searchParams = useSearchParams();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [defaultPaymentId, setDefaultPaymentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingCard, setAddingCard] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [paidSuccess, setPaidSuccess] = useState(false);

  const loadPaymentMethods = async () => {
    try {
      const res = await fetch("/api/portal/payment-methods");
      const data = await res.json();
      setPaymentMethods(data.paymentMethods || []);
      setDefaultPaymentId(data.defaultId || null);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/memberships").then((r) => r.json()).catch(() => []),
      fetch("/api/portal/invoices").then((r) => r.json()).catch(() => []),
      fetch("/api/portal/payment-methods").then((r) => r.json()).catch(() => ({ paymentMethods: [], defaultId: null })),
    ]).then(([ms, inv, pm]) => {
      setMemberships(Array.isArray(ms) ? ms : []);
      setInvoices(Array.isArray(inv) ? inv : []);
      setPaymentMethods(pm.paymentMethods || []);
      setDefaultPaymentId(pm.defaultId || null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (searchParams.get("setup") === "success") {
      setSetupSuccess(true);
      loadPaymentMethods();
      window.history.replaceState({}, "", "/portal/memberships");
      const timer = setTimeout(() => setSetupSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
    if (searchParams.get("paid") === "success") {
      setPaidSuccess(true);
      // Refresh invoices to show updated status
      fetch("/api/portal/invoices").then((r) => r.json()).then((inv) => {
        setInvoices(Array.isArray(inv) ? inv : []);
      }).catch(() => {});
      window.history.replaceState({}, "", "/portal/memberships");
      const timer = setTimeout(() => setPaidSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const handlePayInvoice = async (invoiceId: string) => {
    setPayingInvoiceId(invoiceId);
    try {
      const res = await fetch("/api/portal/invoices/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPayingInvoiceId(null);
      }
    } catch {
      setPayingInvoiceId(null);
    }
  };

  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      const res = await fetch("/api/portal/payment-methods", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setAddingCard(false);
    }
  };

  const handleRemoveCard = async (id: string) => {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/portal/payment-methods/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id));
        if (defaultPaymentId === id) setDefaultPaymentId(null);
      }
    } catch { /* ignore */ }
    setRemovingId(null);
  };

  const handleSetDefault = async (id: string) => {
    setSettingDefaultId(id);
    try {
      const res = await fetch(`/api/portal/payment-methods/${id}/default`, { method: "PUT" });
      if (res.ok) {
        setDefaultPaymentId(id);
      }
    } catch { /* ignore */ }
    setSettingDefaultId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const activeMembership = memberships.find((m) => m.status === "ACTIVE");
  const pausedMembership = !activeMembership ? memberships.find((m) => m.status === "PAUSED") : null;
  const primaryMembership = activeMembership || pausedMembership;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const billingLabel = (cycle: string) => {
    switch (cycle) {
      case "WEEKLY": return "Weekly";
      case "MONTHLY": return "Monthly";
      case "YEARLY": return "Annually";
      case "QUARTERLY": return "Quarterly";
      default: return cycle.charAt(0) + cycle.slice(1).toLowerCase();
    }
  };

  const membershipStatusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    PAUSED: "bg-yellow-100 text-yellow-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-red-100 text-red-700",
  };

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Memberships</h1>

      {setupSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Card added successfully!
        </div>
      )}

      {paidSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Payment successful!
        </div>
      )}

      {primaryMembership ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 flex items-start justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900">{primaryMembership.membershipPlan.name}</p>
              {primaryMembership.membershipPlan.description && (
                <p className="text-sm text-gray-500 mt-0.5">{primaryMembership.membershipPlan.description}</p>
              )}
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${membershipStatusColors[primaryMembership.status] || "bg-gray-100 text-gray-500"}`}>
              {primaryMembership.status}
            </span>
          </div>

          {/* Paused banner */}
          {primaryMembership.status === "PAUSED" && primaryMembership.pauseEndDate && (
            <div className="mx-4 mb-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
              Paused until {formatDate(primaryMembership.pauseEndDate)}
            </div>
          )}

          {/* Details grid */}
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {/* Price */}
            {(primaryMembership.customPriceCents || primaryMembership.membershipPlan.priceCents) && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Price</p>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {formatCents(primaryMembership.customPriceCents || primaryMembership.membershipPlan.priceCents!)}
                </p>
              </div>
            )}

            {/* Billing Cycle */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Billing</p>
              <p className="text-base font-semibold text-gray-900 mt-1">
                {billingLabel(primaryMembership.membershipPlan.billingCycle)}
              </p>
            </div>

            {/* Next Payment */}
            {primaryMembership.nextPaymentDate && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Next Payment</p>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {formatDate(primaryMembership.nextPaymentDate)}
                </p>
              </div>
            )}

            {/* Last Payment */}
            {primaryMembership.lastPaymentDate && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Last Payment</p>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {formatDate(primaryMembership.lastPaymentDate)}
                </p>
              </div>
            )}

            {/* Start Date */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Start Date</p>
              <p className="text-base font-semibold text-gray-900 mt-1">
                {formatDate(primaryMembership.startDate)}
              </p>
            </div>

            {/* End / Expiration Date */}
            {primaryMembership.endDate && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Expires</p>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {formatDate(primaryMembership.endDate)}
                </p>
              </div>
            )}

            {/* Auto-Renew */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Auto-Renew</p>
              <p className={`text-base font-semibold mt-1 ${primaryMembership.membershipPlan.autoRenew ? "text-green-600" : "text-gray-500"}`}>
                {primaryMembership.membershipPlan.autoRenew ? "Yes" : "No"}
              </p>
            </div>

            {/* Contract Length */}
            {primaryMembership.membershipPlan.contractLengthMonths && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Contract</p>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {formatContractLength(primaryMembership.membershipPlan.contractLengthMonths)}
                </p>
              </div>
            )}

            {/* Cancellation Notice */}
            {primaryMembership.membershipPlan.cancellationNoticeDays && primaryMembership.membershipPlan.cancellationNoticeDays > 0 && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Cancel Notice</p>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  {primaryMembership.membershipPlan.cancellationNoticeDays} {primaryMembership.membershipPlan.cancellationNoticeDays === 1 ? "day" : "days"}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500 mb-6">
          No active membership.
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mb-3">Payment Methods</h2>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-6">
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-gray-500 mb-3">No saved cards yet.</p>
        ) : (
          <div className="space-y-3 mb-3">
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-7 bg-gray-100 rounded flex items-center justify-center">
                    <svg className="w-6 h-4 text-gray-500" fill="none" viewBox="0 0 24 16" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="1" y="1" width="22" height="14" rx="2" />
                      <line x1="1" y1="6" x2="23" y2="6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {brandIcons[pm.brand] || pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} ····{pm.last4}
                    </p>
                    <p className="text-xs text-gray-400">
                      Expires {pm.expMonth}/{pm.expYear}
                      {defaultPaymentId === pm.id && (
                        <span className="ml-2 text-primary font-medium">Default</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {defaultPaymentId !== pm.id && (
                    <button
                      onClick={() => handleSetDefault(pm.id)}
                      disabled={settingDefaultId === pm.id}
                      className="text-xs text-gray-500 hover:text-primary px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {settingDefaultId === pm.id ? "..." : "Set default"}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveCard(pm.id)}
                    disabled={removingId === pm.id}
                    className="text-xs text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                  >
                    {removingId === pm.id ? (
                      <span className="w-4 h-4 block border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={handleAddCard}
          disabled={addingCard}
          className="w-full py-2.5 text-sm font-medium text-primary border border-primary rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {addingCard ? (
            <>
              <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Redirecting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Card
            </>
          )}
        </button>
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">Invoice History</h2>
      {invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500">
          No invoices yet.
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{formatCents(inv.amountCents)}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{inv.membership.membershipPlan.name}</p>
                  {inv.invoiceNumber && (
                    <p className="text-xs text-gray-400 mt-0.5">#{inv.invoiceNumber}</p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[inv.status] || "bg-gray-100 text-gray-500"}`}>
                  {inv.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Due: {new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  {inv.paidAt && <span>Paid: {new Date(inv.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                </div>
                {(inv.status === "PENDING" || inv.status === "PAST_DUE") && (
                  <button
                    onClick={() => handlePayInvoice(inv.id)}
                    disabled={payingInvoiceId === inv.id}
                    className="text-xs font-semibold text-white bg-primary rounded-lg px-3 py-1.5 hover:bg-primaryDark active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {payingInvoiceId === inv.id ? "Redirecting..." : "Pay Now"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalMembershipsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <MembershipsContent />
    </Suspense>
  );
}
