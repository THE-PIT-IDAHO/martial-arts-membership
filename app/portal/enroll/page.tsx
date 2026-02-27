"use client";

import { useEffect, useState } from "react";

interface Plan {
  id: string;
  name: string;
  description?: string;
  priceCents?: number;
  billingCycle: string;
  trialDays?: number;
}

type Step = "plan" | "info" | "waiver" | "done";

export default function PortalEnrollPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [step, setStep] = useState<Step>("plan");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<{ valid: boolean; discountType: string; discountValue: number; description?: string; code: string } | null>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    parentGuardianName: "",
    medicalNotes: "",
    leadSource: "",
    waiverAgreed: false,
  });

  useEffect(() => {
    fetch("/api/portal/plans")
      .then((r) => r.json())
      .then(setPlans);
  }, []);

  function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  async function validatePromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoDiscount(null);
    try {
      const res = await fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), planId: selectedPlan?.id }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromoDiscount(data);
      } else {
        setPromoError(data.error || "Invalid code");
      }
    } catch {
      setPromoError("Failed to validate code");
    } finally {
      setPromoLoading(false);
    }
  }

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      alert("Please fill in your name and email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          selectedPlanId: selectedPlan?.id || null,
          waiverSigned: form.waiverAgreed,
          promoCode: promoDiscount?.code || null,
          leadSource: form.leadSource || null,
        }),
      });

      if (res.ok) {
        setStep("done");
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      alert("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white px-4 py-6 text-center">
        <h1 className="text-2xl font-bold">Join Our Gym</h1>
        <p className="text-white/80 mt-1 text-sm">Start your martial arts journey today</p>
      </div>

      {/* Progress */}
      {step !== "done" && (
        <div className="flex items-center justify-center gap-2 py-4">
          {(["plan", "info", "waiver"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step === s ? "bg-primary text-white" :
                (["plan", "info", "waiver"].indexOf(step) > i) ? "bg-green-500 text-white" :
                "bg-gray-200 text-gray-500"
              }`}>
                {(["plan", "info", "waiver"].indexOf(step) > i) ? "✓" : i + 1}
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-gray-200" />}
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-8 max-w-lg mx-auto">
        {/* Step 1: Select Plan */}
        {step === "plan" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select a Membership Plan</h2>
            <div className="space-y-3">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => { setSelectedPlan(plan); setStep("info"); }}
                  className={`w-full text-left bg-white rounded-2xl border-2 p-4 active:scale-[0.98] transition-all ${
                    selectedPlan?.id === plan.id ? "border-primary" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{plan.name}</p>
                      {plan.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>
                      )}
                    </div>
                    {plan.priceCents != null && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{formatCents(plan.priceCents)}</p>
                        <p className="text-xs text-gray-400">/{plan.billingCycle.toLowerCase()}</p>
                      </div>
                    )}
                  </div>
                  {plan.trialDays && (
                    <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {plan.trialDays}-day free trial
                    </span>
                  )}
                </button>
              ))}

              {/* Promo Code */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mt-2">
                <p className="text-sm font-medium text-gray-700 mb-2">Have a promo code?</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(""); setPromoDiscount(null); }}
                    placeholder="Enter code"
                    className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                  <button
                    onClick={validatePromo}
                    disabled={promoLoading || !promoCode.trim()}
                    className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-xl disabled:opacity-50"
                  >
                    {promoLoading ? "..." : "Apply"}
                  </button>
                </div>
                {promoError && <p className="text-xs text-red-500 mt-1">{promoError}</p>}
                {promoDiscount && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    {promoDiscount.discountType === "PERCENT"
                      ? `${promoDiscount.discountValue}% discount applied!`
                      : `$${(promoDiscount.discountValue / 100).toFixed(2)} discount applied!`}
                  </p>
                )}
              </div>

              <button
                onClick={() => { setSelectedPlan(null); setStep("info"); }}
                className="w-full text-center text-sm text-gray-500 py-3 hover:text-gray-700"
              >
                Skip — I&apos;ll decide later
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Personal Info */}
        {step === "info" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Information</h2>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <InputField label="First Name *" value={form.firstName} onChange={(v) => set("firstName", v)} autoFocus />
                <InputField label="Last Name *" value={form.lastName} onChange={(v) => set("lastName", v)} />
              </div>
              <InputField label="Email *" value={form.email} onChange={(v) => set("email", v)} type="email" />
              <InputField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} type="tel" />
              <InputField label="Date of Birth" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} type="date" />
              <InputField label="Address" value={form.address} onChange={(v) => set("address", v)} />
              <div className="grid grid-cols-3 gap-3">
                <InputField label="City" value={form.city} onChange={(v) => set("city", v)} />
                <InputField label="State" value={form.state} onChange={(v) => set("state", v)} />
                <InputField label="ZIP Code" value={form.zipCode} onChange={(v) => set("zipCode", v)} />
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Emergency Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="Name" value={form.emergencyContactName} onChange={(v) => set("emergencyContactName", v)} />
                  <InputField label="Phone" value={form.emergencyContactPhone} onChange={(v) => set("emergencyContactPhone", v)} type="tel" />
                </div>
              </div>

              <InputField label="Parent/Guardian Name (if minor)" value={form.parentGuardianName} onChange={(v) => set("parentGuardianName", v)} />

              <div>
                <label className="text-xs text-gray-500 block mb-1">Medical Notes (allergies, conditions, etc.)</label>
                <textarea
                  value={form.medicalNotes}
                  onChange={(e) => set("medicalNotes", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">How did you hear about us?</label>
                <select
                  value={form.leadSource}
                  onChange={(e) => set("leadSource", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white"
                >
                  <option value="">— Select —</option>
                  <option value="Website">Website</option>
                  <option value="Walk-in">Walk-in</option>
                  <option value="Referral">Referral / Friend</option>
                  <option value="Social Media">Social Media</option>
                  <option value="Event">Event</option>
                  <option value="Google">Google</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep("plan")}
                className="px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold active:scale-[0.98] transition-all"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
                    alert("Please fill in your first name, last name, and email.");
                    return;
                  }
                  setStep("waiver");
                }}
                className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold active:scale-[0.98] transition-all"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Waiver */}
        {step === "waiver" && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Liability Waiver</h2>
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="max-h-48 overflow-y-auto text-sm text-gray-600 mb-4 border border-gray-100 rounded-lg p-3">
                <p className="font-semibold mb-2">ASSUMPTION OF RISK AND WAIVER OF LIABILITY</p>
                <p className="mb-2">I acknowledge that participation in martial arts training, fitness activities, and related programs involves inherent risks of injury. I voluntarily assume all risks associated with my participation.</p>
                <p className="mb-2">I hereby release, waive, and discharge the gym, its owners, instructors, staff, and agents from any and all liability, claims, demands, and causes of action arising out of or related to any injury sustained during my participation.</p>
                <p className="mb-2">I understand that martial arts training involves physical contact, strenuous exercise, and the potential for injury including but not limited to sprains, fractures, bruises, and other physical harm.</p>
                <p>I confirm that I am in good physical health and have no medical conditions that would prevent my safe participation. I agree to inform the staff of any changes in my health status.</p>
              </div>

              <label className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.waiverAgreed}
                  onChange={(e) => set("waiverAgreed", e.target.checked)}
                  className="accent-primary w-5 h-5 mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  I have read, understood, and agree to the waiver of liability above.
                  {form.parentGuardianName && " I am the parent/guardian and consent on behalf of the minor."}
                </span>
              </label>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setStep("info")}
                className="px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold active:scale-[0.98] transition-all"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
            <p className="text-gray-500 mb-4">
              We&apos;ve received your enrollment application. Check your email for a confirmation.
            </p>
            <p className="text-gray-400 text-sm">
              The gym will review your application and reach out shortly.
            </p>
            <a
              href="/portal/login"
              className="inline-block mt-6 text-primary font-medium hover:underline"
            >
              Already a member? Sign in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  label, value, onChange, type = "text", autoFocus = false,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
      />
    </div>
  );
}
