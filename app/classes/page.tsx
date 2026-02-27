"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import { getTodayString } from "@/lib/dates";

// Multi-select checkbox dropdown with red checkboxes
function MultiSelectCheckbox({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select...",
  addNewLabel,
  onAddNew,
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addNewLabel?: string;
  onAddNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value]
    );
  };

  const displayText = selected.length === 0
    ? placeholder
    : selected.length <= 2
      ? options.filter(o => selected.includes(o.value)).map(o => o.label).join(", ")
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-md border border-gray-300 px-2 py-1 text-xs text-left focus:outline-none focus:ring-2 focus:ring-primary bg-white"
      >
        <span className={selected.length === 0 ? "text-gray-400" : "text-gray-900 truncate"}>{displayText}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded border-gray-300 text-primary focus:ring-primary accent-primary"
              />
              <span className="text-gray-800">{opt.label}</span>
            </label>
          ))}
          {addNewLabel && onAddNew && (
            <button
              type="button"
              onClick={() => { onAddNew(); setOpen(false); }}
              className="w-full text-left px-2.5 py-1.5 text-xs text-primary hover:bg-primary/5 font-medium"
            >
              {addNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
  classTypes?: string | null;
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
  coachId?: string | null;
  coachName?: string | null;
  maxCapacity?: number | null;
  bookingEnabled?: boolean;
  bookingCutoffMins?: number | null;
  bookingAdvanceDays?: number | null;
  kioskEnabled?: boolean;
  spaceId?: string | null;
};

type Coach = {
  id: string;
  firstName: string;
  lastName: string;
};

type Appointment = {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  duration: number;
  priceCents: number | null;
  color: string | null;
  coachId: string | null;
  coachName: string | null;
  styleId: string | null;
  styleName: string | null;
  notes: string | null;
  isActive: boolean;
};

type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

const DAYS_OF_WEEK: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingClasses, setEditingClasses] = useState<ClassSession[]>([]);

  // Refs for scrolling
  const classFormRef = useRef<HTMLDivElement>(null);

  // Appointment form state (managed in Memberships page, scheduling only here)

  // Schedule popup state
  const [showSchedulePopup, setShowSchedulePopup] = useState(false);
  const [schedulingAppt, setSchedulingAppt] = useState<Appointment | null>(null);
  const [schedApptDate, setSchedApptDate] = useState(getTodayString());
  const [schedApptStartTime, setSchedApptStartTime] = useState("09:00");
  const [schedApptEndTime, setSchedApptEndTime] = useState("10:00");
  const [schedApptMemberId, setSchedApptMemberId] = useState("");
  const [schedApptMemberName, setSchedApptMemberName] = useState("");
  const [schedApptMemberSearch, setSchedApptMemberSearch] = useState("");
  const [schedApptFilteredMembers, setSchedApptFilteredMembers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [schedApptCoachId, setSchedApptCoachId] = useState("");
  const [schedApptNotes, setSchedApptNotes] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [members, setMembers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);

  // Recurring appointment scheduling
  const [schedApptIsRecurring, setSchedApptIsRecurring] = useState(false);
  const [schedApptDaySchedules, setSchedApptDaySchedules] = useState<{
    day: DayOfWeek;
    times: { startTime: string; endTime: string }[];
  }[]>([{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
  const [schedApptScheduleStartDate, setSchedApptScheduleStartDate] = useState(getTodayString());
  const [schedApptScheduleEndDate, setSchedApptScheduleEndDate] = useState("");
  const [schedApptIsOngoing, setSchedApptIsOngoing] = useState(true);

  // Form fields
  const [name, setName] = useState("");
  const [selectedClassTypes, setSelectedClassTypes] = useState<string[]>([]);
  const [originalClassType, setOriginalClassType] = useState<string | null>(null); // Track original classType for rename detection
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([""]);
  const [minRankId, setMinRankId] = useState("");
  const [minRankIds, setMinRankIds] = useState<string[]>([""]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequencyNumber, setFrequencyNumber] = useState("1");
  const [frequencyUnit, setFrequencyUnit] = useState<"Day" | "Week" | "Month" | "Year">("Week");
  const [scheduleStartDate, setScheduleStartDate] = useState(getTodayString());
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [isOngoing, setIsOngoing] = useState(true);
  const [color, setColor] = useState("#a3a3a3");
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [kioskEnabled, setKioskEnabled] = useState(false);
  const [maxCapacity, setMaxCapacity] = useState("");
  const [bookingCutoffMins, setBookingCutoffMins] = useState("");
  const [bookingAdvanceDays, setBookingAdvanceDays] = useState("");
  const [daySchedules, setDaySchedules] = useState<{
    day: DayOfWeek;
    times: { startTime: string; endTime: string }[];
  }[]>([
    { day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }
  ]);
  const [saving, setSaving] = useState(false);
  const [allLocations, setAllLocations] = useState<{ id: string; name: string }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [allSpaces, setAllSpaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");

  // Class Types management
  const [showClassTypesModal, setShowClassTypesModal] = useState(false);
  const [newClassTypeName, setNewClassTypeName] = useState("");
  const [editingClassType, setEditingClassType] = useState<string | null>(null);
  const [editedClassTypeName, setEditedClassTypeName] = useState("");
  const [savingClassType, setSavingClassType] = useState(false);

  // Events state
  const [events, setEvents] = useState<{
    id: string; title: string; description: string | null;
    startsAt: string; endsAt: string; isAllDay: boolean;
    isRecurring: boolean; frequencyNumber: number | null; frequencyUnit: string | null;
    scheduleStartDate: string | null; scheduleEndDate: string | null; isOngoing: boolean;
    excludedDates: string | null; color: string | null;
    locationId: string | null; spaceId: string | null; notes: string | null;
  }[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventModalMode, setEventModalMode] = useState<"create" | "edit">("create");
  const [editingEvent, setEditingEvent] = useState<typeof events[0] | null>(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDescription, setEvDescription] = useState("");
  const [evStartDate, setEvStartDate] = useState(getTodayString());
  const [evStartTime, setEvStartTime] = useState("09:00");
  const [evEndTime, setEvEndTime] = useState("10:00");
  const [evIsAllDay, setEvIsAllDay] = useState(false);
  const [evIsRecurring, setEvIsRecurring] = useState(false);
  const [evFrequencyNumber, setEvFrequencyNumber] = useState("1");
  const [evFrequencyUnit, setEvFrequencyUnit] = useState<"Day" | "Week" | "Month">("Week");
  const [evScheduleEndDate, setEvScheduleEndDate] = useState("");
  const [evIsOngoing, setEvIsOngoing] = useState(true);
  const [evColor, setEvColor] = useState("#3b82f6");
  const [evLocationId, setEvLocationId] = useState("");
  const [evSpaceId, setEvSpaceId] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evSaving, setEvSaving] = useState(false);
  const [showEventDeleteConfirm, setShowEventDeleteConfirm] = useState(false);

  // Get ranks for first selected style (for backward compatibility)
  const selectedStyle = styles.find(s => s.id === selectedStyleIds[0]);
  const availableRanks = selectedStyle?.ranks || [];

  // Get unique class types for appointment dropdown (exclude "Imported" - only used for rank progress tracking)
  const uniqueClassTypes = (() => {
    const all = new Set<string>();
    for (const c of classes) {
      if (c.classType && c.classType !== "Imported") all.add(c.classType);
      if (c.classTypes) {
        try {
          const parsed: string[] = JSON.parse(c.classTypes);
          for (const t of parsed) { if (t && t !== "Imported") all.add(t); }
        } catch { /* ignore */ }
      }
    }
    return [...all].sort();
  })();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const [classesRes, stylesRes, coachesRes, appointmentsRes, membersRes, locationsRes, spacesRes, eventsRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/styles"),
        fetch("/api/members?status=COACH"),
        fetch("/api/appointments"),
        fetch("/api/members"),
        fetch("/api/locations"),
        fetch("/api/spaces"),
        fetch("/api/calendar-events"),
      ]);

      if (!classesRes.ok || !stylesRes.ok) {
        throw new Error("Failed to load data");
      }

      const classesData = await classesRes.json();
      const stylesData = await stylesRes.json();
      const coachesData = coachesRes.ok ? await coachesRes.json() : { members: [] };
      const appointmentsData = appointmentsRes.ok ? await appointmentsRes.json() : { appointments: [] };
      const membersData = membersRes.ok ? await membersRes.json() : { members: [] };

      setClasses(classesData.classes || []);
      setStyles(stylesData.styles || []);
      setCoaches((coachesData.members || []).map((c: { id: string; firstName: string; lastName: string }) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName
      })));
      setAppointments(appointmentsData.appointments || []);
      setMembers((membersData.members || []).map((m: { id: string; firstName: string; lastName: string }) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName
      })));
      const locationsData = locationsRes.ok ? await locationsRes.json() : { locations: [] };
      setAllLocations((locationsData.locations || []).filter((l: any) => l.isActive).map((l: any) => ({ id: l.id, name: l.name })));
      const spacesData = spacesRes.ok ? await spacesRes.json() : { spaces: [] };
      setAllSpaces((spacesData.spaces || []).filter((s: any) => s.isActive).map((s: any) => ({ id: s.id, name: s.name })));
      const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };
      setEvents(eventsData.events || []);
    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setSelectedClassTypes([]);
    setOriginalClassType(null);
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
    setSelectedCoachId("");
    setBookingEnabled(false);
    setKioskEnabled(false);
    setMaxCapacity("");
    setBookingCutoffMins("");
    setBookingAdvanceDays("");
    setDaySchedules([{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
    setSelectedSpaceId("");
    setEditingClasses([]);
    setShowForm(false);
  }

  function handleEdit(classSession: ClassSession) {
    // Find all classes with the same name, type, styles, and rank
    const relatedClasses = classes.filter(c =>
      c.name === classSession.name &&
      c.classTypes === classSession.classTypes &&
      c.classType === classSession.classType &&
      c.styleIds === classSession.styleIds &&
      c.styleId === classSession.styleId &&
      c.minRankId === classSession.minRankId
    );

    setEditingClasses(relatedClasses);
    setName(classSession.name);
    // Parse classTypes from JSON or use legacy classType
    let classTypes: string[] = [];
    if (classSession.classTypes) {
      try { classTypes = JSON.parse(classSession.classTypes); } catch { classTypes = []; }
    }
    if (classTypes.length === 0 && classSession.classType) {
      classTypes = [classSession.classType];
    }
    setSelectedClassTypes(classTypes);
    setOriginalClassType(classSession.classType || null); // Store original for rename detection

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

    // Set coach
    setSelectedCoachId(classSession.coachId || "");

    // Set booking fields
    setBookingEnabled(classSession.bookingEnabled || false);
    setKioskEnabled(classSession.kioskEnabled || false);
    setMaxCapacity(classSession.maxCapacity != null ? String(classSession.maxCapacity) : "");
    setBookingCutoffMins(classSession.bookingCutoffMins != null ? String(classSession.bookingCutoffMins) : "");
    setBookingAdvanceDays(classSession.bookingAdvanceDays != null ? String(classSession.bookingAdvanceDays) : "");

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
    setTimeout(() => classFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
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
        // If classType changed, update all styles' belt configs that reference the old class type
        const newClassType = selectedClassTypes[0]?.trim() || null;
        if (originalClassType && newClassType && originalClassType !== newClassType) {
          try {
            await fetch("/api/classes/rename-type", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                oldClassType: originalClassType,
                newClassType: newClassType,
              }),
            });

            // Also update reports localStorage config
            const reportsKey = "reports.config";
            const storedReports = localStorage.getItem(reportsKey);
            if (storedReports) {
              try {
                const reports = JSON.parse(storedReports);
                let hasChanges = false;
                const updatedReports = reports.map((report: any) => {
                  if (report.selectedClassTypes && Array.isArray(report.selectedClassTypes)) {
                    const idx = report.selectedClassTypes.indexOf(originalClassType);
                    if (idx !== -1) {
                      hasChanges = true;
                      const newClassTypes = [...report.selectedClassTypes];
                      newClassTypes[idx] = newClassType;
                      return { ...report, selectedClassTypes: newClassTypes };
                    }
                  }
                  // Also update columnOrder if it references the old class type
                  if (report.columnOrder && Array.isArray(report.columnOrder)) {
                    const oldColId = `classType:${originalClassType}`;
                    const newColId = `classType:${newClassType}`;
                    const colIdx = report.columnOrder.indexOf(oldColId);
                    if (colIdx !== -1) {
                      hasChanges = true;
                      const newColumnOrder = [...report.columnOrder];
                      newColumnOrder[colIdx] = newColId;
                      return { ...report, columnOrder: newColumnOrder };
                    }
                  }
                  return report;
                });
                if (hasChanges) {
                  localStorage.setItem(reportsKey, JSON.stringify(updatedReports));
                }
              } catch (e) {
                console.error("Error updating reports localStorage:", e);
              }
            }
          } catch (e) {
            console.error("Error renaming class type:", e);
          }
        }

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

            const selectedCoach = coaches.find(c => c.id === selectedCoachId);
            const res = await fetch("/api/classes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                classType: selectedClassTypes[0]?.trim() || null,
                classTypes: selectedClassTypes.length > 0 ? JSON.stringify(selectedClassTypes) : null,
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
                coachId: selectedCoachId || null,
                coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
                bookingEnabled,
                kioskEnabled,
                maxCapacity: maxCapacity || null,
                bookingCutoffMins: bookingCutoffMins || null,
                bookingAdvanceDays: bookingAdvanceDays || null,
                locationId: selectedLocationId || null,
                spaceId: selectedSpaceId || null,
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

            const selectedCoach = coaches.find(c => c.id === selectedCoachId);
            const res = await fetch("/api/classes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                classType: selectedClassTypes[0]?.trim() || null,
                classTypes: selectedClassTypes.length > 0 ? JSON.stringify(selectedClassTypes) : null,
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
                coachId: selectedCoachId || null,
                coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
                bookingEnabled,
                kioskEnabled,
                maxCapacity: maxCapacity || null,
                bookingCutoffMins: bookingCutoffMins || null,
                bookingAdvanceDays: bookingAdvanceDays || null,
                locationId: selectedLocationId || null,
                spaceId: selectedSpaceId || null,
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

  // Class Types management functions
  async function handleAddClassType() {
    if (!newClassTypeName.trim()) return;

    // Check if already exists
    if (uniqueClassTypes.includes(newClassTypeName.trim())) {
      setError("This class type already exists");
      return;
    }

    // We don't need to save to DB - class types are derived from classes
    // Just create a placeholder class to establish the type, or inform user
    // For now, let's just add it to local state by creating a fake class type marker
    // Actually, class types only exist when classes use them, so we'll just close the modal
    // and let the user select it when creating/editing a class

    // For a better UX, we could create a ClassType table, but for now let's just
    // allow the user to type any name and it will be available once a class uses it
    setNewClassTypeName("");
    setError("Class type will be available once you create a class using it. Enter it in the Class Type field when creating a class.");
  }

  async function handleRenameClassType() {
    if (!editingClassType || !editedClassTypeName.trim()) return;
    if (editingClassType === editedClassTypeName.trim()) {
      setEditingClassType(null);
      setEditedClassTypeName("");
      return;
    }

    // Check if new name already exists
    if (uniqueClassTypes.includes(editedClassTypeName.trim())) {
      setError("This class type name already exists");
      return;
    }

    try {
      setSavingClassType(true);
      setError(null);

      // Call the rename API
      const res = await fetch("/api/classes/rename-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldClassType: editingClassType,
          newClassType: editedClassTypeName.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to rename class type");
      }

      // Update reports localStorage config
      const reportsKey = "reports.config";
      const storedReports = localStorage.getItem(reportsKey);
      if (storedReports) {
        try {
          const reports = JSON.parse(storedReports);
          let hasChanges = false;
          const updatedReports = reports.map((report: any) => {
            let updated = { ...report };
            if (report.selectedClassTypes && Array.isArray(report.selectedClassTypes)) {
              const idx = report.selectedClassTypes.indexOf(editingClassType);
              if (idx !== -1) {
                hasChanges = true;
                const newClassTypes = [...report.selectedClassTypes];
                newClassTypes[idx] = editedClassTypeName.trim();
                updated = { ...updated, selectedClassTypes: newClassTypes };
              }
            }
            if (report.columnOrder && Array.isArray(report.columnOrder)) {
              const oldColId = `classType:${editingClassType}`;
              const newColId = `classType:${editedClassTypeName.trim()}`;
              const colIdx = report.columnOrder.indexOf(oldColId);
              if (colIdx !== -1) {
                hasChanges = true;
                const newColumnOrder = [...report.columnOrder];
                newColumnOrder[colIdx] = newColId;
                updated = { ...updated, columnOrder: newColumnOrder };
              }
            }
            return updated;
          });
          if (hasChanges) {
            localStorage.setItem(reportsKey, JSON.stringify(updatedReports));
          }
        } catch (e) {
          console.error("Error updating reports localStorage:", e);
        }
      }

      // Update local classes state (both classType and classTypes)
      setClasses(classes.map(c => {
        let updated = { ...c };
        if (c.classType === editingClassType) {
          updated.classType = editedClassTypeName.trim();
        }
        if (c.classTypes) {
          try {
            const types: string[] = JSON.parse(c.classTypes);
            const idx = types.indexOf(editingClassType!);
            if (idx !== -1) {
              types[idx] = editedClassTypeName.trim();
              updated.classTypes = JSON.stringify(types);
            }
          } catch { /* ignore */ }
        }
        return updated;
      }));

      setEditingClassType(null);
      setEditedClassTypeName("");
    } catch (err: any) {
      console.error("Error renaming class type:", err);
      setError(err.message || "Failed to rename class type");
    } finally {
      setSavingClassType(false);
    }
  }

  async function handleDeleteClassType(typeToDelete: string) {
    if (!window.confirm(`Are you sure you want to delete the class type "${typeToDelete}"? This will remove the class type from all classes that use it.`)) {
      return;
    }

    try {
      setSavingClassType(true);
      setError(null);

      // Update all classes that have this type (in classType or classTypes)
      const classesToUpdate = classes.filter(c => {
        if (c.classType === typeToDelete) return true;
        if (c.classTypes) {
          try {
            const types: string[] = JSON.parse(c.classTypes);
            return types.includes(typeToDelete);
          } catch { return false; }
        }
        return false;
      });
      for (const cls of classesToUpdate) {
        let newClassTypes: string | null = null;
        let newClassType: string | null = cls.classType === typeToDelete ? null : cls.classType;
        if (cls.classTypes) {
          try {
            const types: string[] = JSON.parse(cls.classTypes);
            const filtered = types.filter(t => t !== typeToDelete);
            newClassTypes = filtered.length > 0 ? JSON.stringify(filtered) : null;
            if (newClassType === null && filtered.length > 0) {
              newClassType = filtered[0]; // Update legacy field to first remaining type
            }
          } catch { /* ignore */ }
        }
        await fetch(`/api/classes/${cls.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classType: newClassType, classTypes: newClassTypes }),
        });
      }

      // Update local state (both classType and classTypes)
      setClasses(classes.map(c => {
        let updated = { ...c };
        if (c.classType === typeToDelete) {
          updated.classType = null;
        }
        if (c.classTypes) {
          try {
            const types: string[] = JSON.parse(c.classTypes);
            const filtered = types.filter(t => t !== typeToDelete);
            updated.classTypes = filtered.length > 0 ? JSON.stringify(filtered) : null;
            if (updated.classType === null && filtered.length > 0) {
              updated.classType = filtered[0];
            }
          } catch { /* ignore */ }
        }
        return updated;
      }));

      // Update reports localStorage config - remove the deleted type
      const reportsKey = "reports.config";
      const storedReports = localStorage.getItem(reportsKey);
      if (storedReports) {
        try {
          const reports = JSON.parse(storedReports);
          const updatedReports = reports.map((report: any) => {
            let updated = { ...report };
            if (report.selectedClassTypes && Array.isArray(report.selectedClassTypes)) {
              updated = { ...updated, selectedClassTypes: report.selectedClassTypes.filter((ct: string) => ct !== typeToDelete) };
            }
            if (report.columnOrder && Array.isArray(report.columnOrder)) {
              const colIdToRemove = `classType:${typeToDelete}`;
              updated = { ...updated, columnOrder: report.columnOrder.filter((col: string) => col !== colIdToRemove) };
            }
            return updated;
          });
          localStorage.setItem(reportsKey, JSON.stringify(updatedReports));
        } catch (e) {
          console.error("Error updating reports localStorage:", e);
        }
      }
    } catch (err: any) {
      console.error("Error deleting class type:", err);
      setError(err.message || "Failed to delete class type");
    } finally {
      setSavingClassType(false);
    }
  }

  // Schedule appointment functions
  function openSchedulePopup(appt: Appointment) {
    setSchedulingAppt(appt);
    // Set default date to today
    const today = getTodayString();
    setSchedApptDate(today);
    // Calculate end time based on appointment duration
    const duration = appt.duration || 60;
    const startHour = 9;
    const startMin = 0;
    const endHour = startHour + Math.floor(duration / 60);
    const endMin = startMin + (duration % 60);
    setSchedApptStartTime(`${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}`);
    setSchedApptEndTime(`${String(endHour).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`);
    // Use the appointment's coach as default
    setSchedApptCoachId(appt.coachId || "");
    setSchedApptMemberId("");
    setSchedApptMemberName("");
    setSchedApptMemberSearch("");
    setSchedApptFilteredMembers([]);
    setSchedApptNotes("");
    setSchedApptIsRecurring(false);
    const defaultDay = DAYS_OF_WEEK[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    const defaultEndTime = (() => {
      const dur = appt.duration || 60;
      const totalMins = 9 * 60 + dur;
      return `${String(Math.floor(totalMins / 60) % 24).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
    })();
    setSchedApptDaySchedules([{ day: defaultDay, times: [{ startTime: "09:00", endTime: defaultEndTime }] }]);
    setSchedApptScheduleStartDate(getTodayString());
    setSchedApptScheduleEndDate("");
    setSchedApptIsOngoing(true);
    setShowSchedulePopup(true);
  }

  function closeSchedulePopup() {
    setShowSchedulePopup(false);
    setSchedulingAppt(null);
    setSchedApptMemberSearch("");
    setSchedApptFilteredMembers([]);
  }

  // Handle member search for autocomplete
  function handleSchedMemberSearch(searchText: string) {
    setSchedApptMemberSearch(searchText);
    setSchedApptMemberName(searchText); // Also store as manual name in case no member is selected

    if (searchText.trim().length === 0) {
      setSchedApptFilteredMembers([]);
      return;
    }

    const searchLower = searchText.toLowerCase();
    const filtered = members.filter(m => {
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
      const firstLast = m.firstName.toLowerCase();
      const lastFirst = m.lastName.toLowerCase();
      return fullName.includes(searchLower) || firstLast.includes(searchLower) || lastFirst.includes(searchLower);
    }).slice(0, 10); // Limit to 10 results

    setSchedApptFilteredMembers(filtered);
  }

  // Select a member from autocomplete
  function handleSelectSchedMember(member: { id: string; firstName: string; lastName: string }) {
    setSchedApptMemberId(member.id);
    setSchedApptMemberName(`${member.firstName} ${member.lastName}`);
    setSchedApptMemberSearch(`${member.firstName} ${member.lastName}`);
    setSchedApptFilteredMembers([]);
  }

  // Clear selected member
  function handleClearSchedMember() {
    setSchedApptMemberId("");
    setSchedApptMemberName("");
    setSchedApptMemberSearch("");
    setSchedApptFilteredMembers([]);
  }

  // Auto-calculate end time when start time or appointment changes
  function handleStartTimeChange(newStartTime: string) {
    setSchedApptStartTime(newStartTime);
    if (schedulingAppt) {
      const duration = schedulingAppt.duration || 60;
      const [hours, mins] = newStartTime.split(":").map(Number);
      const totalMins = hours * 60 + mins + duration;
      const endHour = Math.floor(totalMins / 60) % 24;
      const endMin = totalMins % 60;
      setSchedApptEndTime(`${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`);
    }
  }

  async function handleScheduleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!schedulingAppt) {
      setError("No appointment selected");
      return;
    }

    if (schedApptIsRecurring) {
      // Recurring mode: generate dates from daySchedules within date range
      if (schedApptDaySchedules.length === 0) {
        setError("Please add at least one day");
        return;
      }
      if (!schedApptScheduleStartDate) {
        setError("Start date is required for recurring appointments");
        return;
      }
    } else {
      // Single mode
      if (!schedApptDate || !schedApptStartTime || !schedApptEndTime) {
        setError("Please fill in all required fields");
        return;
      }
    }

    try {
      setSavingSchedule(true);
      setError(null);

      const selectedCoach = coaches.find(c => c.id === schedApptCoachId);
      const selectedMember = members.find(m => m.id === schedApptMemberId);
      const memberNameResolved = selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : schedApptMemberName || null;
      const coachNameResolved = selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null;

      if (schedApptIsRecurring) {
        // Generate all dates for the recurring pattern
        const startDate = new Date(schedApptScheduleStartDate + "T00:00:00");
        const endDate = schedApptIsOngoing || !schedApptScheduleEndDate
          ? new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000) // 90 days ahead if ongoing
          : new Date(schedApptScheduleEndDate + "T23:59:59");

        const dayIndexMap: Record<string, number> = {
          Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
        };

        let createdCount = 0;

        for (const schedule of schedApptDaySchedules) {
          const targetDayIndex = dayIndexMap[schedule.day];

          for (const time of schedule.times) {
            // Find all matching dates in the range
            const current = new Date(startDate);
            // Move to first occurrence of this day
            while (current.getDay() !== targetDayIndex) {
              current.setDate(current.getDate() + 1);
            }

            while (current <= endDate) {
              const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;

              const res = await fetch("/api/scheduled-appointments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  appointmentId: schedulingAppt.id,
                  scheduledDate: dateStr,
                  startTime: time.startTime,
                  endTime: time.endTime,
                  memberId: schedApptMemberId || null,
                  memberName: memberNameResolved,
                  coachId: schedApptCoachId || null,
                  coachName: coachNameResolved,
                  notes: schedApptNotes || null,
                }),
              });

              if (!res.ok) {
                console.error(`Failed to create appointment for ${dateStr}`);
              } else {
                createdCount++;
              }

              current.setDate(current.getDate() + 7); // Weekly
            }
          }
        }

        closeSchedulePopup();
        alert(`Created ${createdCount} recurring "${schedulingAppt.title}" appointments`);
      } else {
        // Single appointment
        const res = await fetch("/api/scheduled-appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: schedulingAppt.id,
            scheduledDate: schedApptDate,
            startTime: schedApptStartTime,
            endTime: schedApptEndTime,
            memberId: schedApptMemberId || null,
            memberName: memberNameResolved,
            coachId: schedApptCoachId || null,
            coachName: coachNameResolved,
            notes: schedApptNotes || null,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to schedule appointment");
        }

        closeSchedulePopup();
        alert(`"${schedulingAppt.title}" scheduled for ${new Date(schedApptDate).toLocaleDateString()} at ${schedApptStartTime}`);
      }
    } catch (err: any) {
      console.error("Error scheduling appointment:", err);
      setError(err.message || "Failed to schedule appointment");
    } finally {
      setSavingSchedule(false);
    }
  }

  // --- Events Handlers ---
  function openCreateEvent() {
    setEventModalMode("create");
    setEditingEvent(null);
    setEvTitle("");
    setEvDescription("");
    setEvStartDate(getTodayString());
    setEvStartTime("09:00");
    setEvEndTime("10:00");
    setEvIsAllDay(false);
    setEvIsRecurring(false);
    setEvFrequencyNumber("1");
    setEvFrequencyUnit("Week");
    setEvScheduleEndDate("");
    setEvIsOngoing(true);
    setEvColor("#3b82f6");
    setEvLocationId("");
    setEvSpaceId("");
    setEvNotes("");
    setShowEventModal(true);
  }

  function openEditEvent(event: typeof events[0]) {
    setEventModalMode("edit");
    setEditingEvent(event);
    setEvTitle(event.title);
    setEvDescription(event.description || "");
    const sd = new Date(event.startsAt);
    setEvStartDate(sd.toISOString().split("T")[0]);
    setEvStartTime(`${String(sd.getHours()).padStart(2, "0")}:${String(sd.getMinutes()).padStart(2, "0")}`);
    const ed = new Date(event.endsAt);
    setEvEndTime(`${String(ed.getHours()).padStart(2, "0")}:${String(ed.getMinutes()).padStart(2, "0")}`);
    setEvIsAllDay(event.isAllDay);
    setEvIsRecurring(event.isRecurring);
    setEvFrequencyNumber(String(event.frequencyNumber || 1));
    setEvFrequencyUnit((event.frequencyUnit as "Day" | "Week" | "Month") || "Week");
    setEvScheduleEndDate(event.scheduleEndDate ? new Date(event.scheduleEndDate).toISOString().split("T")[0] : "");
    setEvIsOngoing(event.isOngoing);
    setEvColor(event.color || "#3b82f6");
    setEvLocationId(event.locationId || "");
    setEvSpaceId(event.spaceId || "");
    setEvNotes(event.notes || "");
    setShowEventModal(true);
  }

  async function handleSaveEvent() {
    if (!evTitle.trim()) return;
    setEvSaving(true);
    try {
      const startsAt = evIsAllDay ? new Date(`${evStartDate}T00:00:00`) : new Date(`${evStartDate}T${evStartTime}:00`);
      const endsAt = evIsAllDay ? new Date(`${evStartDate}T23:59:59`) : new Date(`${evStartDate}T${evEndTime}:00`);
      const payload = {
        title: evTitle.trim(),
        description: evDescription.trim() || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        isAllDay: evIsAllDay,
        isRecurring: evIsRecurring,
        frequencyNumber: evIsRecurring ? parseInt(evFrequencyNumber) || 1 : null,
        frequencyUnit: evIsRecurring ? evFrequencyUnit : null,
        scheduleStartDate: evIsRecurring ? new Date(`${evStartDate}T00:00:00`).toISOString() : null,
        scheduleEndDate: evIsRecurring && !evIsOngoing && evScheduleEndDate ? new Date(`${evScheduleEndDate}T23:59:59`).toISOString() : null,
        isOngoing: evIsRecurring ? evIsOngoing : true,
        color: evColor,
        locationId: evLocationId || null,
        spaceId: evSpaceId || null,
        notes: evNotes || null,
      };
      if (eventModalMode === "edit" && editingEvent) {
        await fetch(`/api/calendar-events/${editingEvent.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        await fetch("/api/calendar-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      const res = await fetch("/api/calendar-events");
      if (res.ok) { const data = await res.json(); setEvents(data.events || []); }
      setShowEventModal(false);
    } catch (err) { console.error("Error saving event:", err); }
    finally { setEvSaving(false); }
  }

  async function handleDeleteEvent() {
    if (!editingEvent) return;
    setEvSaving(true);
    try {
      await fetch(`/api/calendar-events/${editingEvent.id}`, { method: "DELETE" });
      const res = await fetch("/api/calendar-events");
      if (res.ok) { const data = await res.json(); setEvents(data.events || []); }
      setShowEventModal(false);
      setShowEventDeleteConfirm(false);
    } catch (err) { console.error("Error deleting event:", err); }
    finally { setEvSaving(false); }
  }

  // Group classes by day of week (exclude imported placeholder class sessions)
  const classesByDay = DAYS_OF_WEEK.reduce((acc, day) => {
    acc[day] = classes.filter(c => {
      // Skip imported placeholder class sessions (startsAt in far past)
      if (new Date(c.startsAt).getFullYear() < 2010) return false;
      const date = new Date(c.startsAt);
      const dayIndex = date.getDay();
      const dayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return dayMap[dayIndex] === day;
    }).sort((a, b) => {
      const aDate = new Date(a.startsAt);
      const bDate = new Date(b.startsAt);
      const aMinutes = aDate.getHours() * 60 + aDate.getMinutes();
      const bMinutes = bDate.getHours() * 60 + bDate.getMinutes();
      return aMinutes - bMinutes;
    });
    return acc;
  }, {} as Record<DayOfWeek, ClassSession[]>);

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Scheduling</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage classes, appointments, and events
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowClassTypesModal(true)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Manage Class Types
            </button>
            <button
              onClick={() => {
                setShowForm(true);
                setTimeout(() => classFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
              }}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Create Class
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
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
          <div ref={classFormRef} className="rounded-lg border border-gray-200 bg-white p-4">
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
                    Class Name <span className="text-primary">*</span>
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
                    Class Types (counts toward requirements)
                  </label>
                  <MultiSelectCheckbox
                    options={uniqueClassTypes.map(t => ({ value: t, label: t }))}
                    selected={selectedClassTypes}
                    onChange={setSelectedClassTypes}
                    placeholder="No Type"
                    addNewLabel="Add New Type..."
                    onAddNew={() => setShowClassTypesModal(true)}
                  />
                </div>
              </div>

              {/* Styles Selection */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Allowed Styles
                </label>
                <MultiSelectCheckbox
                  options={styles.map(s => ({ value: s.id, label: s.name }))}
                  selected={selectedStyleIds.filter(id => id !== "" && id !== "NO_STYLE")}
                  onChange={(values) => {
                    setSelectedStyleIds(values.length > 0 ? values : [""]);
                    // Keep minRankIds in sync
                    const newRankIds = values.map(id => {
                      const oldIdx = selectedStyleIds.indexOf(id);
                      return oldIdx >= 0 ? (minRankIds[oldIdx] || "") : "";
                    });
                    setMinRankIds(newRankIds.length > 0 ? newRankIds : [""]);
                    setMinRankId(newRankIds[0] || "");
                  }}
                  placeholder="All Styles"
                />

                {/* Minimum Rank per selected style */}
                {selectedStyleIds.filter(id => id !== "" && id !== "NO_STYLE").length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                      Minimum Rank Required
                    </label>
                    {selectedStyleIds.filter(id => id !== "" && id !== "NO_STYLE").map((styleId, index) => {
                      const style = styles.find(s => s.id === styleId);
                      if (!style) return null;
                      return (
                        <div key={styleId} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-24 truncate">{style.name}</span>
                          <select
                            value={minRankIds[selectedStyleIds.indexOf(styleId)] || ""}
                            onChange={(e) => {
                              const realIdx = selectedStyleIds.indexOf(styleId);
                              const newRankIds = [...minRankIds];
                              newRankIds[realIdx] = e.target.value;
                              setMinRankIds(newRankIds);
                              if (realIdx === 0) setMinRankId(e.target.value);
                            }}
                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">No Rank Requirement</option>
                            {style.ranks?.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Day Schedules, Calendar Color, and Coach */}
              <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                {/* Day Schedules Section */}
                <div className="min-w-0 flex-shrink">
                <div className="mb-1 flex items-center gap-2">
                  <label className="block text-xs font-medium text-gray-700" style={{ width: '100px' }}>
                    Day
                  </label>
                  <label className="block text-xs font-medium text-gray-700" style={{ width: '100px' }}>
                    Start <span className="text-primary">*</span>
                  </label>
                  <div style={{ width: '16px' }}></div>
                  <label className="block text-xs font-medium text-gray-700" style={{ width: '100px' }}>
                    End <span className="text-primary">*</span>
                  </label>
                </div>
                  <div className="space-y-2">
                    {daySchedules.map((schedule, scheduleIndex) => (
                      <div key={scheduleIndex} className="space-y-2">
                        {schedule.times.map((time, timeIndex) => (
                          <div key={timeIndex} className="flex items-center gap-2">
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
                                style={{ width: '100px' }}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              >
                                {DAYS_OF_WEEK.map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                                <option value="REMOVE" className="text-primary">Remove Day</option>
                              </select>
                            ) : (
                              <div style={{ width: '100px' }}></div>
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
                              style={{ width: '100px' }}
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
                              style={{ width: '100px' }}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              required
                            />

                            {/* Add/Remove time buttons */}
                            <div style={{ width: '16px' }} className="flex items-center justify-center">
                              {timeIndex === 0 && schedule.times.length < 5 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newSchedules = [...daySchedules];
                                    newSchedules[scheduleIndex].times.push({ startTime: "09:00", endTime: "10:00" });
                                    setDaySchedules(newSchedules);
                                  }}
                                  className="text-base font-bold leading-none text-primary hover:text-primaryDark"
                                  aria-label="Add time slot"
                                >
                                  +
                                </button>
                              )}
                              {timeIndex > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newSchedules = [...daySchedules];
                                    newSchedules[scheduleIndex].times = newSchedules[scheduleIndex].times.filter((_, i) => i !== timeIndex);
                                    setDaySchedules(newSchedules);
                                  }}
                                  className="text-[10px] font-black leading-none text-primary hover:text-primaryDark"
                                  aria-label="Remove time slot"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Calendar Color and Coach - grouped to wrap together */}
                <div className="color-coach-recurring-group flex flex-wrap items-start gap-x-8 gap-y-4">
                  {/* Calendar Color Section */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Calendar Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{ minWidth: '64px' }}
                        className="h-[26px] w-16 cursor-pointer rounded border border-gray-300"
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
                  </div>

                  {/* Coach Section */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Coach
                    </label>
                    <select
                      value={selectedCoachId}
                      onChange={(e) => setSelectedCoachId(e.target.value)}
                      style={{ minWidth: '150px' }}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">No Coach</option>
                      {coaches.map(coach => (
                        <option key={coach.id} value={coach.id}>
                          {coach.firstName} {coach.lastName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Location Section */}
                  {allLocations.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Location
                      </label>
                      <select
                        value={selectedLocationId}
                        onChange={(e) => setSelectedLocationId(e.target.value)}
                        style={{ minWidth: '150px' }}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">No Location</option>
                        {allLocations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Space Section */}
                  {allSpaces.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Space
                      </label>
                      <select
                        value={selectedSpaceId}
                        onChange={(e) => setSelectedSpaceId(e.target.value)}
                        style={{ minWidth: '150px' }}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">No Space</option>
                        {allSpaces.map(space => (
                          <option key={space.id} value={space.id}>
                            {space.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule Dates and Recurring */}
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Start Date <span className="text-primary">*</span>
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
                  <div className="mb-1 flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-700">
                      End Date
                    </label>
                    <label htmlFor="isOngoing" className="text-xs text-gray-700 cursor-pointer">
                      Ongoing
                    </label>
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
                  </div>
                  <input
                    type="date"
                    value={scheduleEndDate}
                    onChange={(e) => setScheduleEndDate(e.target.value)}
                    disabled={isOngoing}
                    style={{ width: '139px' }}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>

                {/* Recurring */}
                <div className="color-coach-recurring-group">
                  <div className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isRecurring"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                    />
                    <label htmlFor="isRecurring" className="text-xs font-medium text-gray-700 cursor-pointer">
                      {isRecurring ? "Recurring every" : "Enable Recurring"}
                    </label>
                  </div>
                  {isRecurring && (
                    <div className="flex items-center gap-2">
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
                    </div>
                  )}
                </div>

              </div>

              {/* Portal Booking & Kiosk Settings */}
              <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="bookingEnabled"
                      checked={bookingEnabled}
                      onChange={(e) => setBookingEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                    />
                    <label htmlFor="bookingEnabled" className="text-xs font-medium text-gray-700 cursor-pointer">
                      Enable Portal Booking
                    </label>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="kioskEnabled"
                      checked={kioskEnabled}
                      onChange={(e) => setKioskEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                    />
                    <label htmlFor="kioskEnabled" className="text-xs font-medium text-gray-700 cursor-pointer">
                      Allow Kiosk Sign In
                    </label>
                  </div>
                </div>

                {bookingEnabled && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Max Capacity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={maxCapacity}
                        onChange={(e) => setMaxCapacity(e.target.value)}
                        placeholder="No limit"
                        className="no-spinner w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Book Up To (days ahead)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={bookingAdvanceDays}
                        onChange={(e) => setBookingAdvanceDays(e.target.value)}
                        placeholder="No limit"
                        className="no-spinner w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Cutoff Before Class (mins)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={bookingCutoffMins}
                        onChange={(e) => setBookingCutoffMins(e.target.value)}
                        placeholder="No cutoff"
                        className="no-spinner w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </>
                )}
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

        {/* Personal Appointments Section */}
        {!loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Personal Appointments</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Schedule appointments here. <a href="/memberships" className="text-primary hover:underline">Manage appointment types in Memberships</a>.
                </p>
              </div>
            </div>

            {/* Appointments List */}
            {appointments.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                No appointment types configured. <a href="/memberships" className="text-primary hover:underline">Create appointment types in Memberships</a>.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Title</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Duration</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Price</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Style</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Coach</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {appointments.filter(a => a.isActive).map(appt => {
                      const priceStr = appt.priceCents ? `$${(appt.priceCents / 100).toFixed(2)}` : '-';
                      const durationStr = `${appt.duration} min`;

                      return (
                        <tr key={appt.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: appt.color || '#6b7280' }}
                              />
                              <span className="font-medium">{appt.title}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{durationStr}</td>
                          <td className="px-3 py-2 text-gray-600">{priceStr}</td>
                          <td className="px-3 py-2 text-gray-600">{appt.styleName || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{appt.coachName || '-'}</td>
                          <td className="px-3 py-2">
                            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700">
                              Active
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => openSchedulePopup(appt)}
                              className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                            >
                              Schedule
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {/* Events Section */}
        {!loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Events</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Seminars, tournaments, social events, and other special occasions
                </p>
              </div>
              <button
                onClick={openCreateEvent}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Create Event
              </button>
            </div>

            {events.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                No events created yet.
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Color</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Title</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Time</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Recurring</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {events.map((event) => {
                      const sd = new Date(event.startsAt);
                      const ed = new Date(event.endsAt);
                      return (
                        <tr key={event.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: event.color || "#3b82f6" }} />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {event.title}
                            {event.description && <div className="text-[10px] text-gray-500 truncate max-w-[200px]">{event.description}</div>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {sd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {event.isAllDay ? "All Day" : `${sd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} - ${ed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {event.isRecurring ? (
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                Every {event.frequencyNumber} {event.frequencyUnit}(s)
                              </span>
                            ) : (
                              <span className="text-gray-400">One-time</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => openEditEvent(event)} className="text-primary hover:underline text-xs">Edit</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule Appointment Popup */}
      {showSchedulePopup && schedulingAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Schedule: {schedulingAppt.title}
              </h2>
              <button
                onClick={closeSchedulePopup}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Appointment Info */}
            <div className="mb-4 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: schedulingAppt.color || '#6b7280' }}
                />
                <span className="font-medium text-gray-900">{schedulingAppt.title}</span>
              </div>
              <div>Duration: {schedulingAppt.duration} min</div>
              {schedulingAppt.priceCents && (
                <div>Price: ${(schedulingAppt.priceCents / 100).toFixed(2)}</div>
              )}
              {schedulingAppt.styleName && <div>Style: {schedulingAppt.styleName}</div>}
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-3">
              {/* Recurring Toggle */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedApptIsRecurring}
                    onChange={(e) => setSchedApptIsRecurring(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-red-600"
                  />
                  Recurring Schedule
                </label>
              </div>

              {!schedApptIsRecurring ? (
                <>
                  {/* Single Date */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Date <span className="text-primary">*</span>
                    </label>
                    <input
                      type="date"
                      value={schedApptDate}
                      onChange={(e) => setSchedApptDate(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  {/* Single Time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Start Time <span className="text-primary">*</span>
                      </label>
                      <input
                        type="time"
                        value={schedApptStartTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        End Time <span className="text-primary">*</span>
                      </label>
                      <input
                        type="time"
                        value={schedApptEndTime}
                        onChange={(e) => setSchedApptEndTime(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Recurring Day/Time Schedules */}
                  <div className="rounded-md border border-gray-200 p-3 space-y-3">
                    <div className="mb-1 flex items-center gap-2">
                      <label className="block text-xs font-medium text-gray-700" style={{ width: '100px' }}>Day</label>
                      <label className="block text-xs font-medium text-gray-700" style={{ width: '90px' }}>Start <span className="text-primary">*</span></label>
                      <div style={{ width: '16px' }}></div>
                      <label className="block text-xs font-medium text-gray-700" style={{ width: '90px' }}>End <span className="text-primary">*</span></label>
                    </div>
                    <div className="space-y-2">
                      {schedApptDaySchedules.map((schedule, scheduleIndex) => (
                        <div key={scheduleIndex} className="space-y-2">
                          {schedule.times.map((time, timeIndex) => (
                            <div key={timeIndex} className="flex items-center gap-2">
                              {timeIndex === 0 ? (
                                <select
                                  value={schedule.day}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "REMOVE") {
                                      const newSchedules = schedApptDaySchedules.filter((_, i) => i !== scheduleIndex);
                                      setSchedApptDaySchedules(newSchedules.length > 0 ? newSchedules : [{ day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }]);
                                    } else {
                                      const newSchedules = [...schedApptDaySchedules];
                                      newSchedules[scheduleIndex].day = val as DayOfWeek;
                                      setSchedApptDaySchedules(newSchedules);
                                    }
                                  }}
                                  style={{ width: '100px' }}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                  {DAYS_OF_WEEK.map(day => (
                                    <option key={day} value={day}>{day}</option>
                                  ))}
                                  <option value="REMOVE" className="text-primary">Remove Day</option>
                                </select>
                              ) : (
                                <div style={{ width: '100px' }}></div>
                              )}

                              <input
                                type="time"
                                value={time.startTime}
                                onChange={(e) => {
                                  const newSchedules = [...schedApptDaySchedules];
                                  newSchedules[scheduleIndex].times[timeIndex].startTime = e.target.value;
                                  // Auto-adjust end time based on appointment duration
                                  if (e.target.value && schedulingAppt) {
                                    const [h, m] = e.target.value.split(":").map(Number);
                                    const totalMins = h * 60 + m + (schedulingAppt.duration || 60);
                                    newSchedules[scheduleIndex].times[timeIndex].endTime =
                                      `${String(Math.floor(totalMins / 60) % 24).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
                                  }
                                  setSchedApptDaySchedules(newSchedules);
                                }}
                                style={{ width: '90px' }}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                              />

                              <span className="text-xs text-gray-500">to</span>

                              <input
                                type="time"
                                value={time.endTime}
                                onChange={(e) => {
                                  const newSchedules = [...schedApptDaySchedules];
                                  newSchedules[scheduleIndex].times[timeIndex].endTime = e.target.value;
                                  setSchedApptDaySchedules(newSchedules);
                                }}
                                style={{ width: '90px' }}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                              />

                              <div style={{ width: '16px' }} className="flex items-center justify-center">
                                {timeIndex === 0 && schedule.times.length < 5 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newSchedules = [...schedApptDaySchedules];
                                      newSchedules[scheduleIndex].times.push({ startTime: "09:00", endTime: "10:00" });
                                      setSchedApptDaySchedules(newSchedules);
                                    }}
                                    className="text-base font-bold leading-none text-primary hover:text-primaryDark"
                                    aria-label="Add time slot"
                                  >
                                    +
                                  </button>
                                )}
                                {timeIndex > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newSchedules = [...schedApptDaySchedules];
                                      newSchedules[scheduleIndex].times = newSchedules[scheduleIndex].times.filter((_, i) => i !== timeIndex);
                                      setSchedApptDaySchedules(newSchedules);
                                    }}
                                    className="text-[10px] font-black leading-none text-primary hover:text-primaryDark"
                                    aria-label="Remove time slot"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Add Day Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const usedDays = schedApptDaySchedules.map(s => s.day);
                        const nextDay = DAYS_OF_WEEK.find(d => !usedDays.includes(d)) || "Monday";
                        setSchedApptDaySchedules([...schedApptDaySchedules, { day: nextDay, times: [{ startTime: "09:00", endTime: "10:00" }] }]);
                      }}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      + Add Day
                    </button>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Start Date <span className="text-primary">*</span>
                      </label>
                      <input
                        type="date"
                        value={schedApptScheduleStartDate}
                        onChange={(e) => setSchedApptScheduleStartDate(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        required
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer mt-5">
                        <input
                          type="checkbox"
                          checked={schedApptIsOngoing}
                          onChange={(e) => setSchedApptIsOngoing(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 accent-red-600"
                        />
                        Ongoing
                      </label>
                    </div>
                  </div>
                  {!schedApptIsOngoing && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={schedApptScheduleEndDate}
                        onChange={(e) => setSchedApptScheduleEndDate(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Member */}
              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Member
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={schedApptMemberSearch}
                    onChange={(e) => handleSchedMemberSearch(e.target.value)}
                    onBlur={() => {
                      // Delay to allow click on dropdown item
                      setTimeout(() => setSchedApptFilteredMembers([]), 200);
                    }}
                    placeholder="Search member or enter name..."
                    className={`w-full rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary ${
                      schedApptMemberId ? 'border-green-400 bg-green-50' : 'border-gray-300'
                    }`}
                  />
                  {schedApptMemberId && (
                    <button
                      type="button"
                      onClick={handleClearSchedMember}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {/* Autocomplete dropdown */}
                {schedApptFilteredMembers.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                    {schedApptFilteredMembers.map((member) => (
                      <li
                        key={member.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSchedMember(member);
                        }}
                        className="cursor-pointer px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        {member.firstName} {member.lastName}
                      </li>
                    ))}
                  </ul>
                )}
                {schedApptMemberId && (
                  <div className="mt-1 text-[10px] text-green-600">
                    Member selected
                  </div>
                )}
              </div>

              {/* Coach */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Coach
                </label>
                <select
                  value={schedApptCoachId}
                  onChange={(e) => setSchedApptCoachId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">No Coach</option>
                  {coaches.map(coach => (
                    <option key={coach.id} value={coach.id}>
                      {coach.firstName} {coach.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  value={schedApptNotes}
                  onChange={(e) => setSchedApptNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[40px]"
                  placeholder="Additional notes for this appointment..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeSchedulePopup}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {savingSchedule ? "Scheduling..." : "Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Class Types Management Modal */}
      {showClassTypesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Manage Class Types</h2>
              <button
                onClick={() => {
                  setShowClassTypesModal(false);
                  setNewClassTypeName("");
                  setEditingClassType(null);
                  setEditedClassTypeName("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 text-xs text-gray-500">
              Class types are used to categorize classes and track attendance requirements for belt ranks.
            </p>

            {/* Add New Class Type */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Add New Class Type
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newClassTypeName}
                  onChange={(e) => setNewClassTypeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newClassTypeName.trim() && !uniqueClassTypes.includes(newClassTypeName.trim())) {
                        setSelectedClassTypes(prev => [...prev, newClassTypeName.trim()]);
                        setNewClassTypeName("");
                        setShowClassTypesModal(false);
                      }
                    }
                  }}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Sparring, Weapons, Forms"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newClassTypeName.trim() && !uniqueClassTypes.includes(newClassTypeName.trim())) {
                      setSelectedClassTypes(prev => [...prev, newClassTypeName.trim()]);
                      setNewClassTypeName("");
                      setShowClassTypesModal(false);
                    } else if (uniqueClassTypes.includes(newClassTypeName.trim())) {
                      setError("This class type already exists");
                    }
                  }}
                  disabled={!newClassTypeName.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add & Select
                </button>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                New types will appear in the dropdown once you save a class with this type.
              </p>
            </div>

            {/* Existing Class Types */}
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-700">
                Existing Class Types ({uniqueClassTypes.length})
              </label>
              {uniqueClassTypes.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No class types defined yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {uniqueClassTypes.map((type) => (
                    <div
                      key={type}
                      className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      {editingClassType === type ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            type="text"
                            value={editedClassTypeName}
                            onChange={(e) => setEditedClassTypeName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleRenameClassType();
                              } else if (e.key === "Escape") {
                                setEditingClassType(null);
                                setEditedClassTypeName("");
                              }
                            }}
                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleRenameClassType}
                            disabled={savingClassType}
                            className="text-xs text-primary hover:text-primaryDark disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClassType(null);
                              setEditedClassTypeName("");
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm text-gray-800">{type}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400">
                              {classes.filter(c => {
                                if (c.classType === type) return true;
                                if (c.classTypes) {
                                  try { return JSON.parse(c.classTypes).includes(type); } catch { return false; }
                                }
                                return false;
                              }).length} classes
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingClassType(type);
                                setEditedClassTypeName(type);
                              }}
                              className="text-xs text-primary hover:text-primaryDark"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClassType(type)}
                              disabled={savingClassType}
                              className="text-xs text-primary hover:text-primaryDark disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowClassTypesModal(false);
                  setNewClassTypeName("");
                  setEditingClassType(null);
                  setEditedClassTypeName("");
                }}
                className="rounded-md border border-gray-300 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {eventModalMode === "create" ? "Create Event" : "Edit Event"}
              </h2>
              <button onClick={() => setShowEventModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Title *</label>
                <input type="text" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Event title..." />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
                <textarea value={evDescription} onChange={(e) => setEvDescription(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Optional description..." />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Date</label>
                <input type="date" value={evStartDate} onChange={(e) => setEvStartDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={evIsAllDay} onChange={(e) => setEvIsAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-red-600" />
                  All Day Event
                </label>
              </div>
              {!evIsAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Start Time</label>
                    <input type="time" value={evStartTime} onChange={(e) => setEvStartTime(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">End Time</label>
                    <input type="time" value={evEndTime} onChange={(e) => setEvEndTime(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                  </div>
                </div>
              )}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={evIsRecurring} onChange={(e) => setEvIsRecurring(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-red-600" />
                  Recurring
                </label>
              </div>
              {evIsRecurring && (
                <div className="space-y-3 rounded-md border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Every</span>
                    <input type="number" min="1" value={evFrequencyNumber} onChange={(e) => setEvFrequencyNumber(e.target.value)} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs" />
                    <select value={evFrequencyUnit} onChange={(e) => setEvFrequencyUnit(e.target.value as "Day" | "Week" | "Month")} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                      <option value="Day">Day(s)</option>
                      <option value="Week">Week(s)</option>
                      <option value="Month">Month(s)</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={evIsOngoing} onChange={(e) => setEvIsOngoing(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-red-600" />
                      Ongoing (no end date)
                    </label>
                  </div>
                  {!evIsOngoing && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">End Date</label>
                      <input type="date" value={evScheduleEndDate} onChange={(e) => setEvScheduleEndDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Color</label>
                <input type="color" value={evColor} onChange={(e) => setEvColor(e.target.value)} className="h-8 w-12 rounded border border-gray-300 cursor-pointer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Location</label>
                  <select value={evLocationId} onChange={(e) => setEvLocationId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">None</option>
                    {allLocations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Space</label>
                  <select value={evSpaceId} onChange={(e) => setEvSpaceId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">None</option>
                    {allSpaces.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                <textarea value={evNotes} onChange={(e) => setEvNotes(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Optional notes..." />
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <div>
                {eventModalMode === "edit" && (
                  <button onClick={() => setShowEventDeleteConfirm(true)} disabled={evSaving} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300">
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowEventModal(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSaveEvent} disabled={evSaving || !evTitle.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:bg-gray-300">
                  {evSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Delete Confirmation */}
      {showEventDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <span className="text-xl text-red-600">⚠</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Delete Event</h3>
            </div>
            <p className="mb-6 text-xs text-gray-600">
              Are you sure you want to delete &quot;{editingEvent?.title}&quot;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEventDeleteConfirm(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDeleteEvent} disabled={evSaving} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300">
                {evSaving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styled-JSX: remove number spinners and handle grouped wrapping */}
      <style jsx>{`
        :global(input[type="number"].no-spinner::-webkit-outer-spin-button),
        :global(input[type="number"].no-spinner::-webkit-inner-spin-button) {
          -webkit-appearance: none;
          margin: 0;
        }
        :global(input[type="number"].no-spinner) {
          -moz-appearance: textfield;
        }
        @media (max-width: 900px) {
          :global(.color-coach-recurring-group) {
            flex-basis: 100%;
          }
        }
      `}</style>
    </AppLayout>
  );
}
