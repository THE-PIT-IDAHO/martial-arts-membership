"use client";

import { useEffect, useState, useRef } from "react";
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
  coachId?: string | null;
  coachName?: string | null;
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
  const apptFormRef = useRef<HTMLDivElement>(null);

  // Appointment form state
  const [showApptForm, setShowApptForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [apptTitle, setApptTitle] = useState("");
  const [apptDescription, setApptDescription] = useState("");
  const [apptType, setApptType] = useState("");
  const [apptDuration, setApptDuration] = useState("60");
  const [apptDurationUnit, setApptDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [apptPrice, setApptPrice] = useState("");
  const [apptColor, setApptColor] = useState("#6b7280");
  const [apptCoachId, setApptCoachId] = useState("");
  const [apptStyleId, setApptStyleId] = useState("");
  const [apptNotes, setApptNotes] = useState("");
  const [apptIsActive, setApptIsActive] = useState(true);
  const [savingAppt, setSavingAppt] = useState(false);

  // Schedule popup state
  const [showSchedulePopup, setShowSchedulePopup] = useState(false);
  const [schedulingAppt, setSchedulingAppt] = useState<Appointment | null>(null);
  const [schedApptDate, setSchedApptDate] = useState("");
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
  const [selectedCoachId, setSelectedCoachId] = useState("");
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

  // Get unique class types for appointment dropdown
  const uniqueClassTypes = Array.from(
    new Set(classes.map(c => c.classType).filter((t): t is string => !!t))
  ).sort();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const [classesRes, stylesRes, coachesRes, appointmentsRes, membersRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/styles"),
        fetch("/api/members?status=COACH"),
        fetch("/api/appointments"),
        fetch("/api/members"),
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
    setSelectedCoachId("");
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

    // Set coach
    setSelectedCoachId(classSession.coachId || "");

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
                coachId: selectedCoachId || null,
                coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
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
                coachId: selectedCoachId || null,
                coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
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

  // Appointment functions
  function resetApptForm() {
    setApptTitle("");
    setApptDescription("");
    setApptType("");
    setApptDuration("60");
    setApptDurationUnit("minutes");
    setApptPrice("");
    setApptColor("#6b7280");
    setApptCoachId("");
    setApptStyleId("");
    setApptNotes("");
    setApptIsActive(true);
    setEditingAppt(null);
    setShowApptForm(false);
  }

  function handleEditAppt(appt: Appointment) {
    setEditingAppt(appt);
    setApptTitle(appt.title);
    setApptDescription(appt.description || "");
    setApptType(appt.type || "");
    // Convert duration to hours if it's a multiple of 60
    const duration = appt.duration || 60;
    if (duration >= 60 && duration % 60 === 0) {
      setApptDuration(String(duration / 60));
      setApptDurationUnit("hours");
    } else {
      setApptDuration(String(duration));
      setApptDurationUnit("minutes");
    }
    setApptPrice(appt.priceCents ? String(appt.priceCents / 100) : "");
    setApptColor(appt.color || "#6b7280");
    setApptCoachId(appt.coachId || "");
    setApptStyleId(appt.styleId || "");
    setApptNotes(appt.notes || "");
    setApptIsActive(appt.isActive !== false);
    setShowApptForm(true);
    setTimeout(() => apptFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function handleApptSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!apptTitle.trim()) {
      setError("Appointment title is required");
      return;
    }

    try {
      setSavingAppt(true);
      setError(null);

      const selectedCoach = coaches.find(c => c.id === apptCoachId);
      const selectedStyle = styles.find(s => s.id === apptStyleId);
      const priceCents = apptPrice ? Math.round(parseFloat(apptPrice) * 100) : null;
      // Convert duration to minutes if in hours
      const durationMinutes = apptDurationUnit === "hours"
        ? (parseInt(apptDuration) || 1) * 60
        : parseInt(apptDuration) || 60;

      const apptData = {
        title: apptTitle.trim(),
        description: apptDescription.trim() || null,
        type: apptType.trim() || null,
        duration: durationMinutes,
        priceCents: priceCents,
        color: apptColor,
        coachId: apptCoachId || null,
        coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
        styleId: apptStyleId || null,
        styleName: selectedStyle ? selectedStyle.name : null,
        notes: apptNotes.trim() || null,
        isActive: apptIsActive,
      };

      if (editingAppt) {
        const res = await fetch(`/api/appointments/${editingAppt.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apptData),
        });

        if (!res.ok) {
          throw new Error("Failed to update appointment");
        }

        const data = await res.json();
        setAppointments(appointments.map(a => a.id === editingAppt.id ? data.appointment : a));
      } else {
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apptData),
        });

        if (!res.ok) {
          throw new Error("Failed to create appointment");
        }

        const data = await res.json();
        setAppointments([...appointments, data.appointment]);
      }

      resetApptForm();
    } catch (err: any) {
      console.error("Error saving appointment:", err);
      setError(err.message || "Failed to save appointment");
    } finally {
      setSavingAppt(false);
    }
  }

  async function handleDeleteAppt(id: string, title: string) {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete appointment");
      }

      setAppointments(appointments.filter(a => a.id !== id));
    } catch (err: any) {
      console.error("Error deleting appointment:", err);
      setError(err.message || "Failed to delete appointment");
    }
  }

  // Schedule appointment functions
  function openSchedulePopup(appt: Appointment) {
    setSchedulingAppt(appt);
    // Set default date to today
    const today = new Date().toISOString().split("T")[0];
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

    if (!schedulingAppt || !schedApptDate || !schedApptStartTime || !schedApptEndTime) {
      setError("Please fill in all required fields");
      return;
    }

    try {
      setSavingSchedule(true);
      setError(null);

      const selectedCoach = coaches.find(c => c.id === schedApptCoachId);
      const selectedMember = members.find(m => m.id === schedApptMemberId);

      const res = await fetch("/api/scheduled-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: schedulingAppt.id,
          scheduledDate: schedApptDate,
          startTime: schedApptStartTime,
          endTime: schedApptEndTime,
          memberId: schedApptMemberId || null,
          memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : schedApptMemberName || null,
          coachId: schedApptCoachId || null,
          coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
          notes: schedApptNotes || null,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to schedule appointment");
      }

      // Success - close popup
      closeSchedulePopup();
      // Optionally show success message or redirect to calendar
      alert(`"${schedulingAppt.title}" scheduled for ${new Date(schedApptDate).toLocaleDateString()} at ${schedApptStartTime}`);
    } catch (err: any) {
      console.error("Error scheduling appointment:", err);
      setError(err.message || "Failed to schedule appointment");
    } finally {
      setSavingSchedule(false);
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
            <h1 className="text-2xl font-bold">Classes & Appointments</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage weekly class schedules and special events
            </p>
          </div>
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
                    Class Type (used in style ranks)
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
                <div className="mb-1 grid grid-cols-2 gap-2">
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
                              className="text-base font-bold leading-none text-primary hover:text-primaryDark"
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
                              className="text-[10px] font-black leading-none text-primary hover:text-primaryDark"
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
              <h2 className="text-lg font-semibold">Personal Appointments</h2>
              <button
                onClick={() => {
                  setShowApptForm(true);
                  setTimeout(() => apptFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                }}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Add Appointment
              </button>
            </div>

            {/* Appointment Form */}
            {showApptForm && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <div ref={apptFormRef} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800">
                      {editingAppt ? "Edit Appointment Type" : "New Appointment Type"}
                    </h3>
                    <button
                      onClick={resetApptForm}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>

                  <form onSubmit={handleApptSubmit} className="space-y-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Title <span className="text-primary">*</span>
                      </label>
                      <input
                        type="text"
                        value={apptTitle}
                        onChange={(e) => setApptTitle(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="e.g., Private Lesson"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Style
                      </label>
                      <select
                        value={apptStyleId}
                        onChange={(e) => setApptStyleId(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">No Style</option>
                        {styles.map(style => (
                          <option key={style.id} value={style.id}>
                            {style.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Type
                      </label>
                      <select
                        value={apptType}
                        onChange={(e) => setApptType(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">No Type</option>
                        {uniqueClassTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Coach
                      </label>
                      <select
                        value={apptCoachId}
                        onChange={(e) => setApptCoachId(e.target.value)}
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

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Description
                      </label>
                      <textarea
                        value={apptDescription}
                        onChange={(e) => setApptDescription(e.target.value)}
                        rows={1}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[26px]"
                        placeholder="Brief description"
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Duration
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={apptDuration}
                            onChange={(e) => setApptDuration(e.target.value)}
                            className="no-spinner w-11 rounded-md border border-gray-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <select
                            value={apptDurationUnit}
                            onChange={(e) => setApptDurationUnit(e.target.value as "minutes" | "hours")}
                            className="rounded-md border border-gray-300 px-1 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="minutes">Min</option>
                            <option value="hours">Hr</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Price ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={apptPrice}
                          onChange={(e) => setApptPrice(e.target.value)}
                          className="no-spinner w-16 rounded-md border border-gray-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Color
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={apptColor}
                            onChange={(e) => setApptColor(e.target.value)}
                            className="h-[26px] w-10 cursor-pointer rounded border border-gray-300"
                          />
                          <input
                            type="text"
                            value={apptColor}
                            onChange={(e) => setApptColor(e.target.value)}
                            className="w-16 rounded-md border border-gray-300 px-1 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-1 cursor-pointer pb-1">
                        <input
                          type="checkbox"
                          checked={apptIsActive}
                          onChange={(e) => setApptIsActive(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-xs font-medium text-gray-700">Active</span>
                      </label>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Notes
                      </label>
                      <textarea
                        value={apptNotes}
                        onChange={(e) => setApptNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Additional notes..."
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={savingAppt}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        {savingAppt ? "Saving..." : editingAppt ? "Update" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={resetApptForm}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Appointments List */}
            {appointments.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
                No appointment types configured
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Title</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Duration</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Price</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Style</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Coach</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {appointments.map(appt => {
                      const priceStr = appt.priceCents ? `$${(appt.priceCents / 100).toFixed(2)}` : '-';
                      const durationStr = `${appt.duration} min`;

                      return (
                        <tr key={appt.id} className={`hover:bg-gray-50 ${!appt.isActive ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: appt.color || '#6b7280' }}
                              />
                              <span className="font-medium">{appt.title}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{appt.type || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{durationStr}</td>
                          <td className="px-3 py-2 text-gray-600">{priceStr}</td>
                          <td className="px-3 py-2 text-gray-600">{appt.styleName || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{appt.coachName || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${appt.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {appt.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => openSchedulePopup(appt)}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Schedule
                              </button>
                              <button
                                onClick={() => handleEditAppt(appt)}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteAppt(appt.id, appt.title)}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Delete
                              </button>
                            </div>
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
              {/* Date */}
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

              {/* Time */}
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
