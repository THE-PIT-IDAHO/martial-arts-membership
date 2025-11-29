"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type Rank = {
  id: string;
  name: string;
  order: number;
  styleId: string;
};

type Style = {
  id: string;
  name: string;
  shortName: string | null;
  ranks?: Rank[];
};

type ClassSession = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  classType: string | null;
  styleId: string | null;
  styleIds?: string | null;
  styleName?: string | null;
  minRankId?: string | null;
  minRankName?: string | null;
  isRecurring?: boolean;
  frequencyNumber?: number | null;
  frequencyUnit?: string | null;
  scheduleStartDate?: string | null;
  scheduleEndDate?: string | null;
  isOngoing?: boolean;
  color?: string | null;
};

type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

const DAYS_OF_WEEK: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingClasses, setEditingClasses] = useState<ClassSession[]>([]);

  // Form fields
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
  const [color, setColor] = useState("#a3a3a3");
  const [daySchedules, setDaySchedules] = useState<{
    day: DayOfWeek;
    times: { startTime: string; endTime: string }[];
  }[]>([
    { day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }
  ]);
  const [saving, setSaving] = useState(false);

  // Get ranks for first selected style (for backward compatibility)
  const selectedStyle = styles.find(s => s.id === selectedStyleIds[0]);
  const availableRanks = selectedStyle?.ranks || [];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const [classesRes, stylesRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/styles"),
      ]);

      if (!classesRes.ok || !stylesRes.ok) {
        throw new Error("Failed to load data");
      }

      const classesData = await classesRes.json();
      const stylesData = await stylesRes.json();

      setClasses(classesData.classes || []);
      setStyles(stylesData.styles || []);
    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
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
    setColor("#a3a3a3");
    setDaySchedules([{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
    setEditingClasses([]);
    setShowForm(false);
  }

  function handleEdit(classSession: ClassSession) {
    // Find all classes with the same name, type, styles, and rank
    const relatedClasses = classes.filter(c =>
      c.name === classSession.name &&
      c.classType === classSession.classType &&
      c.styleIds === classSession.styleIds &&
      c.styleId === classSession.styleId &&
      c.minRankId === classSession.minRankId
    );

    setEditingClasses(relatedClasses);
    setName(classSession.name);
    setClassType(classSession.classType || "");

    // Parse styleIds from JSON or use legacy styleId
    let styleIds: string[] = [];
    if (classSession.styleIds) {
      try {
        styleIds = JSON.parse(classSession.styleIds);
      } catch {
        styleIds = [];
      }
    } else if (classSession.styleId) {
      styleIds = [classSession.styleId];
    }
    setSelectedStyleIds(styleIds.length > 0 ? styleIds : [""]);

    setMinRankId(classSession.minRankId || "");

    // For now, set minRankIds to have the same rank for all styles
    // TODO: Support different ranks per style when we store that data
    const initialRankIds = styleIds.map(() => classSession.minRankId || "");
    setMinRankIds(initialRankIds.length > 0 ? initialRankIds : [""]);

    // Set recurring schedule fields
    setIsRecurring(classSession.isRecurring || false);
    setFrequencyNumber(String(classSession.frequencyNumber || 1));
    setFrequencyUnit((classSession.frequencyUnit as "Day" | "Week" | "Month" | "Year") || "Week");

    // Set schedule date fields
    if (classSession.scheduleStartDate) {
      const startDate = new Date(classSession.scheduleStartDate);
      setScheduleStartDate(startDate.toISOString().split('T')[0]);
    } else {
      setScheduleStartDate("");
    }

    if (classSession.scheduleEndDate) {
      const endDate = new Date(classSession.scheduleEndDate);
      setScheduleEndDate(endDate.toISOString().split('T')[0]);
      setIsOngoing(false);
    } else {
      setScheduleEndDate("");
      setIsOngoing(classSession.isOngoing !== false);
    }

    // Set color
    setColor(classSession.color || "#a3a3a3");

    // Build day schedules from all related classes
    const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const schedulesByDay = new Map<DayOfWeek, { startTime: string; endTime: string }[]>();

    relatedClasses.forEach(c => {
      const startDate = new Date(c.startsAt);
      const endDate = new Date(c.endsAt);
      const dayIndex = startDate.getDay();
      const day = dayMap[dayIndex] as DayOfWeek;
      const timeSlot = {
        startTime: startDate.toTimeString().slice(0, 5),
        endTime: endDate.toTimeString().slice(0, 5)
      };

      if (!schedulesByDay.has(day)) {
        schedulesByDay.set(day, []);
      }
      schedulesByDay.get(day)!.push(timeSlot);
    });

    // Convert to array format
    const daySchedules = Array.from(schedulesByDay.entries()).map(([day, times]) => ({
      day,
      times
    }));

    setDaySchedules(daySchedules.length > 0 ? daySchedules : [{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError("Class name is required");
      return;
    }

    if (daySchedules.length === 0) {
      setError("Please add at least one day");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Get style names for selected styles (filter out empty selections)
      const validStyleIds = selectedStyleIds.filter(id => id !== "");
      const selectedStyleNames = validStyleIds
        .map(id => styles.find(s => s.id === id)?.name)
        .filter((name): name is string => !!name);

      const styleIdsJson = validStyleIds.length > 0 ? JSON.stringify(validStyleIds) : null;
      const styleNamesJson = selectedStyleNames.length > 0 ? JSON.stringify(selectedStyleNames) : null;

      // Legacy single style for backward compatibility
      const styleId = validStyleIds[0] || null;
      const styleName = selectedStyleNames[0] || null;

      const selectedRank = minRankId ? availableRanks.find(r => r.id === minRankId) : null;
      const minRankName = selectedRank ? selectedRank.name : null;

      if (editingClasses.length > 0) {
        // Delete all old instances of the class
        for (const oldClass of editingClasses) {
          const res = await fetch(`/api/classes/${oldClass.id}`, {
            method: "DELETE",
          });
          // Only throw error if it's not a 404 (class already deleted is ok)
          if (!res.ok && res.status !== 404) {
            throw new Error(`Failed to delete old class instance`);
          }
        }

        // Create new instances with updated data
        const newClasses: ClassSession[] = [];
        const now = new Date();
        const currentDayIndex = now.getDay();

        for (const schedule of daySchedules) {
          const dayIndex = DAYS_OF_WEEK.indexOf(schedule.day);
          let daysUntilClass = (dayIndex + 1 - currentDayIndex + 7) % 7;
          if (daysUntilClass === 0) daysUntilClass = 7;

          const classDate = new Date(now);
          classDate.setDate(classDate.getDate() + daysUntilClass);

          for (const time of schedule.times) {
            const [startHour, startMin] = time.startTime.split(":").map(Number);
            const startsAt = new Date(classDate);
            startsAt.setHours(startHour, startMin, 0, 0);

            const [endHour, endMin] = time.endTime.split(":").map(Number);
            const endsAt = new Date(classDate);
            endsAt.setHours(endHour, endMin, 0, 0);

            const res = await fetch("/api/classes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                classType: classType.trim() || null,
                styleIds: styleIdsJson,
                styleNames: styleNamesJson,
                styleId: styleId,
                styleName: styleName,
                minRankId: minRankId || null,
                minRankName: minRankName,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                isRecurring: isRecurring,
                frequencyNumber: parseInt(frequencyNumber) || 1,
                frequencyUnit: frequencyUnit,
                scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate).toISOString() : null,
                scheduleEndDate: isOngoing || !scheduleEndDate ? null : new Date(scheduleEndDate).toISOString(),
                isOngoing: isOngoing,
                color: color,
              }),
            });

            if (!res.ok) {
              throw new Error(`Failed to create class for ${schedule.day} at ${time.startTime}`);
            }

            const data = await res.json();
            newClasses.push(data.class);
          }
        }

        // Remove old classes and add new ones
        const oldClassIds = new Set(editingClasses.map(c => c.id));
        setClasses([...classes.filter(c => !oldClassIds.has(c.id)), ...newClasses]);
      } else {
        // Create new class(es) - one for each day/time combination
        const newClasses: ClassSession[] = [];
        const now = new Date();
        const currentDayIndex = now.getDay();

        for (const schedule of daySchedules) {
          const dayIndex = DAYS_OF_WEEK.indexOf(schedule.day);
          let daysUntilClass = (dayIndex + 1 - currentDayIndex + 7) % 7;
          if (daysUntilClass === 0) daysUntilClass = 7;

          const classDate = new Date(now);
          classDate.setDate(classDate.getDate() + daysUntilClass);

          for (const time of schedule.times) {
            const [startHour, startMin] = time.startTime.split(":").map(Number);
            const startsAt = new Date(classDate);
            startsAt.setHours(startHour, startMin, 0, 0);

            const [endHour, endMin] = time.endTime.split(":").map(Number);
            const endsAt = new Date(classDate);
            endsAt.setHours(endHour, endMin, 0, 0);

            const res = await fetch("/api/classes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                classType: classType.trim() || null,
                styleIds: styleIdsJson,
                styleNames: styleNamesJson,
                styleId: styleId,
                styleName: styleName,
                minRankId: minRankId || null,
                minRankName: minRankName,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                isRecurring: isRecurring,
                frequencyNumber: parseInt(frequencyNumber) || 1,
                frequencyUnit: frequencyUnit,
                scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate).toISOString() : null,
                scheduleEndDate: isOngoing || !scheduleEndDate ? null : new Date(scheduleEndDate).toISOString(),
                isOngoing: isOngoing,
                color: color,
              }),
            });

            if (!res.ok) {
              throw new Error(`Failed to create class for ${schedule.day} at ${time.startTime}`);
            }

            const data = await res.json();
            newClasses.push(data.class);
          }
        }

        setClasses([...classes, ...newClasses]);
      }

      resetForm();
    } catch (err: any) {
      console.error("Error saving class:", err);
      setError(err.message || "Failed to save class");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/classes/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete class");
      }

      setClasses(classes.filter(c => c.id !== id));
    } catch (err: any) {
      console.error("Error deleting class:", err);
      setError(err.message || "Failed to delete class");
    }
  }

  // Group classes by day of week
  const classesByDay = DAYS_OF_WEEK.reduce((acc, day) => {
    acc[day] = classes.filter(c => {
      const date = new Date(c.startsAt);
      const dayIndex = date.getDay();
      const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return dayMap[dayIndex] === day;
    }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return acc;
  }, {} as Record<DayOfWeek, ClassSession[]>);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Classes & Schedule</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage weekly class schedules and special events
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Create Class
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Loading classes...
          </div>
        )}

        {/* Create/Edit Form */}
        {showForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                {editingClasses.length > 0 ? "Edit Class" : "Create New Class"}
              </h2>
              <button
                onClick={resetForm}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2 grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Class Name <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Kempo Kids"
                      required
                    />
                    <div className="w-4"></div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Class Type
                  </label>
                  <input
                    type="text"
                    value={classType}
                    onChange={(e) => setClassType(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Sparring, Weapons, Forms"
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
                            // Reset rank for this style when it changes
                            const newRankIds = [...minRankIds];
                            newRankIds[index] = "";
                            setMinRankIds(newRankIds);
                            if (index === 0) setMinRankId(""); // Keep for backward compatibility
                          }}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                              aria-label="Add style"
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
                              aria-label="Remove style"
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
                            if (index === 0) setMinRankId(e.target.value); // Keep for backward compatibility
                          }}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-gray-700">
                    Class Schedule <span className="text-red-500">*</span>
                  </label>
                  <label className="block text-xs font-medium text-gray-700">
                    Calendar Color
                  </label>
                </div>
                <div className="space-y-2">
                  {daySchedules.map((schedule, scheduleIndex) => (
                    <div key={scheduleIndex} className="space-y-2">
                      {schedule.times.map((time, timeIndex) => (
                        <div key={timeIndex} className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                          {/* Day selector (only show for first time slot) */}
                          {timeIndex === 0 ? (
                            <select
                              value={schedule.day}
                              onChange={(e) => {
                                const selectedValue = e.target.value;
                                if (selectedValue === "REMOVE") {
                                  // Remove this day schedule
                                  const newSchedules = daySchedules.filter((_, i) => i !== scheduleIndex);
                                  setDaySchedules(newSchedules.length > 0 ? newSchedules : [{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
                                } else {
                                  const newSchedules = [...daySchedules];
                                  newSchedules[scheduleIndex].day = selectedValue as DayOfWeek;
                                  setDaySchedules(newSchedules);
                                }
                              }}
                              style={{ width: '139px' }}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              {DAYS_OF_WEEK.map(day => (
                                <option key={day} value={day}>{day}</option>
                              ))}
                              <option value="REMOVE" className="text-red-600">Remove Day</option>
                            </select>
                          ) : (
                            <div style={{ width: '139px' }}></div>
                          )}

                          {/* Start time */}
                          <input
                            type="time"
                            value={time.startTime}
                            onChange={(e) => {
                              const newStartTime = e.target.value;
                              const newSchedules = [...daySchedules];
                              newSchedules[scheduleIndex].times[timeIndex].startTime = newStartTime;

                              // Auto-adjust end time to 1 hour after start time
                              if (newStartTime) {
                                const [hours, minutes] = newStartTime.split(':').map(Number);
                                const newEndHour = (hours + 1) % 24;
                                const newEndTime = `${String(newEndHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                                newSchedules[scheduleIndex].times[timeIndex].endTime = newEndTime;
                              }

                              setDaySchedules(newSchedules);
                            }}
                            style={{ width: '139px' }}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                          />

                          <span className="text-xs text-gray-500">to</span>

                          {/* End time */}
                          <input
                            type="time"
                            value={time.endTime}
                            onChange={(e) => {
                              const newSchedules = [...daySchedules];
                              newSchedules[scheduleIndex].times[timeIndex].endTime = e.target.value;
                              setDaySchedules(newSchedules);
                            }}
                            style={{ width: '139px' }}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                          />

                          {/* Add Time + button (only show on first time slot, max 5 times per day) */}
                          {timeIndex === 0 && schedule.times.length < 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newSchedules = [...daySchedules];
                                newSchedules[scheduleIndex].times.push({ startTime: "09:00", endTime: "10:00" });
                                setDaySchedules(newSchedules);
                              }}
                              className="text-base font-bold leading-none text-red-500 hover:text-red-600"
                              aria-label="Add time slot"
                            >
                              +
                            </button>
                          )}

                          {/* Remove time ✕ button (only show on additional time slots) */}
                          {timeIndex > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newSchedules = [...daySchedules];
                                newSchedules[scheduleIndex].times = newSchedules[scheduleIndex].times.filter((_, i) => i !== timeIndex);
                                setDaySchedules(newSchedules);
                              }}
                              className="text-[10px] font-black leading-none text-red-500 hover:text-red-600"
                              aria-label="Remove time slot"
                            >
                              ✕
                            </button>
                          )}
                          </div>

                          {/* Calendar Color - only show for first schedule row */}
                          <div>
                            {scheduleIndex === 0 && timeIndex === 0 && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={color}
                                  onChange={(e) => setColor(e.target.value)}
                                  className="h-8 w-16 cursor-pointer rounded border border-gray-300"
                                />
                                <input
                                  type="text"
                                  value={color}
                                  onChange={(e) => setColor(e.target.value)}
                                  style={{ width: '75px' }}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary"
                                  placeholder="#a3a3a3"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Schedule Dates and Recurring */}
              <div className="flex items-center gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={scheduleStartDate}
                    onChange={(e) => setScheduleStartDate(e.target.value)}
                    style={{ width: '139px' }}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                    disabled={isOngoing}
                    style={{ width: '139px' }}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-[17px]">
                  <input
                    type="checkbox"
                    id="isOngoing"
                    checked={isOngoing}
                    onChange={(e) => {
                      setIsOngoing(e.target.checked);
                      if (e.target.checked) {
                        setScheduleEndDate("");
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                  />
                  <label htmlFor="isOngoing" className="text-xs text-gray-700 cursor-pointer">
                    Ongoing
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-[17px] pl-12">
                  <input
                    type="checkbox"
                    id="isRecurring"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                  />
                  {!isRecurring ? (
                    <label htmlFor="isRecurring" className="text-xs text-gray-700 cursor-pointer">
                      Enable recurring schedule
                    </label>
                  ) : (
                    <>
                      <span className="text-xs text-gray-700">Recurring every</span>
                      <input
                        type="number"
                        min="0"
                        value={frequencyNumber}
                        onChange={(e) => setFrequencyNumber(e.target.value)}
                        className="no-spinner w-11 rounded-md border border-gray-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <select
                        value={frequencyUnit}
                        onChange={(e) => setFrequencyUnit(e.target.value as "Day" | "Week" | "Month" | "Year")}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="Day">Day(s)</option>
                        <option value="Week">Week(s)</option>
                        <option value="Month">Month(s)</option>
                        <option value="Year">Year(s)</option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    // Find first day not already in schedule
                    const usedDays = daySchedules.map(s => s.day);
                    const nextDay = DAYS_OF_WEEK.find(day => !usedDays.includes(day)) || "Monday";

                    // Get the last time from the previous day to use as default
                    const lastSchedule = daySchedules[daySchedules.length - 1];
                    const lastTime = lastSchedule.times[lastSchedule.times.length - 1];
                    const defaultTime = { startTime: lastTime.startTime, endTime: lastTime.endTime };

                    setDaySchedules([...daySchedules, { day: nextDay, times: [defaultTime] }]);
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Add Day
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {saving ? "Saving..." : editingClasses.length > 0 ? "Update Class" : "Save Class"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Weekly Schedule */}
        {!loading && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Weekly Schedule</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {DAYS_OF_WEEK.map(day => (
                <div
                  key={day}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <h3 className="mb-3 text-sm font-semibold text-gray-800">
                    {day}
                  </h3>

                  {classesByDay[day].length === 0 ? (
                    <p className="text-xs text-gray-400">No classes scheduled</p>
                  ) : (
                    <div className="space-y-2">
                      {classesByDay[day].map(classSession => {
                        const startDate = new Date(classSession.startsAt);
                        const endDate = new Date(classSession.endsAt);
                        const startTime = startDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        });
                        const endTime = endDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        });

                        return (
                          <div
                            key={classSession.id}
                            className="flex items-start justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 p-2"
                          >
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-gray-900">
                                {classSession.name}
                              </p>
                              <p className="text-xs text-gray-600">
                                {startTime} - {endTime}
                              </p>
                              {classSession.minRankName && (
                                <p className="text-xs text-gray-500">
                                  Min Rank: {classSession.minRankName}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEdit(classSession)}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(classSession.id, classSession.name)}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Styled-JSX: remove number spinners from number fields */}
      <style jsx>{`
        :global(input[type="number"].no-spinner::-webkit-outer-spin-button),
        :global(input[type="number"].no-spinner::-webkit-inner-spin-button) {
          -webkit-appearance: none;
          margin: 0;
        }
        :global(input[type="number"].no-spinner) {
          -moz-appearance: textfield;
        }
      `}</style>
    </AppLayout>
  );
}
