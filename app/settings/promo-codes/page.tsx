"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type PromoCode = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  applicablePlanIds: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "PERCENT",
    discountValue: "",
    maxRedemptions: "",
    validFrom: "",
    validUntil: "",
    isActive: true,
  });

  useEffect(() => {
    fetchCodes();
  }, []);

  function fetchCodes() {
    fetch("/api/promo-codes")
      .then((r) => r.json())
      .then((data) => setCodes(data.codes || []))
      .finally(() => setLoading(false));
  }

  function openCreate() {
    setEditingCode(null);
    setForm({
      code: "",
      description: "",
      discountType: "PERCENT",
      discountValue: "",
      maxRedemptions: "",
      validFrom: "",
      validUntil: "",
      isActive: true,
    });
    setShowModal(true);
  }

  function openEdit(pc: PromoCode) {
    setEditingCode(pc);
    setForm({
      code: pc.code,
      description: pc.description || "",
      discountType: pc.discountType,
      discountValue: String(pc.discountValue),
      maxRedemptions: pc.maxRedemptions ? String(pc.maxRedemptions) : "",
      validFrom: pc.validFrom ? pc.validFrom.split("T")[0] : "",
      validUntil: pc.validUntil ? pc.validUntil.split("T")[0] : "",
      isActive: pc.isActive,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.discountValue) {
      alert("Code and discount value are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: parseInt(form.discountValue),
        maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : null,
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
        isActive: form.isActive,
      };

      const url = editingCode
        ? `/api/promo-codes/${editingCode.id}`
        : "/api/promo-codes";
      const res = await fetch(url, {
        method: editingCode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        alert(text || "Failed to save");
        return;
      }
      setShowModal(false);
      fetchCodes();
    } catch {
      alert("Error saving promo code");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this promo code?")) return;
    await fetch(`/api/promo-codes/${id}`, { method: "DELETE" });
    fetchCodes();
  }

  async function toggleActive(pc: PromoCode) {
    await fetch(`/api/promo-codes/${pc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !pc.isActive }),
    });
    fetchCodes();
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Promo Codes</h1>
          <button
            onClick={openCreate}
            className="px-3 py-1 text-xs font-semibold bg-primary text-white rounded-md hover:bg-primaryDark transition-colors"
          >
            New Code
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : codes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No promo codes yet. Create one to get started.
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Discount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usage</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Valid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {codes.map((pc) => (
                  <tr key={pc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-gray-900">{pc.code}</span>
                      {pc.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{pc.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {pc.discountType === "PERCENT"
                        ? `${pc.discountValue}% off`
                        : `$${(pc.discountValue / 100).toFixed(2)} off`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pc.redemptionCount}
                      {pc.maxRedemptions ? ` / ${pc.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {pc.validFrom || pc.validUntil ? (
                        <>
                          {pc.validFrom && new Date(pc.validFrom).toLocaleDateString()}
                          {pc.validFrom && pc.validUntil && " — "}
                          {pc.validUntil && new Date(pc.validUntil).toLocaleDateString()}
                        </>
                      ) : (
                        "No expiry"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(pc)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          pc.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {pc.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(pc)}
                        className="text-xs text-primary hover:text-primaryDark font-medium mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(pc.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingCode ? "Edit Promo Code" : "New Promo Code"}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SUMMER20"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional description"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                    <select
                      value={form.discountType}
                      onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="PERCENT">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {form.discountType === "PERCENT" ? "Discount (%)" : "Discount (cents)"}
                    </label>
                    <input
                      type="number"
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                      placeholder={form.discountType === "PERCENT" ? "20" : "500"}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Redemptions</label>
                  <input
                    type="number"
                    value={form.maxRedemptions}
                    onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                    placeholder="Leave empty for unlimited"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                    <input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                    <input
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 text-xs font-semibold bg-primary text-white rounded-md hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingCode ? "Save Changes" : "Create Code"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
