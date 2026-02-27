"use client";

import { useEffect, useState } from "react";

interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  rank?: string;
  primaryStyle?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  memberNumber?: number;
  waiverSigned: boolean;
  waiverSignedAt?: string;
  hasPendingWaiver?: boolean;
  emailOptIn: boolean;
  startDate?: string;
  medicalNotes?: string;
  parentGuardianName?: string;
  uniformSize?: string;
}

export default function PortalProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    medicalNotes: "",
    emailOptIn: true,
    parentGuardianName: "",
    uniformSize: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/portal/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setForm({
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split("T")[0] : "",
          phone: data.phone || "",
          email: data.email || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zipCode: data.zipCode || "",
          emergencyContactName: data.emergencyContactName || "",
          emergencyContactPhone: data.emergencyContactPhone || "",
          medicalNotes: data.medicalNotes || "",
          emailOptIn: data.emailOptIn !== false,
          parentGuardianName: data.parentGuardianName || "",
          uniformSize: data.uniformSize || "",
        });
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage("Profile updated!");
        setEditing(false);
        setProfile((p) => (p ? { ...p, ...form } : p));
      } else {
        setMessage("Failed to save.");
      }
    } catch {
      setMessage("Connection error.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gray-200 mx-auto mb-3 flex items-center justify-center text-2xl font-bold text-gray-500 overflow-hidden">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            `${profile.firstName[0]}${profile.lastName[0]}`
          )}
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {profile.firstName} {profile.lastName}
        </h1>
        {profile.memberNumber && (
          <p className="text-xs text-gray-400 mt-1">Member #{profile.memberNumber}</p>
        )}
      </div>

      {/* Personal Info / Edit Form */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Personal Info</h2>
          <button
            onClick={() => { setEditing(!editing); setMessage(""); }}
            className="text-sm text-primary font-medium"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="First Name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <Field label="Last Name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
            </div>
            <Field label="Date of Birth" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} type="date" />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />
            <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <div className="grid grid-cols-3 gap-2">
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
              <Field label="ZIP" value={form.zipCode} onChange={(v) => setForm({ ...form, zipCode: v })} />
            </div>

            <Field label="Parent/Guardian Name" value={form.parentGuardianName} onChange={(v) => setForm({ ...form, parentGuardianName: v })} />
            <Field label="Uniform Size" value={form.uniformSize} onChange={(v) => setForm({ ...form, uniformSize: v })} />

            <div className="border-t border-gray-100 pt-3 mt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Emergency Contact</p>
              <Field label="Name" value={form.emergencyContactName} onChange={(v) => setForm({ ...form, emergencyContactName: v })} />
              <Field label="Phone" value={form.emergencyContactPhone} onChange={(v) => setForm({ ...form, emergencyContactPhone: v })} type="tel" />
            </div>

            <div className="border-t border-gray-100 pt-3">
              <Field label="Medical Notes" value={form.medicalNotes} onChange={(v) => setForm({ ...form, medicalNotes: v })} multiline />
            </div>

            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={form.emailOptIn}
                onChange={(e) => setForm({ ...form, emailOptIn: e.target.checked })}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm text-gray-700">Receive email notifications</span>
            </label>

            {message && <p className={`text-sm ${message.includes("updated") ? "text-green-600" : "text-red-600"}`}>{message}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-white py-3 rounded-xl font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <InfoRow label="Name" value={`${profile.firstName} ${profile.lastName}`} />
            {profile.dateOfBirth && (
              <InfoRow label="Date of Birth" value={new Date(profile.dateOfBirth).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
            )}
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Phone" value={profile.phone} />
            <InfoRow label="Address" value={[profile.address, profile.city, profile.state, profile.zipCode].filter(Boolean).join(", ")} />
            {profile.parentGuardianName && (
              <InfoRow label="Parent/Guardian" value={profile.parentGuardianName} />
            )}
            {profile.uniformSize && (
              <InfoRow label="Uniform Size" value={profile.uniformSize} />
            )}
            <InfoRow label="Emergency Contact" value={[profile.emergencyContactName, profile.emergencyContactPhone].filter(Boolean).join(" — ")} />
            {profile.medicalNotes && (
              <InfoRow label="Medical Notes" value={profile.medicalNotes} />
            )}
            <InfoRow label="Member Since" value={profile.startDate ? new Date(profile.startDate).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : undefined} />
            <InfoRow label="Waiver" value={
              profile.waiverSigned
                ? `Signed${profile.waiverSignedAt ? ` on ${new Date(profile.waiverSignedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}`
                : profile.hasPendingWaiver
                  ? "Pending Confirmation"
                  : "Not signed"
            } />
            {message && <p className="text-sm text-green-600">{message}</p>}
          </div>
        )}
      </div>

    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-gray-900 text-sm mt-0.5">{value || "—"}</p>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", multiline = false,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
        />
      )}
    </div>
  );
}
