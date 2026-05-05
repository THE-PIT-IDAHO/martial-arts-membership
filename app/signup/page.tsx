"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type LinkInfo = {
  maxMembers: number;
  maxStyles: number;
  trialMonths: number;
};

export default function SignupPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Form
  const [gymName, setGymName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ gymName: string; slug: string; loginUrl: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No signup token provided");
      setLoading(false);
      return;
    }

    fetch(`/api/public/signup?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setLinkInfo(data);
        } else {
          setError(data.error || "Invalid signup link");
        }
      })
      .catch(() => setError("Failed to validate link"))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (adminPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          gymName: gymName.trim(),
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim(),
          adminPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(data);
      } else {
        setError(data.error || "Failed to create account");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Dojo Storm!</h1>
          <p className="text-gray-600 mb-1">Your gym <strong>{success.gymName}</strong> has been created.</p>
          <p className="text-sm text-gray-500 mb-6">
            Includes up to {linkInfo?.maxMembers} members and {linkInfo?.maxStyles} styles{linkInfo?.trialMonths ? ` for ${linkInfo.trialMonths} week${linkInfo.trialMonths === 1 ? "" : "s"}` : ""}.
          </p>
          <a
            href={success.loginUrl}
            className="inline-block rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primaryDark"
          >
            Log In to Your Dashboard
          </a>
          <p className="text-xs text-gray-400 mt-3">Your login URL: {success.loginUrl}</p>
        </div>
      </div>
    );
  }

  if (error && !linkInfo) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/logo.png" alt="Dojo Storm" className="h-10 w-10 object-contain" />
            <div className="text-left">
              <p className="text-lg font-black tracking-wider uppercase text-gray-900">
                Dojo <span className="italic">Storm</span>
              </p>
              <p className="text-[9px] uppercase tracking-[0.25em] font-semibold text-gray-500">Software</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">Set up your gym account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Includes up to {linkInfo?.maxMembers} members and {linkInfo?.maxStyles} styles{linkInfo?.trialMonths ? ` for ${linkInfo.trialMonths} week${linkInfo.trialMonths === 1 ? "" : "s"}` : ""}.
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gym / Dojo Name</label>
            <input
              type="text"
              value={gymName}
              onChange={e => setGymName(e.target.value)}
              placeholder="Iron Dragon MMA"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
            <input
              type="text"
              value={adminName}
              onChange={e => setAdminName(e.target.value)}
              placeholder="John Smith"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              placeholder="you@yourgym.com"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
          >
            {submitting ? "Creating Account..." : "Create My Gym Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
