"use client";

import { useEffect, useState } from "react";

interface AttendanceRecord {
  id: string;
  attendanceDate: string;
  checkedInAt: string;
  source: string;
  classSession?: {
    name: string;
    styleName?: string;
  };
}

export default function PortalAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [monthCount, setMonthCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/attendance?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records || []);
        setMonthCount(data.monthCount || 0);
        setTotalCount(data.totalCount || 0);
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

  // Group by month
  const grouped: Record<string, AttendanceRecord[]> = {};
  for (const r of records) {
    const d = new Date(r.attendanceDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Attendance</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm text-center">
          <p className="text-3xl font-bold text-gray-900">{monthCount}</p>
          <p className="text-xs text-gray-500 mt-1">This Month</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm text-center">
          <p className="text-3xl font-bold text-gray-900">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-1">All Time</p>
        </div>
      </div>

      {/* Records by Month */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500">
          No attendance records yet.
        </div>
      ) : (
        Object.entries(grouped).map(([monthKey, recs]) => {
          const [year, month] = monthKey.split("-");
          const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
          return (
            <div key={monthKey} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-700">{label}</h2>
                <span className="text-xs text-gray-400">{recs.length} classes</span>
              </div>
              <div className="space-y-1.5">
                {recs.map((r) => {
                  const d = new Date(r.attendanceDate);
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {r.classSession?.name || "Open Training"}
                        </p>
                        {r.classSession?.styleName && (
                          <p className="text-xs text-gray-400">{r.classSession.styleName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">
                          {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(r.checkedInAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
