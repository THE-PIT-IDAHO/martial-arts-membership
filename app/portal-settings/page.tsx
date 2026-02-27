"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

const PORTAL_FEATURES = [
  {
    key: "portal_feature_classes",
    label: "Classes",
    description: "Allow members to view the class schedule and book classes",
  },
  {
    key: "portal_feature_messages",
    label: "Messages",
    description: "Allow members to send and receive messages with staff",
  },
  {
    key: "portal_feature_store_goods",
    label: "Store — Goods",
    description: "Allow members to browse and purchase physical products (uniforms, gear, etc.)",
  },
  {
    key: "portal_feature_store_services",
    label: "Store — Services",
    description: "Allow members to view and sign up for membership plans",
  },
  {
    key: "portal_feature_styles",
    label: "My Styles",
    description: "Allow members to view their enrolled styles, rank, and curriculum progress",
  },
  {
    key: "portal_feature_bookings",
    label: "My Bookings",
    description: "Allow members to view and manage their class bookings",
  },
  {
    key: "portal_feature_attendance",
    label: "Attendance History",
    description: "Allow members to view their attendance records",
  },
  {
    key: "portal_feature_memberships",
    label: "Memberships",
    description: "Allow members to view their membership plans and invoices",
  },
  {
    key: "portal_feature_board",
    label: "Dojo Board",
    description: "Allow members to view and post on the Dojo Board community feed",
  },
];

export default function PortalSettingsPage() {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          if (data.settings && Array.isArray(data.settings)) {
            for (const s of data.settings) map[s.key] = s.value;
          }
          const loaded: Record<string, boolean> = {};
          for (const f of PORTAL_FEATURES) {
            // Default to true if not set
            loaded[f.key] = map[f.key] !== "false";
          }
          setFeatures(loaded);
        }
      } catch {
        // default all on
        const defaults: Record<string, boolean> = {};
        for (const f of PORTAL_FEATURES) defaults[f.key] = true;
        setFeatures(defaults);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const [key, val] of Object.entries(features)) {
        payload[key] = val ? "true" : "false";
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccessMessage("Portal settings saved!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Client Portal</h1>
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Client Portal</h1>
          <p className="text-sm text-gray-600">
            Configure which features are available to members in the client portal
          </p>
        </div>

        {successMessage && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold mb-2">Portal Features</h3>
          <p className="text-sm text-gray-500 mb-6">
            Toggle features on or off to control what members can access in the portal. Disabled features will be hidden from the portal navigation.
          </p>

          <div className="space-y-4">
            {PORTAL_FEATURES.map((feature) => (
              <label
                key={feature.key}
                className="flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-medium text-gray-900">{feature.label}</p>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                </div>
                <div className="relative ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={features[feature.key] ?? true}
                    onChange={(e) =>
                      setFeatures((prev) => ({ ...prev, [feature.key]: e.target.checked }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
