"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

const STATUS_OPTIONS = ["PROSPECT", "ACTIVE", "INACTIVE", "PARENT", "COACH", "BANNED"] as const;

// Format phone number as user types: (123) 456-7890
function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");

  // Format based on length
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function calculateAgeFromDateString(dateString?: string | null): number | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > d.getMonth() ||
    (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age >= 0 ? age : null;
}

export default function NewMemberPage() {
  const router = useRouter();

  // Basic
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["PROSPECT"]);

  // Personal info
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [parentGuardianName, setParentGuardianName] = useState("");
  const [notes, setNotes] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageFromState = calculateAgeFromDateString(dateOfBirth);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          status: statuses.join(","),

          dateOfBirth: dateOfBirth || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: stateValue.trim() || null,
          zipCode: zipCode.trim() || null,
          emergencyContactName: emergencyContactName.trim() || null,
          emergencyContactPhone: emergencyContactPhone.trim() || null,
          parentGuardianName: parentGuardianName.trim() || null,
          notes: notes.trim() || null,
          medicalNotes: medicalNotes.trim() || null
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create member");
      }

      const data = await res.json();
      const newMember = data.member;

      router.push(`/members/${newMember.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create member");
      setSaving(false);
    }
  }

  function handleCancel() {
    router.push("/members");
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Add Member</h1>
            <p className="text-sm text-gray-600">
              Create a new member profile. You can always edit details later.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Back to Members
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"
          >
            {/* BASIC */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                First Name *
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Last Name *
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                placeholder="(123) 456-7890"
                maxLength={14}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Status
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Coach */}
                <button
                  type="button"
                  onClick={() => {
                    if (statuses.includes("COACH")) {
                      setStatuses((prev) => prev.filter((s) => s !== "COACH"));
                    } else {
                      // Adding Coach clears Banned
                      setStatuses((prev) => [...prev.filter((s) => s !== "COACH" && s !== "BANNED"), "COACH"]);
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    statuses.includes("COACH")
                      ? "bg-purple-100 text-purple-800 border-purple-300"
                      : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Coach
                </button>
                {/* Active */}
                <button
                  type="button"
                  onClick={() => {
                    // Prospect/Active/Inactive are mutually exclusive, clears Banned
                    setStatuses((prev) => {
                      const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                      return [...others, "ACTIVE"];
                    });
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    statuses.includes("ACTIVE")
                      ? "bg-green-100 text-green-800 border-green-300"
                      : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Active
                </button>
                {/* Parent */}
                <button
                  type="button"
                  onClick={() => {
                    if (statuses.includes("PARENT")) {
                      setStatuses((prev) => prev.filter((s) => s !== "PARENT"));
                    } else {
                      // Adding Parent clears Banned
                      setStatuses((prev) => [...prev.filter((s) => s !== "PARENT" && s !== "BANNED"), "PARENT"]);
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    statuses.includes("PARENT")
                      ? "bg-blue-100 text-blue-800 border-blue-300"
                      : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Parent
                </button>
                {/* Inactive */}
                <button
                  type="button"
                  onClick={() => {
                    // Prospect/Active/Inactive are mutually exclusive, clears Banned
                    setStatuses((prev) => {
                      const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                      return [...others, "INACTIVE"];
                    });
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    statuses.includes("INACTIVE")
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Inactive
                </button>
                {/* Prospect */}
                <button
                  type="button"
                  onClick={() => {
                    // Prospect/Active/Inactive are mutually exclusive, clears Banned
                    setStatuses((prev) => {
                      const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                      return [...others, "PROSPECT"];
                    });
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    statuses.includes("PROSPECT")
                      ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                      : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Prospect
                </button>
                {/* Banned */}
                <button
                  type="button"
                  onClick={() => {
                    if (statuses.includes("BANNED")) {
                      // Removing Banned - confirm first
                      if (window.confirm("Are you sure you want to remove the banned status from this member?")) {
                        setStatuses((prev) => prev.filter((s) => s !== "BANNED"));
                      }
                    } else {
                      // Adding Banned clears ALL other statuses - confirm first
                      if (window.confirm("Are you sure you want to ban this member? This will clear all other statuses.")) {
                        setStatuses(["BANNED"]);
                      }
                    }
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    statuses.includes("BANNED")
                      ? "bg-gray-200 text-gray-900 border-gray-400"
                      : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  Banned
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Default is <strong>Prospect</strong> for brand new leads.
              </p>
            </div>

            {/* PERSONAL INFO FIELDS */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              {dateOfBirth && ageFromState !== null && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Age: {ageFromState} years
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Address
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                City
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                State
              </label>
              <input
                value={stateValue}
                onChange={(e) => setStateValue(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Zip Code
              </label>
              <input
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Emergency Contact Name
              </label>
              <input
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Emergency Contact Phone
              </label>
              <input
                type="tel"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(formatPhoneNumber(e.target.value))}
                placeholder="(123) 456-7890"
                maxLength={14}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Parent/Guardian Name (for minors)
              </label>
              <input
                value={parentGuardianName}
                onChange={(e) => setParentGuardianName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                rows={2}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="block text-xs font-medium text-gray-700">
                Medical Notes
              </label>
              <textarea
                value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                rows={2}
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-2 mt-2">
              <button
                type="submit"
                disabled={saving}
                className="text-xs rounded-md bg-primary px-4 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create Member"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppLayout>
  );
}

