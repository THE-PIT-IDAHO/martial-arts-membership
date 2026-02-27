"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const quickLinks = [
  { label: "My Styles", href: "/portal/styles", featureKey: "styles" },
  { label: "My Bookings", href: "/portal/bookings", featureKey: "bookings" },
  { label: "Attendance", href: "/portal/attendance", featureKey: "attendance" },
  { label: "Memberships", href: "/portal/memberships", featureKey: "memberships" },
  { label: "Dojo Board", href: "/portal/board", featureKey: "board" },
  { label: "Appointments", href: "/portal/appointments", featureKey: "appointments" },
  { label: "Documents", href: "/portal/documents", featureKey: "documents" },
  { label: "Belt Testing", href: "/portal/testing", featureKey: "testing" },
];

interface MemberInfo {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  rank?: string;
  primaryStyle?: string;
  accountCreditCents?: number;
  memberships: {
    id: string;
    status: string;
    membershipPlan: { name: string; billingCycle: string };
  }[];
}

interface BookingInfo {
  id: string;
  bookingDate: string;
  status: string;
  classSession: { name: string; startsAt: string; endsAt: string };
}

interface TrialInfo {
  id: string;
  classesUsed: number;
  maxClasses: number;
  expiresAt: string;
  status: string;
}

interface ChildInfo {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  rank?: string;
  primaryStyle?: string;
  status: string;
  relationship: string;
  activePlan: string | null;
  activeTrial: { classesUsed: number; maxClasses: number; expiresAt: string } | null;
}

export default function PortalDashboard() {
  const router = useRouter();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [bookings, setBookings] = useState<BookingInfo[]>([]);
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/auth/me").then((r) => r.json()),
      fetch("/api/portal/bookings").then((r) => r.json()).catch(() => []),
      fetch("/api/portal/trial").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portal/family").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/portal/features").then((r) => r.json()).catch(() => ({})),
    ]).then(([me, bk, tr, fam, feat]) => {
      setMember(me);
      setBookings(Array.isArray(bk) ? bk.filter((b: BookingInfo) => b.status === "CONFIRMED").slice(0, 3) : []);
      if (tr?.trial) setTrial(tr.trial);
      if (fam?.children) setChildren(fam.children);
      if (feat?.features) setFeatures(feat.features);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) return null;

  const activePlan = member.memberships?.[0];

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Welcome Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Hi, {member.firstName}!
        </h1>
        <p className="text-gray-500 mt-0.5">Welcome back to your portal.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Membership</p>
          <p className="text-base font-semibold text-gray-900 mt-1">
            {activePlan ? activePlan.membershipPlan.name : "No Plan"}
          </p>
          <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            activePlan ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>
            {activePlan ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Upcoming</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{bookings.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">booked classes</p>
        </div>

        <div className={`bg-white rounded-2xl p-4 border shadow-sm col-span-2 ${
          (member.accountCreditCents ?? 0) < 0 ? "border-red-200" : "border-gray-200"
        }`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Account Balance</p>
          <p className={`text-2xl font-bold mt-1 ${
            (member.accountCreditCents ?? 0) < 0
              ? "text-red-600"
              : (member.accountCreditCents ?? 0) > 0
                ? "text-green-600"
                : "text-gray-900"
          }`}>
            {(member.accountCreditCents ?? 0) < 0
              ? `Due $${(Math.abs(member.accountCreditCents!) / 100).toFixed(2)}`
              : (member.accountCreditCents ?? 0) > 0
                ? `Balance $${(member.accountCreditCents! / 100).toFixed(2)}`
                : "$0.00"}
          </p>
        </div>
      </div>

      {/* QR Code Card */}
      <button
        onClick={() => setShowQR(!showQR)}
        className="w-full mb-4 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 active:scale-[0.98] transition-all"
      >
        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75H16.5v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75H16.5v-.75z" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <p className="font-semibold text-gray-900 text-sm">My QR Code</p>
          <p className="text-xs text-gray-500">Tap to show for check-in</p>
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${showQR ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {showQR && (
        <div className="mb-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/members/${member.id}/qrcode`}
            alt="QR Code"
            className="w-48 h-48"
          />
          <p className="text-sm text-gray-600 mt-3 font-medium">
            {member.firstName} {member.lastName}
          </p>
          <p className="text-xs text-gray-400 mt-1">Show this at the kiosk to check in</p>
        </div>
      )}

      {/* Trial Pass Card */}
      {trial && trial.status === "ACTIVE" && (
        <div className="mb-6 bg-purple-50 rounded-2xl border border-purple-200 p-4">
          <p className="text-xs text-purple-600 uppercase tracking-wide font-semibold">Trial Pass</p>
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-2xl font-bold text-purple-900">
                {trial.classesUsed}/{trial.maxClasses}
              </p>
              <p className="text-xs text-purple-600">classes used</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-purple-900">
                {Math.max(0, Math.ceil((new Date(trial.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left
              </p>
              <p className="text-xs text-purple-500">
                Expires {new Date(trial.expiresAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/portal/classes")}
            className="mt-3 w-full py-2 bg-purple-600 text-white text-sm rounded-lg font-medium hover:bg-purple-700"
          >
            Browse Classes
          </button>
        </div>
      )}

      {/* Upcoming Bookings */}
      {bookings.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Classes</h2>
            <Link href="/portal/bookings" className="text-sm text-primary font-medium">
              View All
            </Link>
          </div>
          <div className="space-y-2">
            {bookings.map((b) => {
              const start = new Date(b.classSession.startsAt);
              return (
                <div key={b.id} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <p className="font-semibold text-gray-900">{b.classSession.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {" at "}
                    {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Children */}
      {children.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">My Children</h2>
          <div className="space-y-2">
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/portal/family/${child.id}`}
                className="flex items-center gap-3 bg-white rounded-xl p-4 border border-gray-200 shadow-sm active:scale-[0.98] transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                  {child.firstName[0]}{child.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{child.firstName} {child.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {child.activePlan || (child.activeTrial ? `Trial (${child.activeTrial.classesUsed}/${child.activeTrial.maxClasses} classes)` : child.rank || "No plan")}
                  </p>
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="mb-6">
        <div className="grid grid-cols-2 gap-2">
          {quickLinks
            .filter((item) => !features || features[item.featureKey] !== false)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-primary text-white text-center py-3 rounded-xl font-semibold text-sm hover:bg-primaryDark active:scale-[0.98] transition-all"
              >
                {item.label}
              </Link>
            ))}
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={async () => {
          await fetch("/api/portal/auth/logout", { method: "POST" });
          router.replace("/portal/login");
        }}
        className="w-full bg-white text-gray-700 border border-gray-300 py-3 rounded-2xl font-semibold active:scale-[0.98] transition-all"
      >
        Sign Out
      </button>
    </div>
  );
}
