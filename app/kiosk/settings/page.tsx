"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

type Style = {
  id: string;
  name: string;
};

type KioskSettings = {
  exitPin: string;
  welcomeMessage: string;
  logoUrl: string;
  autoConfirm: boolean;
  allowedStyleIds: string[];
  autoChangeMinutes: number;
};

const DEFAULT_SETTINGS: KioskSettings = {
  exitPin: "",
  welcomeMessage: "",
  logoUrl: "",
  autoConfirm: true,
  allowedStyleIds: [],
  autoChangeMinutes: 10,
};

export default function KioskSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<KioskSettings>(DEFAULT_SETTINGS);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [settingsRes, stylesRes] = await Promise.all([
          fetch("/api/settings?key=kiosk_settings"),
          fetch("/api/styles"),
        ]);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.setting?.value) {
            try {
              const parsed = JSON.parse(data.setting.value);
              setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            } catch { /* use defaults */ }
          }
        }

        if (stylesRes.ok) {
          const data = await stylesRes.json();
          setStyles((data.styles || []).map((s: any) => ({ id: s.id, name: s.name })));
        }
      } catch (err) {
        console.error("Failed to load kiosk settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "kiosk_settings",
          value: JSON.stringify(settings),
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save kiosk settings:", err);
    } finally {
      setSaving(false);
    }
  }

  function toggleStyleFilter(styleId: string) {
    setSettings((prev) => {
      const ids = prev.allowedStyleIds.includes(styleId)
        ? prev.allowedStyleIds.filter((id) => id !== styleId)
        : [...prev.allowedStyleIds, styleId];
      return { ...prev, allowedStyleIds: ids };
    });
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Kiosk Mode</h1>
            <p className="mt-1 text-sm text-gray-600">
              Configure and launch the member check-in kiosk
            </p>
          </div>
          <button
            onClick={() => router.push("/kiosk")}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Launch Kiosk
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Security */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Security</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Exit Pin Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={settings.exitPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setSettings((prev) => ({ ...prev, exitPin: val }));
                }}
                placeholder="Leave empty for no pin"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-gray-500">
                4-6 digit pin required to exit kiosk mode. Leave blank to disable.
              </p>
            </div>
          </div>

          {/* Branding */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Display</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Welcome Message
                </label>
                <input
                  type="text"
                  value={settings.welcomeMessage}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, welcomeMessage: e.target.value }))
                  }
                  placeholder="e.g., Welcome to Our Dojo!"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Logo URL
                </label>
                <input
                  type="text"
                  value={settings.logoUrl}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, logoUrl: e.target.value }))
                  }
                  placeholder="https://example.com/logo.png"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Class Settings */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Class Settings</h2>
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoConfirm}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, autoConfirm: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">Auto-confirm kiosk check-ins</span>
              </label>

              <div>
                <label className="mb-2 block text-xs font-medium text-gray-700">
                  Show Classes for Styles
                </label>
                <p className="mb-2 text-xs text-gray-500">
                  Only show classes matching these styles. Leave all unchecked to show all classes.
                </p>
                <div className="space-y-1.5">
                  {styles.map((style) => (
                    <label key={style.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.allowedStyleIds.includes(style.id)}
                        onChange={() => toggleStyleFilter(style.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">{style.name}</span>
                    </label>
                  ))}
                  {styles.length === 0 && (
                    <p className="text-xs text-gray-400">No styles configured</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Timing */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Timing</h2>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Auto-switch to next class
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={settings.autoChangeMinutes}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      autoChangeMinutes: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm text-gray-600">minutes before class starts</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                The kiosk will automatically switch to the next upcoming class this many minutes before it begins. Set to 0 to disable.
              </p>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">Settings saved</span>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
