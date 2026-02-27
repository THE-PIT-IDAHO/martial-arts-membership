"use client";

import { useEffect, useState, useCallback } from "react";

interface ClassInfo {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  style: string | null;
  coach: string | null;
  maxCapacity: number | null;
  bookingEnabled: boolean;
  confirmedCount: number;
  spotsLeft: number | null;
  isFull: boolean;
  bookingAdvanceDays: number | null;
  minRankName: string | null;
  memberBooking: { status: string; id: string } | null;
}

// Local date string (YYYY-MM-DD) — avoids UTC shift from toISOString()
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PortalClassesPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateStr(new Date()));
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  const loadClasses = useCallback((date: string) => {
    setLoading(true);
    fetch(`/api/portal/classes?date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setClasses(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadClasses(selectedDate);
  }, [selectedDate, loadClasses]);

  // Week view: 7 day buttons
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  // Month view: calendar grid state
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Build calendar grid cells for the displayed month
  function getCalendarGrid(year: number, month: number) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();

    const cells: (Date | null)[] = [];
    // Leading blanks
    for (let i = 0; i < startDow; i++) cells.push(null);
    // Days of month
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    // Trailing blanks to fill last week
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  const calendarCells = getCalendarGrid(calendarMonth.year, calendarMonth.month);
  const todayStr = toLocalDateStr(new Date());

  function prevMonth() {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function nextMonth() {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const monthLabel = new Date(calendarMonth.year, calendarMonth.month, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  async function handleBook(classId: string) {
    setBookingId(classId);
    setActionLoading(true);
    try {
      const res = await fetch("/api/portal/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classSessionId: classId, bookingDate: selectedDate }),
      });
      if (res.ok) {
        loadClasses(selectedDate);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to book");
      }
    } catch {
      alert("Connection error");
    } finally {
      setActionLoading(false);
      setBookingId(null);
    }
  }

  async function handleCancel(bookingIdToCancel: string, classId: string) {
    setBookingId(classId);
    setActionLoading(true);
    try {
      const res = await fetch(`/api/portal/bookings/${bookingIdToCancel}`, { method: "DELETE" });
      if (res.ok) {
        loadClasses(selectedDate);
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(false);
      setBookingId(null);
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Class Schedule</h1>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              viewMode === "week" ? "bg-primary text-white" : "text-gray-600"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode("month")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              viewMode === "month" ? "bg-primary text-white" : "text-gray-600"
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Date Selector */}
      {viewMode === "week" ? (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 scrollbar-hide">
          {weekDates.map((d) => {
            const dateStr = toLocalDateStr(d);
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl min-w-[56px] transition-colors ${
                  isSelected
                    ? "bg-primary text-white"
                    : "bg-white border border-gray-200 text-gray-700"
                }`}
              >
                <span className="text-[10px] uppercase font-medium">
                  {isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="text-lg font-bold">{d.getDate()}</span>
                <span className="text-[10px]">{d.toLocaleDateString("en-US", { month: "short" })}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          {/* Month header with nav */}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-1 text-gray-500 hover:text-gray-800">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
            <button onClick={nextMonth} className="p-1 text-gray-500 hover:text-gray-800">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 text-center mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[10px] font-semibold text-gray-400 uppercase">{d}</span>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, i) => {
              if (!cell) return <div key={`blank-${i}`} />;
              const dateStr = toLocalDateStr(cell);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const isPast = dateStr < todayStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-primary text-white"
                      : isToday
                        ? "bg-red-50 text-primary font-bold"
                        : isPast
                          ? "text-gray-300"
                          : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {cell.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Classes */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No classes available on this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => {
            const start = new Date(cls.startsAt);
            const end = new Date(cls.endsAt);
            const isBooked = cls.memberBooking?.status === "CONFIRMED";
            const isWaitlisted = cls.memberBooking?.status === "WAITLISTED";
            const isActioning = actionLoading && bookingId === cls.id;
            const isPastDate = selectedDate < todayStr;

            // Check if booking is beyond advance limit
            let beyondAdvanceLimit = false;
            if (cls.bookingAdvanceDays && !isBooked && !isWaitlisted) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const selDate = new Date(selectedDate + "T00:00:00");
              const diffDays = Math.round((selDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              beyondAdvanceLimit = diffDays > cls.bookingAdvanceDays;
            }

            let styleDisplay = "";
            if (cls.style) {
              try {
                const arr = JSON.parse(cls.style);
                styleDisplay = Array.isArray(arr) ? arr.join(", ") : cls.style;
              } catch {
                styleDisplay = cls.style;
              }
            }

            return (
              <div key={cls.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${
                isBooked ? "border-green-300 bg-green-50/30" : isWaitlisted ? "border-yellow-300 bg-yellow-50/30" : "border-gray-200"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{cls.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      {" — "}
                      {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    {styleDisplay && <p className="text-xs text-gray-400 mt-0.5">{styleDisplay}</p>}
                    {cls.coach && <p className="text-xs text-gray-400">Coach: {cls.coach}</p>}
                    {cls.minRankName && <p className="text-xs text-gray-400">Min rank: {cls.minRankName}</p>}
                  </div>

                  <div className="text-right flex flex-col items-end gap-1.5">
                    {cls.maxCapacity && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        cls.isFull ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"
                      }`}>
                        {cls.isFull ? "Full" : `${cls.spotsLeft} spots`}
                      </span>
                    )}
                    {isBooked && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        Booked
                      </span>
                    )}
                    {isWaitlisted && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        Waitlisted
                      </span>
                    )}
                  </div>
                </div>

                {!isPastDate && <div className="mt-3">
                  {isBooked ? (
                    <button
                      onClick={() => handleCancel(cls.memberBooking!.id, cls.id)}
                      disabled={isActioning}
                      className="w-full py-2.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 bg-white text-gray-700 border border-gray-300"
                    >
                      {isActioning ? "..." : "Cancel Class"}
                    </button>
                  ) : isWaitlisted ? (
                    <button
                      onClick={() => handleCancel(cls.memberBooking!.id, cls.id)}
                      disabled={isActioning}
                      className="w-full py-2.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 bg-white text-yellow-700 border border-yellow-200"
                    >
                      {isActioning ? "..." : "Leave Waitlist"}
                    </button>
                  ) : beyondAdvanceLimit ? (
                    <p className="text-center text-xs text-gray-400 py-2">
                      Booking opens {cls.bookingAdvanceDays} day{cls.bookingAdvanceDays === 1 ? "" : "s"} before class
                    </p>
                  ) : !cls.bookingEnabled ? (
                    null
                  ) : (
                    <button
                      onClick={() => handleBook(cls.id)}
                      disabled={isActioning}
                      className={`w-full py-2.5 rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 ${
                        cls.isFull
                          ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                          : "bg-primary text-white"
                      }`}
                    >
                      {isActioning ? "..." : cls.isFull ? "Join Waitlist" : "Book Class"}
                    </button>
                  )}
                </div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
