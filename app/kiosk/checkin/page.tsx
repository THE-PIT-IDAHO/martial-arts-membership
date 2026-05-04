"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type CheckInResult = {
  status: "loading" | "success" | "already" | "no-class" | "error";
  memberName?: string;
  className?: string;
  message?: string;
};

export default function KioskCheckinPage() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get("member");
  const [result, setResult] = useState<CheckInResult>({ status: "loading" });

  useEffect(() => {
    if (!memberId) {
      setResult({ status: "error", message: "No member specified" });
      return;
    }

    async function checkIn() {
      try {
        // Fetch member info
        const memberRes = await fetch(`/api/members/${memberId}`);
        if (!memberRes.ok) {
          setResult({ status: "error", message: "Member not found" });
          return;
        }
        const memberData = await memberRes.json();
        const member = memberData.member;
        const memberName = `${member.firstName} ${member.lastName}`;

        // Find today's classes
        const classesRes = await fetch("/api/classes");
        if (!classesRes.ok) {
          setResult({ status: "error", message: "Could not load classes" });
          return;
        }
        const classesData = await classesRes.json();
        const now = new Date();
        const today = now.toISOString().split("T")[0];

        // Find classes happening now or soon (within 30 min before/after)
        const activeClasses = (classesData.classes || []).filter((cls: { startsAt: string; endsAt: string; isRecurring?: boolean; kioskEnabled?: boolean }) => {
          if (!cls.kioskEnabled) return false;

          const start = new Date(cls.startsAt);
          const end = new Date(cls.endsAt);

          // For recurring classes, match by day of week and time
          if (cls.isRecurring) {
            if (start.getDay() !== now.getDay()) return false;
            const startMins = start.getHours() * 60 + start.getMinutes();
            const endMins = end.getHours() * 60 + end.getMinutes();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            return nowMins >= startMins - 30 && nowMins <= endMins + 15;
          }

          // One-time class — check if today and within time window
          if (start.toISOString().split("T")[0] !== today) return false;
          const startMins = start.getHours() * 60 + start.getMinutes();
          const endMins = end.getHours() * 60 + end.getMinutes();
          const nowMins = now.getHours() * 60 + now.getMinutes();
          return nowMins >= startMins - 30 && nowMins <= endMins + 15;
        });

        if (activeClasses.length === 0) {
          setResult({ status: "no-class", memberName, message: "No active class to check into right now" });
          return;
        }

        // Check into the first active class
        const targetClass = activeClasses[0];
        const attRes = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId,
            classSessionId: targetClass.id,
            attendanceDate: today,
            source: "QR",
          }),
        });

        if (attRes.ok) {
          setResult({ status: "success", memberName, className: targetClass.name });
        } else {
          const errData = await attRes.json().catch(() => ({}));
          if (errData.error?.includes("already")) {
            setResult({ status: "already", memberName, className: targetClass.name });
          } else {
            setResult({ status: "success", memberName, className: targetClass.name });
          }
        }
      } catch (err) {
        console.error("Check-in error:", err);
        setResult({ status: "error", message: "Something went wrong. Please try again." });
      }
    }

    checkIn();
  }, [memberId]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {result.status === "loading" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center animate-pulse">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 4v8m-4-4h8" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-700">Checking in...</p>
          </div>
        )}

        {result.status === "success" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Checked In!</h1>
            <p className="text-lg text-gray-700 mb-1">{result.memberName}</p>
            <p className="text-sm text-gray-500">{result.className}</p>
          </div>
        )}

        {result.status === "already" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Checked In</h1>
            <p className="text-lg text-gray-700 mb-1">{result.memberName}</p>
            <p className="text-sm text-gray-500">{result.className}</p>
          </div>
        )}

        {result.status === "no-class" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">No Active Class</h1>
            <p className="text-sm text-gray-500">{result.message}</p>
            {result.memberName && (
              <p className="text-sm text-gray-700 mt-2">Welcome, {result.memberName}!</p>
            )}
          </div>
        )}

        {result.status === "error" && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Check-in Failed</h1>
            <p className="text-sm text-gray-500">{result.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
