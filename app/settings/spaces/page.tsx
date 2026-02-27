"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

interface LocationOption {
  id: string;
  name: string;
}

interface Space {
  id: string;
  name: string;
  locationId: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface SpaceForm {
  name: string;
  locationId: string;
}

const emptyForm: SpaceForm = { name: "", locationId: "" };

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SpaceForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [spacesRes, locRes] = await Promise.all([
        fetch("/api/spaces"),
        fetch("/api/locations"),
      ]);
      const spacesData = await spacesRes.json();
      const locData = await locRes.json();
      setSpaces(spacesData.spaces || []);
      setLocations((locData.locations || []).filter((l: LocationOption & { isActive: boolean }) => l.isActive));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(space: Space) {
    setEditingId(space.id);
    setForm({
      name: space.name,
      locationId: space.locationId || "",
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        locationId: form.locationId || null,
      };
      if (editingId) {
        await fetch(`/api/spaces/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      await loadData();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(space: Space) {
    await fetch(`/api/spaces/${space.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !space.isActive }),
    });
    await loadData();
  }

  async function handleDelete(space: Space) {
    if (!confirm(`Delete space "${space.name}"?`)) return;
    await fetch(`/api/spaces/${space.id}`, { method: "DELETE" });
    await loadData();
  }

  function getLocationName(id: string | null) {
    if (!id) return "—";
    return locations.find((l) => l.id === id)?.name || "—";
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Spaces</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Define rooms, mats, or areas where classes and appointments take place.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Add Space
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : spaces.length === 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No spaces yet.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Add spaces like &quot;Mat 1&quot;, &quot;Mat 2&quot;, or &quot;Ring&quot; to assign to classes and appointments.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900 dark:text-gray-200">Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-900 dark:text-gray-200">Location</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-gray-900 dark:text-gray-200">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {spaces.map((space) => (
                  <tr key={space.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{space.name}</td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                      {getLocationName(space.locationId)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => toggleActive(space)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          space.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {space.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => openEdit(space)}
                        className="text-xs font-medium text-primary hover:text-primaryDark mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(space)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
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
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold dark:text-white">
                {editingId ? "Edit Space" : "Add Space"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Mat 1, Ring, Cage"
                />
              </div>
              {locations.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                  <select
                    value={form.locationId}
                    onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="">No specific location</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
