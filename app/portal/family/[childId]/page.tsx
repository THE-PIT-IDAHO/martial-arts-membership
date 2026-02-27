"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ChildProfile {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  rank?: string;
  primaryStyle?: string;
  status: string;
  dateOfBirth?: string;
  relationship: string;
  memberships: { id: string; status: string; membershipPlan: { name: string; billingCycle: string } }[];
  trialPasses: { id: string; classesUsed: number; maxClasses: number; expiresAt: string }[];
  attendances: {
    id: string;
    attendanceDate: string;
    classSession?: { name: string; startsAt: string };
  }[];
  bookings: {
    id: string;
    bookingDate: string;
    status: string;
    classSession: { name: string; startsAt: string; endsAt: string };
  }[];
  rankInfo: {
    styleName: string;
    rankName: string;
    nextRankName: string | null;
    allRanks: string[];
  }[];
}

export default function ChildProfilePage() {
  const params = useParams();
  const router = useRouter();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/portal/family/${params.childId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setChild(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Unable to load profile");
        setLoading(false);
      });
  }, [params.childId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !child) {
    return (
      <div className="px-4 pt-6 max-w-lg mx-auto">
        <p className="text-red-600">{error || "Profile not found"}</p>
        <button onClick={() => router.back()} className="mt-4 text-primary font-medium text-sm">
          &larr; Go Back
        </button>
      </div>
    );
  }

  const activePlan = child.memberships?.[0];
  const activeTrial = child.trialPasses?.[0];
  const age = child.dateOfBirth
    ? Math.floor((Date.now() - new Date(child.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      {/* Back Button */}
      <button onClick={() => router.back()} className="text-primary font-medium text-sm mb-4">
        &larr; Back
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500 overflow-hidden">
          {child.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={child.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            `${child.firstName[0]}${child.lastName[0]}`
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {child.firstName} {child.lastName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {child.relationship === "GUARDIAN" ? "Guardian" : "Parent"}
            </span>
            {age !== null && (
              <span className="text-xs text-gray-500">Age {age}</span>
            )}
          </div>
        </div>
      </div>

      {/* Membership Status */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Membership</p>
        {activePlan ? (
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">{activePlan.membershipPlan.name}</p>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
          </div>
        ) : activeTrial ? (
          <div>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-purple-900">Trial Pass</p>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                {activeTrial.classesUsed}/{activeTrial.maxClasses} classes
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Expires {new Date(activeTrial.expiresAt).toLocaleDateString()}
            </p>
          </div>
        ) : (
          <p className="text-gray-500">No active plan</p>
        )}
      </div>

      {/* Rank Info */}
      {child.rankInfo.length > 0 && (
        <div className="space-y-3 mb-4">
          {child.rankInfo.map((rs, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{rs.styleName}</p>
                {rs.nextRankName && (
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Next: {rs.nextRankName}</p>
                )}
              </div>
              <p className="font-semibold text-gray-900 text-lg">{rs.rankName}</p>
              {rs.allRanks.length > 1 && (
                <div className="flex items-center gap-0.5 mt-2">
                  {rs.allRanks.map((rn, ri) => {
                    const currentIdx = rs.allRanks.findIndex(
                      (r) => r.toLowerCase() === rs.rankName.toLowerCase()
                    );
                    return (
                      <div key={ri} className="flex-1">
                        <div
                          className={`h-2 rounded-full ${
                            ri === currentIdx
                              ? "bg-primary ring-2 ring-primary/30"
                              : ri < currentIdx
                                ? "bg-green-500"
                                : "bg-gray-200"
                          }`}
                          title={rn}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upcoming Bookings */}
      {child.bookings.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Upcoming Classes</h2>
          <div className="space-y-2">
            {child.bookings.map((b) => {
              const start = new Date(b.classSession.startsAt);
              return (
                <div key={b.id} className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                  <p className="font-semibold text-gray-900 text-sm">{b.classSession.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(b.bookingDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {" at "}
                    {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                  {b.status === "WAITLISTED" && (
                    <span className="text-xs text-amber-600 font-medium">Waitlisted</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Book a Class Button */}
      <Link
        href={`/portal/classes?forChild=${child.id}`}
        className="block w-full text-center py-3 bg-primary text-white rounded-2xl font-semibold mb-4"
      >
        Book a Class for {child.firstName}
      </Link>

      {/* Recent Attendance */}
      {child.attendances.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Recent Attendance</h2>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {child.attendances.slice(0, 10).map((att) => (
              <div key={att.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {att.classSession?.name || "Class"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(att.attendanceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
