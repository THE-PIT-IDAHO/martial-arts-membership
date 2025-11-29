"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

interface ClassSession {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  classType: string | null;
  styleId: string | null;
  styleIds: string | null;
  styleNames: string | null;
  styleName: string | null;
  minRankId: string | null;
  minRankName: string | null;
  isRecurring: boolean;
  frequencyNumber: number | null;
  frequencyUnit: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  isOngoing: boolean;
  color: string | null;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  classes: ClassSession[];
}

interface Style {
  id: string;
  name: string;
  ranks?: { id: string; name: string }[];
}

type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

const DAYS_OF_WEEK: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Helper function to determine if text should be white or black based on background color
function getTextColor(bgColor: string): string {
  // Convert hex to RGB
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance (https://www.w3.org/TR/WCAG20/#relativeluminancedef)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Use white text for dark backgrounds, black text for light backgrounds
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [allClasses, setAllClasses] = useState<ClassSession[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("month");

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalStep, setModalStep] = useState<"select" | "edit">("select");
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editOption, setEditOption] = useState<"single" | "range" | "future">("single");
  const [rangeStartDate, setRangeStartDate] = useState("");
  const [rangeEndDate, setRangeEndDate] = useState("");

  // Edit form states
  const [name, setName] = useState("");
  const [classType, setClassType] = useState("");
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([""]);
  const [minRankId, setMinRankId] = useState("");
  const [minRankIds, setMinRankIds] = useState<string[]>([""]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequencyNumber, setFrequencyNumber] = useState("1");
  const [frequencyUnit, setFrequencyUnit] = useState<"Day" | "Week" | "Month" | "Year">("Week");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [isOngoing, setIsOngoing] = useState(true);
  const [daySchedules, setDaySchedules] = useState<{
    day: DayOfWeek;
    times: { startTime: string; endTime: string }[];
  }[]>([
    { day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }
  ]);
  const [saving, setSaving] = useState(false);

  // Fetch all classes and styles
  useEffect(() => {
    async function fetchData() {
      try {
        const [classesRes, stylesRes] = await Promise.all([
          fetch("/api/classes"),
          fetch("/api/styles")
        ]);

        if (!classesRes.ok || !stylesRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const classesData = await classesRes.json();
        const stylesData = await stylesRes.json();

        setAllClasses(classesData.classes || []);
        setStyles(stylesData.styles || []);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Generate calendar days for the current month
  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay();
    const daysFromPrevMonth = firstDayOfWeek;
    const totalDays = 42;
    const daysInMonth = lastDay.getDate();
    const daysFromNextMonth = totalDays - daysFromPrevMonth - daysInMonth;

    const days: CalendarDay[] = [];

    // Add days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date,
        isCurrentMonth: false,
        classes: getClassesForDate(date),
      });
    }

    // Add days from current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({
        date,
        isCurrentMonth: true,
        classes: getClassesForDate(date),
      });
    }

    // Add days from next month
    for (let day = 1; day <= daysFromNextMonth; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        isCurrentMonth: false,
        classes: getClassesForDate(date),
      });
    }

    setCalendarDays(days);
  }, [currentDate, allClasses]);

  function getClassesForDate(date: Date): ClassSession[] {
    const dateStr = date.toISOString().split("T")[0];

    return allClasses.filter((classSession) => {
      const classStartsAt = new Date(classSession.startsAt);
      const classDate = classStartsAt.toISOString().split("T")[0];

      if (!classSession.isRecurring) {
        return classDate === dateStr;
      }

      // For recurring classes, check day of week first
      const classDayOfWeek = classStartsAt.getDay();
      const dateDayOfWeek = date.getDay();

      // If the day of week doesn't match, this class doesn't occur on this date
      if (classDayOfWeek !== dateDayOfWeek) {
        return false;
      }

      if (classSession.scheduleStartDate) {
        const scheduleStart = new Date(classSession.scheduleStartDate);
        scheduleStart.setHours(0, 0, 0, 0);

        const scheduleEnd = classSession.isOngoing || !classSession.scheduleEndDate
          ? new Date(2099, 11, 31)
          : new Date(classSession.scheduleEndDate);
        scheduleEnd.setHours(23, 59, 59, 999);

        const checkDate = new Date(date);
        checkDate.setHours(12, 0, 0, 0);

        if (checkDate < scheduleStart || checkDate > scheduleEnd) {
          return false;
        }

        // For weekly recurrence, check if the date falls on the correct week interval
        if (classSession.frequencyUnit === "Week") {
          const weeksDiff = Math.floor(
            (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24 * 7)
          );
          return weeksDiff % (classSession.frequencyNumber || 1) === 0;
        } else if (classSession.frequencyUnit === "Day") {
          const daysDiff = Math.floor(
            (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysDiff % (classSession.frequencyNumber || 1) === 0;
        }
      }

      return false;
    });
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function previousPeriod() {
    const newDate = new Date(currentDate);
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() - 1);
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  }

  function nextPeriod() {
    const newDate = new Date(currentDate);
    if (viewMode === "day") {
      newDate.setDate(newDate.getDate() + 1);
    } else if (viewMode === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function getWeekDays(date: Date): Date[] {
    const dayOfWeek = date.getDay();
    const sunday = new Date(date);
    sunday.setDate(date.getDate() - dayOfWeek);

    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      week.push(day);
    }
    return week;
  }

  function getDateRangeText(): string {
    if (viewMode === "day") {
      return currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else if (viewMode === "week") {
      const weekDays = getWeekDays(currentDate);
      const start = weekDays[0];
      const end = weekDays[6];
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    } else {
      return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
  }

  function handleClassClick(classSession: ClassSession, clickedDate: Date) {
    setSelectedClass(classSession);
    setSelectedDate(clickedDate);
    setEditOption("single");
    setRangeStartDate(clickedDate.toISOString().split("T")[0]);
    setRangeEndDate(clickedDate.toISOString().split("T")[0]);
    setModalStep("select");
    setShowEditModal(true);
  }

  function handleContinueToEdit() {
    if (!selectedClass) return;

    // Load class data into form
    setName(selectedClass.name);
    setClassType(selectedClass.classType || "");

    // Parse styleIds
    let styleIds: string[] = [];
    if (selectedClass.styleIds) {
      try {
        styleIds = JSON.parse(selectedClass.styleIds);
      } catch {
        styleIds = [];
      }
    } else if (selectedClass.styleId) {
      styleIds = [selectedClass.styleId];
    }
    setSelectedStyleIds(styleIds.length > 0 ? styleIds : [""]);

    setMinRankId(selectedClass.minRankId || "");
    const initialRankIds = styleIds.map(() => selectedClass.minRankId || "");
    setMinRankIds(initialRankIds.length > 0 ? initialRankIds : [""]);

    setIsRecurring(selectedClass.isRecurring || false);
    setFrequencyNumber(String(selectedClass.frequencyNumber || 1));
    setFrequencyUnit((selectedClass.frequencyUnit as "Day" | "Week" | "Month" | "Year") || "Week");

    if (selectedClass.scheduleStartDate) {
      const startDate = new Date(selectedClass.scheduleStartDate);
      setScheduleStartDate(startDate.toISOString().split('T')[0]);
    } else {
      setScheduleStartDate("");
    }

    if (selectedClass.scheduleEndDate) {
      const endDate = new Date(selectedClass.scheduleEndDate);
      setScheduleEndDate(endDate.toISOString().split('T')[0]);
      setIsOngoing(false);
    } else {
      setScheduleEndDate("");
      setIsOngoing(selectedClass.isOngoing !== false);
    }

    // Build day schedules
    const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const startDate = new Date(selectedClass.startsAt);
    const endDate = new Date(selectedClass.endsAt);
    const dayIndex = startDate.getDay();
    const dayName = dayMap[dayIndex] as DayOfWeek;

    const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
    const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

    setDaySchedules([{
      day: dayName,
      times: [{ startTime, endTime }]
    }]);

    setModalStep("edit");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClass) return;

    setSaving(true);

    try {
      // Handle different edit options
      if (editOption === "single") {
        // Create or update a single instance
        // For now, we'll just update the class time for this specific date
        // You would need to implement exception handling in your backend
        alert("Editing single instance - implementation needed");
      } else if (editOption === "range") {
        // Update classes within the range
        alert("Editing date range - implementation needed");
      } else if (editOption === "future") {
        // Update all future occurrences
        // This would update the recurring class settings
        const response = await fetch(`/api/classes/${selectedClass.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            classType,
            // Add other fields as needed
          }),
        });

        if (!response.ok) throw new Error("Failed to update class");
      }

      // Refresh classes
      const res = await fetch("/api/classes");
      const data = await res.json();
      setAllClasses(data.classes || []);

      handleCloseModal();
    } catch (error) {
      console.error("Error saving class:", error);
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  function handleCloseModal() {
    setShowEditModal(false);
    setModalStep("select");
    setSelectedClass(null);
    setSelectedDate(null);
    setEditOption("single");
    setRangeStartDate("");
    setRangeEndDate("");

    // Reset form
    setName("");
    setClassType("");
    setSelectedStyleIds([""]);
    setMinRankId("");
    setMinRankIds([""]);
    setIsRecurring(false);
    setFrequencyNumber("1");
    setFrequencyUnit("Week");
    setScheduleStartDate("");
    setScheduleEndDate("");
    setIsOngoing(true);
    setDaySchedules([{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Calendar</h1>
          <div className="text-sm text-gray-600">Loading classes...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Calendar</h1>

        {/* Calendar Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={previousPeriod}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={goToToday}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={nextPeriod}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </button>

            <div className="ml-4 flex items-center gap-1 rounded-md border border-gray-300 bg-white p-0.5">
              <button
                onClick={() => setViewMode("day")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  viewMode === "day"
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  viewMode === "week"
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  viewMode === "month"
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Month
              </button>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {getDateRangeText()}
          </h2>
        </div>

        {/* Calendar Grid */}
        {viewMode === "day" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="p-4">
              <div className="space-y-2">
                {getClassesForDate(currentDate).length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    No classes scheduled for this day
                  </div>
                ) : (
                  getClassesForDate(currentDate).map((classSession) => {
                    const startTime = new Date(classSession.startsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    });
                    const endTime = new Date(classSession.endsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    });

                    const bgColor = classSession.color || "#a3a3a3";
                    const textColor = getTextColor(bgColor);

                    return (
                      <button
                        key={classSession.id}
                        onClick={() => handleClassClick(classSession, currentDate)}
                        className="w-full rounded-lg border border-gray-200 p-4 text-left transition-opacity hover:opacity-90"
                        style={{ backgroundColor: bgColor, color: textColor }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold">
                              {classSession.name}
                            </div>
                            <div className="text-xs opacity-80">{classSession.classType}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{startTime} - {endTime}</div>
                            {classSession.styleNames && (
                              <div className="text-xs opacity-80">{classSession.styleNames}</div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === "week" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-100">
              {getWeekDays(currentDate).map((date, index) => {
                const isToday = date.toISOString().split("T")[0] === today.toISOString().split("T")[0];
                return (
                  <div
                    key={index}
                    className="border-r border-gray-300 px-2 py-2 text-center last:border-r-0"
                  >
                    <div className="text-xs font-semibold text-gray-700">{dayNames[date.getDay()]}</div>
                    <div className={`text-sm font-medium ${isToday ? "text-primary font-bold" : "text-gray-900"}`}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-7">
              {getWeekDays(currentDate).map((date, index) => {
                const classes = getClassesForDate(date);
                const isToday = date.toISOString().split("T")[0] === today.toISOString().split("T")[0];

                return (
                  <div
                    key={index}
                    className={`min-h-[200px] p-2 ${
                      isToday
                        ? "border-[4px] border-primary"
                        : "border-r border-gray-300 last:border-r-0"
                    } bg-white`}
                  >
                    <div className="space-y-1">
                      {classes.map((classSession) => {
                        const startTime = new Date(classSession.startsAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });

                        const bgColor = classSession.color || "#a3a3a3";
                        const textColor = getTextColor(bgColor);

                        return (
                          <button
                            key={classSession.id}
                            onClick={() => handleClassClick(classSession, date)}
                            className="w-full rounded px-2 py-1 text-left text-xs transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor }}
                          >
                            <div className="font-medium">{startTime}</div>
                            <div className="truncate">{classSession.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "month" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-100">
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="border-r border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day, index) => {
                const isToday = day.date.toISOString().split("T")[0] === today.toISOString().split("T")[0];

                return (
                  <div
                    key={index}
                    className={`min-h-[100px] p-1 ${
                      isToday
                        ? "border-[4px] border-primary"
                        : "border-b border-r border-gray-300 last:border-r-0"
                    } ${
                      day.isCurrentMonth ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <div
                      className={`mb-1 text-xs font-medium ${
                        day.isCurrentMonth ? "text-gray-900" : "text-gray-400"
                      } ${isToday ? "text-primary font-bold" : ""}`}
                    >
                      {day.date.getDate()}
                    </div>

                    <div className="space-y-0.5">
                      {day.classes.map((classSession) => {
                        const startTime = new Date(classSession.startsAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });

                        const bgColor = classSession.color || "#a3a3a3";
                        const textColor = getTextColor(bgColor);

                        return (
                          <button
                            key={classSession.id}
                            onClick={() => handleClassClick(classSession, day.date)}
                            className="w-full rounded px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor }}
                            title={`${classSession.name}\n${startTime}${classSession.isRecurring ? "\n(Recurring)" : ""}`}
                          >
                            <div className="truncate font-medium">{startTime}</div>
                            <div className="truncate">{classSession.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* Edit Modal */}
        {showEditModal && selectedClass && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              {modalStep === "select" ? (
                <>
                  <h2 className="mb-4 text-lg font-bold text-gray-900">
                    Edit Class: {selectedClass.name}
                  </h2>

                  <div className="mb-4 text-xs text-gray-600">
                    {selectedDate && (
                      <div>
                        Selected Date: {selectedDate.toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                    )}
                    {selectedClass.isRecurring && (
                      <div className="mt-1 text-red-600">
                        This is a recurring class
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Single Class Option */}
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-gray-300 p-3 hover:bg-gray-50">
                      <input
                        type="radio"
                        name="editOption"
                        value="single"
                        checked={editOption === "single"}
                        onChange={() => setEditOption("single")}
                        className="mt-0.5 h-4 w-4 text-red-500 focus:ring-2 focus:ring-red-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          Edit this class only
                        </div>
                        <div className="text-[10px] text-gray-600">
                          Changes will only apply to the selected date
                        </div>
                      </div>
                    </label>

                    {/* Date Range Option */}
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-gray-300 p-3 hover:bg-gray-50">
                      <input
                        type="radio"
                        name="editOption"
                        value="range"
                        checked={editOption === "range"}
                        onChange={() => setEditOption("range")}
                        className="mt-0.5 h-4 w-4 text-red-500 focus:ring-2 focus:ring-red-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          Edit date range
                        </div>
                        <div className="text-[10px] text-gray-600">
                          Choose specific start and end dates
                        </div>
                        {editOption === "range" && (
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="block text-[10px] font-medium text-gray-700">
                                From Date
                              </label>
                              <input
                                type="date"
                                value={rangeStartDate}
                                onChange={(e) => setRangeStartDate(e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-gray-700">
                                To Date
                              </label>
                              <input
                                type="date"
                                value={rangeEndDate}
                                onChange={(e) => setRangeEndDate(e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </label>

                    {/* All Future Classes Option */}
                    {selectedClass.isRecurring && (
                      <label className="flex cursor-pointer items-start gap-2 rounded border border-gray-300 p-3 hover:bg-gray-50">
                        <input
                          type="radio"
                          name="editOption"
                          value="future"
                          checked={editOption === "future"}
                          onChange={() => setEditOption("future")}
                          className="mt-0.5 h-4 w-4 text-red-500 focus:ring-2 focus:ring-red-500"
                        />
                        <div className="flex-1">
                          <div className="text-xs font-semibold text-gray-900">
                            Edit all future classes
                          </div>
                          <div className="text-[10px] text-gray-600">
                            Changes will apply to this class and all future occurrences
                          </div>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Modal Actions */}
                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={handleCloseModal}
                      className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleContinueToEdit}
                      className="flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primaryDark"
                    >
                      Continue to Edit
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">
                      Edit Class
                    </h2>
                    <div className="text-xs text-gray-600">
                      {editOption === "single" && "Editing: Single class"}
                      {editOption === "range" && `Editing: ${rangeStartDate} to ${rangeEndDate}`}
                      {editOption === "future" && "Editing: All future classes"}
                    </div>
                  </div>

                  <form onSubmit={handleSaveEdit} className="space-y-4">
                    <div className="grid gap-2 grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Class Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Class Type
                        </label>
                        <input
                          type="text"
                          value={classType}
                          onChange={(e) => setClassType(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                    </div>

                    {/* Styles Selection */}
                    <div>
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <label className="text-xs font-medium text-gray-700">
                          Allowed Styles
                        </label>
                        <label className="text-xs font-medium text-gray-700">
                          Minimum Rank Required
                        </label>
                      </div>
                      <div className="space-y-2">
                        {selectedStyleIds.map((styleId, index) => (
                          <div key={index} className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={styleId}
                                onChange={(e) => {
                                  const newIds = [...selectedStyleIds];
                                  newIds[index] = e.target.value;
                                  setSelectedStyleIds(newIds);
                                  const newRankIds = [...minRankIds];
                                  newRankIds[index] = "";
                                  setMinRankIds(newRankIds);
                                  if (index === 0) setMinRankId("");
                                }}
                                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                              >
                                <option value="">Select Style</option>
                                <option value="NO_STYLE">No Style</option>
                                {styles.map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>

                              <div className="w-4 flex items-center justify-center">
                                {index === 0 && selectedStyleIds.length < 5 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedStyleIds([...selectedStyleIds, ""]);
                                      setMinRankIds([...minRankIds, ""]);
                                    }}
                                    className="text-base font-bold leading-none text-red-500 hover:text-red-600"
                                  >
                                    +
                                  </button>
                                )}

                                {index > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedStyleIds(selectedStyleIds.filter((_, i) => i !== index));
                                      setMinRankIds(minRankIds.filter((_, i) => i !== index));
                                    }}
                                    className="text-[10px] font-black leading-none text-red-500 hover:text-red-600"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>

                            <div>
                              <select
                                value={minRankIds[index] || ""}
                                onChange={(e) => {
                                  const newRankIds = [...minRankIds];
                                  newRankIds[index] = e.target.value;
                                  setMinRankIds(newRankIds);
                                  if (index === 0) setMinRankId(e.target.value);
                                }}
                                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                                disabled={!selectedStyleIds[index] || selectedStyleIds[index] === "NO_STYLE"}
                              >
                                <option value="">No Rank Requirement</option>
                                {selectedStyleIds[index] && styles.find(s => s.id === selectedStyleIds[index])?.ranks?.map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Day Schedules */}
                    <div>
                      <label className="mb-2 block text-xs font-medium text-gray-700">
                        Class Schedule <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        {daySchedules.map((schedule, scheduleIndex) => (
                          <div key={scheduleIndex} className="space-y-2">
                            {schedule.times.map((time, timeIndex) => (
                              <div key={timeIndex} className="flex items-center gap-2">
                                {timeIndex === 0 ? (
                                  <select
                                    value={schedule.day}
                                    onChange={(e) => {
                                      const newSchedules = [...daySchedules];
                                      newSchedules[scheduleIndex].day = e.target.value as DayOfWeek;
                                      setDaySchedules(newSchedules);
                                    }}
                                    style={{ width: '139px' }}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                                  >
                                    {DAYS_OF_WEEK.map(day => (
                                      <option key={day} value={day}>{day}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div style={{ width: '139px' }}></div>
                                )}

                                <input
                                  type="time"
                                  value={time.startTime}
                                  onChange={(e) => {
                                    const newSchedules = [...daySchedules];
                                    newSchedules[scheduleIndex].times[timeIndex].startTime = e.target.value;
                                    setDaySchedules(newSchedules);
                                  }}
                                  style={{ width: '139px' }}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                                  required
                                />

                                <span className="text-xs text-gray-500">to</span>

                                <input
                                  type="time"
                                  value={time.endTime}
                                  onChange={(e) => {
                                    const newSchedules = [...daySchedules];
                                    newSchedules[scheduleIndex].times[timeIndex].endTime = e.target.value;
                                    setDaySchedules(newSchedules);
                                  }}
                                  style={{ width: '139px' }}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                                  required
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => setModalStep("select")}
                        className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primaryDark disabled:bg-gray-300"
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
