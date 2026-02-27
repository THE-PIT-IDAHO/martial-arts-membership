"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type Appointment = { id: string; title: string; isActive?: boolean };

type ServicePackage = {
  id: string;
  name: string;
  description: string | null;
  appointmentId: string | null;
  sessionsIncluded: number;
  priceCents: number;
  expirationDays: number | null;
  isActive: boolean;
  availableOnline: boolean;
  sortOrder: number;
  appointment: { id: string; title: string } | null;
};

export default function ServicePackagesPage() {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    appointmentId: "",
    sessionsIncluded: "1",
    priceCents: "",
    expirationDays: "",
    isActive: true,
    availableOnline: false,
  });

  useEffect(() => {
    fetchData();
  }, []);

  function fetchData() {
    Promise.all([
      fetch("/api/service-packages").then((r) => r.json()),
      fetch("/api/appointments").then((r) => r.json()),
    ])
      .then(([pkgData, aptData]) => {
        setPackages(pkgData.servicePackages || []);
        setAppointments(aptData.appointments || []);
      })
      .finally(() => setLoading(false));
  }

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      appointmentId: "",
      sessionsIncluded: "1",
      priceCents: "",
      expirationDays: "",
      isActive: true,
      availableOnline: false,
    });
    setShowModal(true);
  }

  function openEdit(pkg: ServicePackage) {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description || "",
      appointmentId: pkg.appointmentId || "",
      sessionsIncluded: String(pkg.sessionsIncluded),
      priceCents: String(pkg.priceCents),
      expirationDays: pkg.expirationDays ? String(pkg.expirationDays) : "",
      isActive: pkg.isActive,
      availableOnline: pkg.availableOnline,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.priceCents) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        appointmentId: form.appointmentId || null,
        sessionsIncluded: parseInt(form.sessionsIncluded) || 1,
        priceCents: parseInt(form.priceCents),
        expirationDays: form.expirationDays ? parseInt(form.expirationDays) : null,
        isActive: form.isActive,
        availableOnline: form.availableOnline,
      };

      const url = editing
        ? `/api/service-packages/${editing.id}`
        : "/api/service-packages";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this appointment?")) return;
    const res = await fetch(`/api/service-packages/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchData();
    } else {
      const text = await res.text();
      alert(text || "Failed to delete");
    }
  }

  function formatPrice(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Appointments
          </h1>
          <button
            onClick={openCreate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark"
          >
            New Appointment
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create appointments that can be sold through POS. Members receive appointment credits they can use to book appointments.
        </p>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : packages.length === 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No appointments yet.</p>
            <button
              onClick={openCreate}
              className="mt-3 text-sm font-semibold text-primary hover:underline"
            >
              Create your first appointment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">Appointment Type</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-center">Sessions</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-right">Price</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-center">Expires</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-center">Online</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {pkg.name}
                      {pkg.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">
                          {pkg.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {pkg.appointment?.title || "Any"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-900 dark:text-white font-medium">
                      {pkg.sessionsIncluded}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                      {formatPrice(pkg.priceCents)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                      {pkg.expirationDays ? `${pkg.expirationDays}d` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          pkg.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {pkg.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pkg.availableOnline ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEdit(pkg)}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(pkg.id)}
                        className="text-xs text-red-500 hover:underline"
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
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {editing ? "Edit Appointment" : "New Appointment"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Appointment Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Personal Training 10-Pack"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Appointment Type
                </label>
                <select
                  value={form.appointmentId}
                  onChange={(e) => setForm({ ...form, appointmentId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Any Appointment Type</option>
                  {appointments
                    .filter((a) => a.isActive !== false)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Leave as &quot;Any&quot; if credits can be used for any appointment
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sessions Included *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.sessionsIncluded}
                    onChange={(e) => setForm({ ...form, sessionsIncluded: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Price (cents) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.priceCents}
                    onChange={(e) => setForm({ ...form, priceCents: e.target.value })}
                    placeholder="e.g., 5000 = $50"
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expiration (days after purchase)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.expirationDays}
                  onChange={(e) => setForm({ ...form, expirationDays: e.target.value })}
                  placeholder="Leave empty for no expiration"
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="accent-primary"
                  />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.availableOnline}
                    onChange={(e) => setForm({ ...form, availableOnline: e.target.checked })}
                    className="accent-primary"
                  />
                  Available on Portal
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.priceCents}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
