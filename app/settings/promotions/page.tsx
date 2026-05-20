"use client";

// Gym-wide promotion settings. Holds the default promotion fee (used when
// a style doesn't override it) and the editable text for the "payment failed"
// notification members see when a card decline leaves them with a balance.
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";

const DEFAULT_FAILED_PAYMENT_MESSAGE =
  "Your last promotion fee couldn't be charged automatically. Please see the front desk to settle your balance.";

export default function PromotionsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [defaultFeeDollars, setDefaultFeeDollars] = useState("");
  const [failedMessage, setFailedMessage] = useState(DEFAULT_FAILED_PAYMENT_MESSAGE);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const { settings = [] } = await res.json();
          const lookup = (k: string) =>
            (settings as Array<{ key: string; value: string }>).find((s) => s.key === k)?.value || "";
          const cents = lookup("promotion_fee_cents");
          if (cents) {
            const n = Number(cents);
            if (Number.isFinite(n) && n > 0) {
              setDefaultFeeDollars((n / 100).toFixed(2));
            }
          }
          const msg = lookup("promotion_card_failed_notification");
          if (msg) setFailedMessage(msg);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const dollars = Number(defaultFeeDollars);
      const cents =
        defaultFeeDollars === "" || !Number.isFinite(dollars) || dollars < 0
          ? "0"
          : String(Math.round(dollars * 100));

      await Promise.all([
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "promotion_fee_cents", value: cents }),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "promotion_card_failed_notification", value: failedMessage.trim() }),
        }),
      ]);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/promotions" className="text-xs text-primary hover:text-primaryDark">
            ← Back to Promotions
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-1">Promotion Settings</h1>
        <p className="text-sm text-gray-600 mb-6">
          Defaults that apply to all promotions. Individual styles can override the fee, and
          individual members can override their own. Active membership plans can also apply a
          discount.
        </p>

        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="space-y-6 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Default promotion fee
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Charged when a style doesn&apos;t set its own fee and the member doesn&apos;t have
                an override. Membership-plan discounts still apply on top.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={defaultFeeDollars}
                  onChange={(e) => setDefaultFeeDollars(e.target.value)}
                  placeholder="0.00"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Failed-payment notification text
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Shown to a member whose card-on-file declined a promotion charge.
              </p>
              <textarea
                value={failedMessage}
                onChange={(e) => setFailedMessage(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              {savedAt && Date.now() - savedAt < 3000 && (
                <span className="text-xs text-green-600">Saved.</span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
