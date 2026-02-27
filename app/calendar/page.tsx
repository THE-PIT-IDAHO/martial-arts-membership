"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { getTodayString } from "@/lib/dates";

// Helper to get local date string (YYYY-MM-DD) avoiding UTC timezone shift
function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  excludedDates: string | null; // JSON array of ISO date strings
  color: string | null;
  coachId: string | null;
  coachName: string | null;
  maxCapacity: number | null;
  bookingEnabled: boolean;
  bookingCutoffMins: number | null;
  bookingAdvanceDays: number | null;
  kioskEnabled: boolean;
  locationId: string | null;
  spaceId: string | null;
}

interface Coach {
  id: string;
  firstName: string;
  lastName: string;
}

interface ScheduledAppt {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  memberName: string | null;
  coachName: string | null;
  notes: string | null;
  spaceId: string | null;
  appointment: { id: string; title: string };
}

interface CoachAvailabilityBlock {
  id: string;
  coachId: string;
  coachName: string | null;
  appointmentId: string | null;
  startsAt: string;
  endsAt: string;
  isRecurring: boolean;
  frequencyNumber: number | null;
  frequencyUnit: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  isOngoing: boolean;
  excludedDates: string | null;
  color: string | null;
  locationId: string | null;
  spaceId: string | null;
  notes: string | null;
}

interface AppointmentType {
  id: string;
  title: string;
  description: string | null;
  type: string | null;
  duration: number;
  priceCents: number | null;
  color: string | null;
  coachId: string | null;
  coachName: string | null;
  isActive: boolean;
}

interface CalendarEventItem {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  isRecurring: boolean;
  frequencyNumber: number | null;
  frequencyUnit: string | null;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  isOngoing: boolean;
  excludedDates: string | null;
  color: string | null;
  locationId: string | null;
  spaceId: string | null;
  notes: string | null;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  classes: ClassSession[];
  appointments: ScheduledAppt[];
  availabilityBlocks: CoachAvailabilityBlock[];
  events: CalendarEventItem[];
}

interface Style {
  id: string;
  name: string;
  beltConfig?: string | null;
  ranks?: { id: string; name: string }[];
}

interface MemberStyle {
  styleId: string;
  styleName: string;
  rank: string;
  startDate?: string; // When member started this style/rank
}

interface ClassRequirement {
  id: string;
  label: string;
  minCount: number | null;
}

interface MemberWithStyles {
  id: string;
  firstName: string;
  lastName: string;
  primaryStyle?: string | null;
  styles?: MemberStyle[];
}

type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

const DAYS_OF_WEEK: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Helper function to create a tint (lighter version) of a color
function getTintedColor(hexColor: string, tintAmount: number = 0.7): string {
  // Convert hex to RGB
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Mix with white to create a tint
  const tintedR = Math.round(r + (255 - r) * tintAmount);
  const tintedG = Math.round(g + (255 - g) * tintAmount);
  const tintedB = Math.round(b + (255 - b) * tintAmount);

  // Convert back to hex
  return `#${tintedR.toString(16).padStart(2, '0')}${tintedG.toString(16).padStart(2, '0')}${tintedB.toString(16).padStart(2, '0')}`;
}

// Helper function to determine text color based on the original (non-tinted) color
function getTextColorForTint(originalColor: string): string {
  // Convert hex to RGB
  const hex = originalColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // For tinted backgrounds, use darker version of the original color for text
  // If original is very dark, use the original color; otherwise darken it
  if (luminance < 0.3) {
    return originalColor;
  } else {
    // Darken the original color for text
    const darkenedR = Math.round(r * 0.4);
    const darkenedG = Math.round(g * 0.4);
    const darkenedB = Math.round(b * 0.4);
    return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
  }
}


export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [allClasses, setAllClasses] = useState<ClassSession[]>([]);
  const [scheduledAppts, setScheduledAppts] = useState<ScheduledAppt[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("month");
  const [calendarMode, setCalendarMode] = useState<"classes" | "appointments" | "events">("classes");

  // Appointments mode data
  const [availabilityBlocks, setAvailabilityBlocks] = useState<CoachAvailabilityBlock[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);

  // Event modal states
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventModalMode, setEventModalMode] = useState<"create" | "edit">("create");
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDescription, setEvDescription] = useState("");
  const [evStartTime, setEvStartTime] = useState("09:00");
  const [evEndTime, setEvEndTime] = useState("10:00");
  const [evIsAllDay, setEvIsAllDay] = useState(false);
  const [evIsRecurring, setEvIsRecurring] = useState(false);
  const [evFrequencyNumber, setEvFrequencyNumber] = useState("1");
  const [evFrequencyUnit, setEvFrequencyUnit] = useState<"Day" | "Week" | "Month">("Week");
  const [evScheduleStartDate, setEvScheduleStartDate] = useState(getTodayString());
  const [evScheduleEndDate, setEvScheduleEndDate] = useState("");
  const [evIsOngoing, setEvIsOngoing] = useState(true);
  const [evColor, setEvColor] = useState("#3b82f6");
  const [evLocationId, setEvLocationId] = useState("");
  const [evSpaceId, setEvSpaceId] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evSaving, setEvSaving] = useState(false);
  const [evSelectedDate, setEvSelectedDate] = useState<Date | null>(null);

  // Availability modal states
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilityModalMode, setAvailabilityModalMode] = useState<"create" | "edit">("create");
  const [editingAvailability, setEditingAvailability] = useState<CoachAvailabilityBlock | null>(null);
  const [avCoachId, setAvCoachId] = useState("");
  const [avAppointmentId, setAvAppointmentId] = useState("");
  const [avStartTime, setAvStartTime] = useState("09:00");
  const [avEndTime, setAvEndTime] = useState("10:00");
  const [avIsRecurring, setAvIsRecurring] = useState(false);
  const [avFrequencyNumber, setAvFrequencyNumber] = useState("1");
  const [avFrequencyUnit, setAvFrequencyUnit] = useState<"Day" | "Week" | "Month">("Week");
  const [avScheduleStartDate, setAvScheduleStartDate] = useState(getTodayString());
  const [avScheduleEndDate, setAvScheduleEndDate] = useState("");
  const [avIsOngoing, setAvIsOngoing] = useState(true);
  const [avColor, setAvColor] = useState("#6b7280");
  const [avLocationId, setAvLocationId] = useState("");
  const [avSpaceId, setAvSpaceId] = useState("");
  const [avNotes, setAvNotes] = useState("");
  const [avSaving, setAvSaving] = useState(false);
  const [avSelectedDate, setAvSelectedDate] = useState<Date | null>(null);

  // Schedule appointment modal states
  const [showScheduleApptModal, setShowScheduleApptModal] = useState(false);
  const [schedApptTypeId, setSchedApptTypeId] = useState("");
  const [schedMemberSearch, setSchedMemberSearch] = useState("");
  const [schedFilteredMembers, setSchedFilteredMembers] = useState<MemberWithStyles[]>([]);
  const [schedSelectedMember, setSchedSelectedMember] = useState<MemberWithStyles | null>(null);
  const [schedCoachId, setSchedCoachId] = useState("");
  const [schedStartTime, setSchedStartTime] = useState("09:00");
  const [schedEndTime, setSchedEndTime] = useState("10:00");
  const [schedDate, setSchedDate] = useState(getTodayString());
  const [schedNotes, setSchedNotes] = useState("");
  const [schedSpaceId, setSchedSpaceId] = useState("");
  const [schedSaving, setSchedSaving] = useState(false);

  // View appointment modal states
  const [showViewApptModal, setShowViewApptModal] = useState(false);
  const [viewingAppt, setViewingAppt] = useState<ScheduledAppt | null>(null);
  const [viewApptSaving, setViewApptSaving] = useState(false);

  // View availability modal states
  const [showViewAvailabilityModal, setShowViewAvailabilityModal] = useState(false);
  const [viewingAvailability, setViewingAvailability] = useState<CoachAvailabilityBlock | null>(null);
  const [viewAvailabilityDate, setViewAvailabilityDate] = useState<Date | null>(null);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalStep, setModalStep] = useState<"view" | "select" | "edit">("view");
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editOption, setEditOption] = useState<"single" | "day" | "range" | "future">("single");
  const [rangeStartDate, setRangeStartDate] = useState(getTodayString());
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [classAttendees, setClassAttendees] = useState<MemberWithStyles[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [allMembers, setAllMembers] = useState<MemberWithStyles[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberWithStyles[]>([]);
  const [memberClassCounts, setMemberClassCounts] = useState<Record<string, Record<string, number>>>({});
  const [showRequirementError, setShowRequirementError] = useState(false);
  const [requirementErrorMessage, setRequirementErrorMessage] = useState("");
  const [pendingMember, setPendingMember] = useState<MemberWithStyles | null>(null);
  const [membersWithWarnings, setMembersWithWarnings] = useState<Set<string>>(new Set());
  const [confirmedMembers, setConfirmedMembers] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [attendanceConfirmed, setAttendanceConfirmed] = useState<Set<string>>(new Set());
  const [markedAbsent, setMarkedAbsent] = useState<Set<string>>(new Set());
  const [messagedMembers, setMessagedMembers] = useState<Set<string>>(new Set());

  // Edit form states
  const [name, setName] = useState("");
  const [classType, setClassType] = useState("");
  const [selectedStyleIds, setSelectedStyleIds] = useState<string[]>([""]);
  const [minRankId, setMinRankId] = useState("");
  const [minRankIds, setMinRankIds] = useState<string[]>([""]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequencyNumber, setFrequencyNumber] = useState("1");
  const [frequencyUnit, setFrequencyUnit] = useState<"Day" | "Week" | "Month" | "Year">("Week");
  const [scheduleStartDate, setScheduleStartDate] = useState(getTodayString());
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [isOngoing, setIsOngoing] = useState(true);
  const [daySchedules, setDaySchedules] = useState<{
    day: DayOfWeek;
    times: { startTime: string; endTime: string }[];
  }[]>([
    { day: "Monday", times: [{ startTime: "09:00", endTime: "10:00" }] }
  ]);
  const [saving, setSaving] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [kioskEnabled, setKioskEnabled] = useState(false);
  const [maxCapacity, setMaxCapacity] = useState("");
  const [bookingCutoffMins, setBookingCutoffMins] = useState("");
  const [bookingAdvanceDays, setBookingAdvanceDays] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");

  // Fetch all classes, styles, and members
  useEffect(() => {
    async function fetchData() {
      try {
        const [classesRes, stylesRes, membersRes, countsRes, coachesRes, locationsRes, apptsRes, spacesRes, availRes, apptTypesRes, eventsRes] = await Promise.all([
          fetch("/api/classes"),
          fetch("/api/styles"),
          fetch("/api/members"),
          fetch("/api/attendance/counts"),
          fetch("/api/members?status=COACH"),
          fetch("/api/locations"),
          fetch("/api/scheduled-appointments"),
          fetch("/api/spaces"),
          fetch("/api/coach-availability"),
          fetch("/api/appointments"),
          fetch("/api/calendar-events"),
        ]);

        if (!classesRes.ok || !stylesRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const classesData = await classesRes.json();
        const stylesData = await stylesRes.json();
        const membersData = membersRes.ok ? await membersRes.json() : { members: [] };
        const countsData = countsRes.ok ? await countsRes.json() : { counts: {} };
        const coachesData = coachesRes.ok ? await coachesRes.json() : { members: [] };
        const locationsData = locationsRes.ok ? await locationsRes.json() : { locations: [] };
        const apptsData = apptsRes.ok ? await apptsRes.json() : { scheduledAppointments: [] };
        const spacesData = spacesRes.ok ? await spacesRes.json() : { spaces: [] };
        const availData = availRes.ok ? await availRes.json() : { availabilityBlocks: [] };
        const apptTypesData = apptTypesRes.ok ? await apptTypesRes.json() : { appointments: [] };
        const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };
        setAvailabilityBlocks(availData.availabilityBlocks || []);
        setAppointmentTypes((apptTypesData.appointments || []).filter((a: AppointmentType) => a.isActive));
        setCalendarEvents(eventsData.events || []);
        setScheduledAppts((apptsData.scheduledAppointments || []).filter((a: ScheduledAppt) => a.status !== "CANCELLED"));
        setLocations((locationsData.locations || []).filter((l: any) => l.isActive).map((l: any) => ({ id: l.id, name: l.name })));
        setSpaces((spacesData.spaces || []).filter((s: any) => s.isActive).map((s: any) => ({ id: s.id, name: s.name })));

        // Load attendance counts from database
        setMemberClassCounts(countsData.counts || {});

        // Set coaches (members with COACH status)
        setCoaches((coachesData.members || []).map((c: { id: string; firstName: string; lastName: string }) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName
        })));

        setAllClasses(classesData.classes || []);
        const loadedStyles = stylesData.styles || [];
        setStyles(loadedStyles);
        setAllMembers((membersData.members || []).map((m: { id: string; firstName: string; lastName: string; primaryStyle?: string | null; stylesNotes?: string | null; rank?: string | null }) => {
          // Parse styles from stylesNotes JSON array (contains style name and rank)
          let memberStyles: MemberStyle[] = [];

          // Try stylesNotes first - it contains the full style data with ranks
          if (m.stylesNotes) {
            try {
              const parsed = JSON.parse(m.stylesNotes);
              if (Array.isArray(parsed)) {
                memberStyles = parsed.map((styleEntry: { name?: string; rank?: string; startDate?: string }) => {
                  // Find the matching style to get its ID
                  const matchedStyle = loadedStyles.find((s: Style) =>
                    s.name.toLowerCase() === styleEntry.name?.toLowerCase()
                  );
                  return {
                    styleId: matchedStyle?.id || "",
                    styleName: styleEntry.name || "",
                    rank: styleEntry.rank || "",
                    startDate: styleEntry.startDate || ""
                  };
                });
              }
            } catch {
              // Invalid JSON, will fall back to primaryStyle
            }
          }

          // Fall back to primaryStyle if stylesNotes didn't provide data
          if (memberStyles.length === 0 && m.primaryStyle) {
            // Try to find the style by name to get its ID
            const matchedStyle = loadedStyles.find((s: Style) =>
              s.name.toLowerCase() === m.primaryStyle?.toLowerCase()
            );
            if (matchedStyle) {
              memberStyles = [{
                styleId: matchedStyle.id,
                styleName: matchedStyle.name,
                rank: m.rank || "", // Use rank field from member if available
                startDate: ""
              }];
            } else {
              memberStyles = [{
                styleId: "",
                styleName: m.primaryStyle,
                rank: m.rank || "",
                startDate: ""
              }];
            }
          }

          return {
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            primaryStyle: m.primaryStyle,
            styles: memberStyles
          };
        }));
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
        appointments: getApptsForDate(date),
        availabilityBlocks: getAvailabilityForDate(date),
        events: getEventsForDate(date),
      });
    }

    // Add days from current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({
        date,
        isCurrentMonth: true,
        classes: getClassesForDate(date),
        appointments: getApptsForDate(date),
        availabilityBlocks: getAvailabilityForDate(date),
        events: getEventsForDate(date),
      });
    }

    // Add days from next month
    for (let day = 1; day <= daysFromNextMonth; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        isCurrentMonth: false,
        classes: getClassesForDate(date),
        appointments: getApptsForDate(date),
        availabilityBlocks: getAvailabilityForDate(date),
        events: getEventsForDate(date),
      });
    }

    setCalendarDays(days);
  }, [currentDate, allClasses, scheduledAppts, availabilityBlocks, calendarEvents]);

  function getClassesForDate(date: Date): ClassSession[] {
    const dateStr = date.toISOString().split("T")[0];

    return allClasses.filter((classSession) => {
      // Skip "Imported" class types - they're only for rank progress tracking
      if (classSession.classType === "Imported") {
        return false;
      }

      const classStartsAt = new Date(classSession.startsAt);
      const classDate = classStartsAt.toISOString().split("T")[0];

      // Check if this date is excluded for this class
      if (classSession.excludedDates) {
        try {
          const excluded = JSON.parse(classSession.excludedDates) as string[];
          if (excluded.includes(dateStr)) {
            return false;
          }
        } catch {
          // Invalid JSON, ignore
        }
      }

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
    }).sort((a, b) => {
      // Sort by time of day only (hours and minutes), not the full date
      // This is important for recurring classes where the date portion may differ
      const aDate = new Date(a.startsAt);
      const bDate = new Date(b.startsAt);
      const aMinutes = aDate.getHours() * 60 + aDate.getMinutes();
      const bMinutes = bDate.getHours() * 60 + bDate.getMinutes();
      return aMinutes - bMinutes;
    });
  }

  function getApptsForDate(date: Date): ScheduledAppt[] {
    const dateStr = toLocalDateStr(date);
    return scheduledAppts
      .filter((a) => {
        const apptDate = new Date(a.scheduledDate);
        return toLocalDateStr(apptDate) === dateStr;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  function getAvailabilityForDate(date: Date): CoachAvailabilityBlock[] {
    const dateStr = date.toISOString().split("T")[0];

    return availabilityBlocks.filter((block) => {
      const blockStartsAt = new Date(block.startsAt);
      const blockDate = blockStartsAt.toISOString().split("T")[0];

      // Check excluded dates
      if (block.excludedDates) {
        try {
          const excluded = JSON.parse(block.excludedDates) as string[];
          if (excluded.includes(dateStr)) return false;
        } catch { /* ignore */ }
      }

      if (!block.isRecurring) {
        return blockDate === dateStr;
      }

      // For recurring, check day of week
      const blockDayOfWeek = blockStartsAt.getDay();
      const dateDayOfWeek = date.getDay();
      if (blockDayOfWeek !== dateDayOfWeek) return false;

      if (block.scheduleStartDate) {
        const scheduleStart = new Date(block.scheduleStartDate);
        scheduleStart.setHours(0, 0, 0, 0);

        const scheduleEnd = block.isOngoing || !block.scheduleEndDate
          ? new Date(2099, 11, 31)
          : new Date(block.scheduleEndDate);
        scheduleEnd.setHours(23, 59, 59, 999);

        const checkDate = new Date(date);
        checkDate.setHours(12, 0, 0, 0);

        if (checkDate < scheduleStart || checkDate > scheduleEnd) return false;

        if (block.frequencyUnit === "Week") {
          const weeksDiff = Math.floor(
            (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24 * 7)
          );
          return weeksDiff % (block.frequencyNumber || 1) === 0;
        } else if (block.frequencyUnit === "Day") {
          const daysDiff = Math.floor(
            (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysDiff % (block.frequencyNumber || 1) === 0;
        }
      }

      return false;
    }).sort((a, b) => {
      const aDate = new Date(a.startsAt);
      const bDate = new Date(b.startsAt);
      const aMinutes = aDate.getHours() * 60 + aDate.getMinutes();
      const bMinutes = bDate.getHours() * 60 + bDate.getMinutes();
      return aMinutes - bMinutes;
    });
  }

  function getEventsForDate(date: Date): CalendarEventItem[] {
    const dateStr = date.toISOString().split("T")[0];

    return calendarEvents.filter((event) => {
      const eventStartsAt = new Date(event.startsAt);
      const eventDate = eventStartsAt.toISOString().split("T")[0];

      if (event.excludedDates) {
        try {
          const excluded = JSON.parse(event.excludedDates) as string[];
          if (excluded.includes(dateStr)) return false;
        } catch { /* ignore */ }
      }

      if (!event.isRecurring) {
        return eventDate === dateStr;
      }

      const eventDayOfWeek = eventStartsAt.getDay();
      const dateDayOfWeek = date.getDay();
      if (eventDayOfWeek !== dateDayOfWeek) return false;

      if (event.scheduleStartDate) {
        const scheduleStart = new Date(event.scheduleStartDate);
        scheduleStart.setHours(0, 0, 0, 0);

        const scheduleEnd = event.isOngoing || !event.scheduleEndDate
          ? new Date(2099, 11, 31)
          : new Date(event.scheduleEndDate);
        scheduleEnd.setHours(23, 59, 59, 999);

        const checkDate = new Date(date);
        checkDate.setHours(12, 0, 0, 0);

        if (checkDate < scheduleStart || checkDate > scheduleEnd) return false;

        if (event.frequencyUnit === "Week") {
          const weeksDiff = Math.floor(
            (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24 * 7)
          );
          return weeksDiff % (event.frequencyNumber || 1) === 0;
        } else if (event.frequencyUnit === "Day") {
          const daysDiff = Math.floor(
            (checkDate.getTime() - scheduleStart.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysDiff % (event.frequencyNumber || 1) === 0;
        }
      }

      return false;
    }).sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      const aDate = new Date(a.startsAt);
      const bDate = new Date(b.startsAt);
      const aMinutes = aDate.getHours() * 60 + aDate.getMinutes();
      const bMinutes = bDate.getHours() * 60 + bDate.getMinutes();
      return aMinutes - bMinutes;
    });
  }

  function getSpaceName(spaceId: string | null | undefined): string | null {
    if (!spaceId) return null;
    return spaces.find((s) => s.id === spaceId)?.name || null;
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

  async function handleClassClick(classSession: ClassSession, clickedDate: Date) {
    setSelectedClass(classSession);
    setSelectedDate(clickedDate);
    setEditOption("single");
    setRangeStartDate(clickedDate.toISOString().split("T")[0]);
    setRangeEndDate(clickedDate.toISOString().split("T")[0]);
    setModalStep("view");
    setClassAttendees([]);
    setMemberSearch("");
    setFilteredMembers([]);
    setMembersWithWarnings(new Set());
    setConfirmedMembers(new Set());
    setAttendanceConfirmed(new Set());
    setMarkedAbsent(new Set());
    setMessagedMembers(new Set());
    setShowEditModal(true);

    // Load attendance from database
    try {
      const dateStr = toLocalDateStr(clickedDate);
      const res = await fetch(`/api/attendance?classSessionId=${classSession.id}&date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        const warningSet = new Set<string>();
        const confirmedSet = new Set<string>();
        const absentSet = new Set<string>();
        const attendees: MemberWithStyles[] = (data.attendances || []).map((att: { member: { id: string; firstName: string; lastName: string; primaryStyle?: string | null; stylesNotes?: string | null; rank?: string | null }; requirementOverride?: boolean; confirmed?: boolean }) => {
          const m = att.member;
          let memberStyles: MemberStyle[] = [];

          // Track confirmed status from database
          if (att.confirmed) {
            confirmedSet.add(m.id);
          }

          // Try stylesNotes first - it contains the full style data with ranks
          if (m.stylesNotes) {
            try {
              const parsed = JSON.parse(m.stylesNotes);
              if (Array.isArray(parsed)) {
                memberStyles = parsed.map((styleEntry: { name?: string; rank?: string; startDate?: string }) => {
                  // Find the matching style to get its ID
                  const matchedStyle = styles.find((s: Style) =>
                    s.name.toLowerCase() === styleEntry.name?.toLowerCase()
                  );
                  return {
                    styleId: matchedStyle?.id || "",
                    styleName: styleEntry.name || "",
                    rank: styleEntry.rank || "",
                    startDate: styleEntry.startDate || ""
                  };
                });
              }
            } catch {
              // Invalid JSON, will fall back to primaryStyle
            }
          }

          // Fall back to primaryStyle if stylesNotes didn't provide data
          if (memberStyles.length === 0 && m.primaryStyle) {
            const matchedStyle = styles.find((s: Style) =>
              s.name.toLowerCase() === m.primaryStyle?.toLowerCase()
            );
            if (matchedStyle) {
              memberStyles = [{
                styleId: matchedStyle.id,
                styleName: matchedStyle.name,
                rank: m.rank || "",
                startDate: ""
              }];
            } else {
              memberStyles = [{
                styleId: "",
                styleName: m.primaryStyle || "",
                rank: m.rank || "",
                startDate: ""
              }];
            }
          }

          // Track members with requirement override
          if (att.requirementOverride) {
            warningSet.add(m.id);
          }
          return {
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            primaryStyle: m.primaryStyle,
            styles: memberStyles
          };
        });
        setClassAttendees(attendees);
        setMembersWithWarnings(warningSet);
        setAttendanceConfirmed(confirmedSet);
        setMarkedAbsent(absentSet);
      }
    } catch (error) {
      console.error("Error loading attendance:", error);
    }
  }

  function handleEditClick() {
    setModalStep("select");
  }

  function handleMemberSearch(search: string) {
    setMemberSearch(search);
    if (search.trim() === "") {
      setFilteredMembers([]);
      return;
    }
    const searchLower = search.toLowerCase();
    const filtered = allMembers.filter(
      (m) =>
        !classAttendees.some((a) => a.id === m.id) &&
        (`${m.firstName} ${m.lastName}`.toLowerCase().includes(searchLower) ||
          m.firstName.toLowerCase().includes(searchLower) ||
          m.lastName.toLowerCase().includes(searchLower))
    );
    setFilteredMembers(filtered.slice(0, 5)); // Limit to 5 results
  }

  // Check if member meets class requirements (style and minimum rank)
  // Returns all missing requirements in a single message
  function checkMemberRequirements(member: MemberWithStyles): { meets: boolean; reason: string } {
    if (!selectedClass) return { meets: true, reason: "" };

    const missingRequirements: string[] = [];

    // Parse class style requirements
    let classStyleIds: string[] = [];
    if (selectedClass.styleIds) {
      try {
        classStyleIds = JSON.parse(selectedClass.styleIds);
      } catch {
        classStyleIds = [];
      }
    } else if (selectedClass.styleId) {
      classStyleIds = [selectedClass.styleId];
    }

    // Filter out empty/invalid style IDs
    classStyleIds = classStyleIds.filter(id => id && id !== "NO_STYLE");

    console.log("checkMemberRequirements - classStyleIds:", classStyleIds);
    console.log("checkMemberRequirements - styles state length:", styles.length);

    // If no style requirements, member can join
    if (classStyleIds.length === 0) {
      console.log("No style requirements - allowing");
      return { meets: true, reason: "" };
    }

    // Get the names of required styles for display
    const requiredStyleNames = classStyleIds
      .map(id => styles.find(s => s.id === id)?.name)
      .filter(Boolean);

    // Check if member has any styles at all
    if (!member.styles || member.styles.length === 0) {
      missingRequirements.push(`Missing required style: ${requiredStyleNames.join(", ")}`);

      // Also check if there's a rank requirement to display
      if (selectedClass.minRankId && selectedClass.minRankName) {
        missingRequirements.push(`Missing minimum rank requirement: ${selectedClass.minRankName}`);
      }

      return {
        meets: false,
        reason: `${member.firstName} ${member.lastName}:\n• ${missingRequirements.join("\n• ")}`
      };
    }

    // Check style requirement - member needs at least one of the required styles
    // Also check that the style's start date is on or before the class date
    let hasMatchingStyle = false;
    let matchedStyleName = "";
    let matchedMemberStyle: MemberStyle | null = null;
    let styleStartDateAfterClass = false;
    let styleStartDateInfo = "";

    // Get the class date for comparison (use selectedDate)
    const classDate = selectedDate ? new Date(selectedDate) : null;
    if (classDate) {
      classDate.setHours(0, 0, 0, 0);
    }

    for (const requiredStyleId of classStyleIds) {
      const requiredStyle = styles.find(s => s.id === requiredStyleId);
      if (!requiredStyle) continue;

      // Check if member has this style (case-insensitive comparison)
      const memberStyle = member.styles.find(
        ms => ms.styleId === requiredStyleId ||
          ms.styleName?.toLowerCase() === requiredStyle.name?.toLowerCase()
      );

      if (memberStyle) {
        // Check if the style's start date is after the class date
        if (memberStyle.startDate && classDate) {
          const styleStart = new Date(memberStyle.startDate);
          styleStart.setHours(0, 0, 0, 0);

          if (styleStart > classDate) {
            // Member got this style AFTER this class date - doesn't count
            styleStartDateAfterClass = true;
            styleStartDateInfo = `Style "${requiredStyle.name}" was added on ${memberStyle.startDate} (after this class date)`;
            continue; // Try other required styles
          }
        }

        hasMatchingStyle = true;
        matchedStyleName = requiredStyle.name;
        matchedMemberStyle = memberStyle;
        break; // Found a valid matching style
      }
    }

    // Add style requirement error if no matching style
    if (!hasMatchingStyle) {
      if (styleStartDateAfterClass) {
        missingRequirements.push(styleStartDateInfo);
      } else {
        missingRequirements.push(`Missing required style: ${requiredStyleNames.join(", ")}`);
      }
    }

    // Check rank requirement (applies if class has minRankId set)
    if (selectedClass.minRankId && selectedClass.minRankName) {
      if (!hasMatchingStyle) {
        // No style match, so can't check rank - just show rank requirement
        missingRequirements.push(`Missing minimum rank requirement: ${selectedClass.minRankName}`);
      } else if (matchedMemberStyle) {
        // Has the style, check the rank
        const requiredStyleId = classStyleIds.find(id => {
          const s = styles.find(st => st.id === id);
          return s?.name.toLowerCase() === matchedStyleName.toLowerCase();
        });
        const requiredStyle = styles.find(s => s.id === requiredStyleId);

        if (requiredStyle?.beltConfig) {
          try {
            const beltConfig = JSON.parse(requiredStyle.beltConfig);
            if (beltConfig.ranks && Array.isArray(beltConfig.ranks)) {
              const minRank = beltConfig.ranks.find((r: { id: string; name: string }) =>
                r.id === selectedClass.minRankId || r.name === selectedClass.minRankName
              );

              if (minRank) {
                // If member has no rank set
                if (!matchedMemberStyle.rank || matchedMemberStyle.rank.trim() === "") {
                  missingRequirements.push(`No rank assigned (minimum required: ${minRank.name})`);
                } else {
                  const memberRank = beltConfig.ranks.find((r: { name: string }) =>
                    r.name === matchedMemberStyle!.rank
                  );

                  if (!memberRank) {
                    // Member's rank doesn't match any known rank in the system
                    missingRequirements.push(`Rank "${matchedMemberStyle.rank}" is not recognized (minimum required: ${minRank.name})`);
                  } else if (memberRank.order < minRank.order) {
                    missingRequirements.push(`Current rank: ${matchedMemberStyle.rank} (minimum required: ${minRank.name})`);
                  }
                }
              }
            }
          } catch {
            // Invalid JSON, skip rank check
          }
        }
      }
    }

    // Return all missing requirements
    if (missingRequirements.length > 0) {
      return {
        meets: false,
        reason: `${member.firstName} ${member.lastName}:\n• ${missingRequirements.join("\n• ")}`
      };
    }

    return { meets: true, reason: "" };
  }

  async function handleAddMember(member: MemberWithStyles, forceAdd: boolean = false) {
    // Check if member meets requirements
    console.log("handleAddMember called for:", member.firstName, member.lastName);
    console.log("Member styles:", JSON.stringify(member.styles));
    console.log("Selected class:", selectedClass?.name, "styleIds:", selectedClass?.styleIds);
    const { meets, reason } = checkMemberRequirements(member);
    console.log("checkMemberRequirements result:", { meets, reason });
    if (!meets && !forceAdd) {
      console.log("Setting showRequirementError to true");
      setRequirementErrorMessage(reason);
      setPendingMember(member);
      setShowRequirementError(true);
      setMemberSearch("");
      setFilteredMembers([]);
      return;
    }

    if (!selectedClass || !selectedDate) return;

    // Save to database
    try {
      const hasOverride = !meets && forceAdd;
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          classSessionId: selectedClass.id,
          attendanceDate: toLocalDateStr(selectedDate),
          requirementOverride: hasOverride,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to save attendance:", errorText);
        return;
      }

      setClassAttendees([...classAttendees, member]);

      // Track if member was added with a warning (didn't meet requirements)
      if (hasOverride) {
        setMembersWithWarnings(prev => new Set(prev).add(member.id));
      }

      // Note: Attendance count is NOT updated here.
      // Count only increases when attendance is CONFIRMED via the Confirm button.
    } catch (error) {
      console.error("Error saving attendance:", error);
    }

    setMemberSearch("");
    setFilteredMembers([]);
  }

  function handleJoinAnyways() {
    if (pendingMember) {
      handleAddMember(pendingMember, true);
      setShowRequirementError(false);
      setPendingMember(null);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!selectedClass || !selectedDate) return;

    // Delete from database
    try {
      const dateStr = toLocalDateStr(selectedDate);
      const res = await fetch(
        `/api/attendance?memberId=${memberId}&classSessionId=${selectedClass.id}&date=${dateStr}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        console.error("Failed to delete attendance");
        return;
      }

      setClassAttendees(classAttendees.filter((m) => m.id !== memberId));

      // Refresh class counts from database for this member
      try {
        const countsRes = await fetch(`/api/attendance/counts?memberIds=${memberId}`);
        if (countsRes.ok) {
          const countsData = await countsRes.json();
          setMemberClassCounts(prev => ({
            ...prev,
            ...countsData.counts
          }));
        }
      } catch {
        // Fallback to local update if refresh fails
        if (selectedClass?.classType) {
          setMemberClassCounts(prev => ({
            ...prev,
            [memberId]: {
              ...(prev[memberId] || {}),
              [selectedClass.classType!]: Math.max(0, (prev[memberId]?.[selectedClass.classType!] || 0) - 1)
            }
          }));
        }
      }
    } catch (error) {
      console.error("Error deleting attendance:", error);
    }
  }

  // Bulk action: Confirm attendance for selected members
  async function handleBulkConfirm() {
    if (confirmedMembers.size === 0 || !selectedClass || !selectedDate) return;

    const memberIds = Array.from(confirmedMembers);

    try {
      // Call API to confirm attendance in database
      const res = await fetch("/api/attendance/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds,
          classSessionId: selectedClass.id,
          date: toLocalDateStr(selectedDate),
        }),
      });

      if (!res.ok) {
        console.error("Failed to confirm attendance");
        return;
      }

      // Mark selected members as confirmed and remove from absent in UI
      setAttendanceConfirmed(prev => {
        const next = new Set(prev);
        memberIds.forEach(id => next.add(id));
        return next;
      });
      setMarkedAbsent(prev => {
        const next = new Set(prev);
        memberIds.forEach(id => next.delete(id));
        return next;
      });

      // Refresh attendance counts from database
      const countsRes = await fetch(`/api/attendance/counts?memberIds=${memberIds.join(",")}`);
      if (countsRes.ok) {
        const countsData = await countsRes.json();
        setMemberClassCounts(prev => ({
          ...prev,
          ...countsData.counts
        }));
      }
    } catch (error) {
      console.error("Error confirming attendance:", error);
    }
  }

  // Bulk action: Unconfirm attendance (set back to unconfirmed, not absent)
  async function handleBulkUnconfirm() {
    if (confirmedMembers.size === 0 || !selectedClass || !selectedDate) return;

    const memberIds = Array.from(confirmedMembers);

    try {
      const res = await fetch("/api/attendance/confirm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds,
          classSessionId: selectedClass.id,
          date: toLocalDateStr(selectedDate),
        }),
      });

      if (!res.ok) {
        console.error("Failed to unconfirm attendance");
        return;
      }

      // Remove from confirmed set (back to unconfirmed, NOT absent)
      setAttendanceConfirmed(prev => {
        const next = new Set(prev);
        memberIds.forEach(id => next.delete(id));
        return next;
      });
      setMarkedAbsent(prev => {
        const next = new Set(prev);
        memberIds.forEach(id => next.delete(id));
        return next;
      });

      // Refresh attendance counts
      const countsRes = await fetch(`/api/attendance/counts?memberIds=${memberIds.join(",")}`);
      if (countsRes.ok) {
        const countsData = await countsRes.json();
        setMemberClassCounts(prev => ({
          ...prev,
          ...countsData.counts
        }));
      }
    } catch (error) {
      console.error("Error unconfirming attendance:", error);
    }
  }

  // Bulk action: Mark selected members as absent
  async function handleBulkMarkAbsent() {
    if (confirmedMembers.size === 0 || !selectedClass || !selectedDate) return;

    const memberIds = Array.from(confirmedMembers);

    try {
      // Call API to unconfirm attendance in database (mark as absent)
      const res = await fetch("/api/attendance/confirm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds,
          classSessionId: selectedClass.id,
          date: toLocalDateStr(selectedDate),
        }),
      });

      if (!res.ok) {
        console.error("Failed to mark attendance as absent");
        return;
      }

      // Mark selected members as absent and remove from confirmed in UI
      setMarkedAbsent(prev => {
        const next = new Set(prev);
        memberIds.forEach(id => next.add(id));
        return next;
      });
      setAttendanceConfirmed(prev => {
        const next = new Set(prev);
        memberIds.forEach(id => next.delete(id));
        return next;
      });

      // Refresh attendance counts from database
      const countsRes = await fetch(`/api/attendance/counts?memberIds=${memberIds.join(",")}`);
      if (countsRes.ok) {
        const countsData = await countsRes.json();
        setMemberClassCounts(prev => ({
          ...prev,
          ...countsData.counts
        }));
      }
    } catch (error) {
      console.error("Error marking attendance as absent:", error);
    }
  }

  // Bulk action: Delete selected members from the attendance list
  async function handleBulkDelete() {
    if (!selectedClass || !selectedDate || confirmedMembers.size === 0) return;

    const memberIds = Array.from(confirmedMembers);

    for (const memberId of memberIds) {
      await handleRemoveMember(memberId);
    }

    // Clear checkboxes for deleted members (they no longer exist in the list)
    setConfirmedMembers(prev => {
      const next = new Set(prev);
      memberIds.forEach(id => next.delete(id));
      return next;
    });
  }

  // Bulk action: Open message modal for selected members
  function handleBulkMessage() {
    if (confirmedMembers.size === 0) return;
    setMessageText("");
    setShowMessageModal(true);
  }

  // Send message to selected members via email
  async function handleSendMessage() {
    if (!messageText.trim() || confirmedMembers.size === 0) return;

    setSendingMessage(true);
    try {
      const memberIds = [...confirmedMembers];
      const res = await fetch("/api/notifications/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds,
          subject: selectedClass ? `Message about ${selectedClass.name}` : "Message from your gym",
          message: messageText.trim(),
        }),
      });

      if (res.ok) {
        // Mark members as messaged
        setMessagedMembers(prev => {
          const next = new Set(prev);
          confirmedMembers.forEach(id => next.add(id));
          return next;
        });
      }
    } catch {
      // silently fail
    } finally {
      setSendingMessage(false);
      setShowMessageModal(false);
      setMessageText("");
    }
  }

  // Get next rank requirements for a member's style
  function getNextRankRequirements(member: MemberWithStyles, classType: string | null): { styleName: string; requirement: ClassRequirement; fulfilled: number } | null {
    if (!classType || !member.styles || member.styles.length === 0) return null;

    for (const memberStyle of member.styles) {
      const style = styles.find(s => s.id === memberStyle.styleId || s.name === memberStyle.styleName);
      if (!style?.beltConfig) continue;

      try {
        const beltConfig = JSON.parse(style.beltConfig);
        if (!beltConfig.ranks || !Array.isArray(beltConfig.ranks)) continue;

        // Find current rank
        const currentRank = beltConfig.ranks.find((r: { name: string }) => r.name === memberStyle.rank);
        if (!currentRank) continue;

        // Find next rank
        const nextRank = beltConfig.ranks.find((r: { order: number }) => r.order === currentRank.order + 1);
        if (!nextRank || !nextRank.classRequirements) continue;

        // Check if next rank has a requirement for this class type
        const requirement = nextRank.classRequirements.find((req: ClassRequirement) =>
          req.label?.toLowerCase() === classType.toLowerCase() && req.minCount && req.minCount > 0
        );

        if (requirement) {
          const fulfilled = memberClassCounts[member.id]?.[classType] || 0;
          return {
            styleName: memberStyle.styleName || style.name,
            requirement,
            fulfilled
          };
        }
      } catch {
        // Invalid JSON, skip
      }
    }
    return null;
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

    // Set coach
    setSelectedCoachId(selectedClass.coachId || "");

    // Set booking fields
    setBookingEnabled(selectedClass.bookingEnabled || false);
    setKioskEnabled(selectedClass.kioskEnabled || false);
    setMaxCapacity(selectedClass.maxCapacity != null ? String(selectedClass.maxCapacity) : "");
    setBookingCutoffMins(selectedClass.bookingCutoffMins != null ? String(selectedClass.bookingCutoffMins) : "");
    setBookingAdvanceDays(selectedClass.bookingAdvanceDays != null ? String(selectedClass.bookingAdvanceDays) : "");
    setSelectedLocationId(selectedClass.locationId || "");
    setSelectedSpaceId(selectedClass.spaceId || "");

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
      } else if (editOption === "day") {
        // Update all classes on this day
        alert("Editing all classes on this day - implementation needed");
      } else if (editOption === "range") {
        // Update classes within the range
        alert("Editing date range - implementation needed");
      } else if (editOption === "future") {
        // Update all future occurrences
        // This would update the recurring class settings
        const selectedCoach = coaches.find(c => c.id === selectedCoachId);
        const response = await fetch(`/api/classes/${selectedClass.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            classType,
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
    setShowDeleteConfirm(false);

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
    setSelectedCoachId("");
    setBookingEnabled(false);
    setMaxCapacity("");
    setBookingCutoffMins("");
    setBookingAdvanceDays("");
    setSelectedLocationId("");
    setSelectedSpaceId("");
  }

  async function handleDeleteClass() {
    if (!selectedClass || !selectedDate) return;

    setDeleting(true);
    try {
      if (editOption === "single") {
        if (selectedClass.isRecurring) {
          // For recurring classes, add the date to excludedDates instead of deleting
          const dateStr = toLocalDateStr(selectedDate);
          let excludedDates: string[] = [];
          if (selectedClass.excludedDates) {
            try {
              excludedDates = JSON.parse(selectedClass.excludedDates);
            } catch {
              excludedDates = [];
            }
          }
          if (!excludedDates.includes(dateStr)) {
            excludedDates.push(dateStr);
          }

          const response = await fetch(`/api/classes/${selectedClass.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              excludedDates: JSON.stringify(excludedDates),
            }),
          });
          if (!response.ok) throw new Error("Failed to exclude class date");

          // Also delete attendance records for this class on this date
          await fetch(`/api/attendance/by-class?classSessionId=${selectedClass.id}&date=${dateStr}`, {
            method: "DELETE",
          });
        } else {
          // For non-recurring classes, delete the class session
          const response = await fetch(`/api/classes/${selectedClass.id}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Failed to delete class");
        }
      } else if (editOption === "day") {
        // Delete all classes on this day
        const dateStr = toLocalDateStr(selectedDate);
        const classesOnDay = getClassesForDate(selectedDate);

        for (const cls of classesOnDay) {
          if (cls.isRecurring) {
            // For recurring classes, add the date to excludedDates
            let excludedDates: string[] = [];
            if (cls.excludedDates) {
              try {
                excludedDates = JSON.parse(cls.excludedDates);
              } catch {
                excludedDates = [];
              }
            }
            if (!excludedDates.includes(dateStr)) {
              excludedDates.push(dateStr);
            }

            const response = await fetch(`/api/classes/${cls.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                excludedDates: JSON.stringify(excludedDates),
              }),
            });
            if (!response.ok) {
              console.error(`Failed to exclude class ${cls.id} from date`);
            }

            // Also delete attendance records for this class on this date
            await fetch(`/api/attendance/by-class?classSessionId=${cls.id}&date=${dateStr}`, {
              method: "DELETE",
            });
          } else {
            // For non-recurring classes, delete the class session
            const response = await fetch(`/api/classes/${cls.id}`, {
              method: "DELETE",
            });
            if (!response.ok) {
              console.error(`Failed to delete class ${cls.id}`);
            }
          }
        }
      } else if (editOption === "range") {
        // Delete classes within the date range
        const startDate = new Date(rangeStartDate);
        const endDate = new Date(rangeEndDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        if (selectedClass.isRecurring) {
          // For recurring classes, add all dates in range to excludedDates
          const datesToExclude: string[] = [];
          const currentDate = new Date(startDate);
          while (currentDate <= endDate) {
            // Check if this date would normally have this class
            const classesOnDate = getClassesForDate(currentDate);
            if (classesOnDate.some(c => c.id === selectedClass.id)) {
              datesToExclude.push(toLocalDateStr(currentDate));
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }

          if (datesToExclude.length > 0) {
            let excludedDates: string[] = [];
            if (selectedClass.excludedDates) {
              try {
                excludedDates = JSON.parse(selectedClass.excludedDates);
              } catch {
                excludedDates = [];
              }
            }
            // Add new dates without duplicates
            for (const d of datesToExclude) {
              if (!excludedDates.includes(d)) {
                excludedDates.push(d);
              }
            }

            const response = await fetch(`/api/classes/${selectedClass.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                excludedDates: JSON.stringify(excludedDates),
              }),
            });
            if (!response.ok) throw new Error("Failed to exclude class dates");

            // Also delete attendance records for each excluded date
            for (const d of datesToExclude) {
              await fetch(`/api/attendance/by-class?classSessionId=${selectedClass.id}&date=${d}`, {
                method: "DELETE",
              });
            }
          }
        } else {
          // For non-recurring classes, find and delete matching ones
          const classesToDelete = allClasses.filter(cls => {
            if (cls.name !== selectedClass.name) return false;
            const classDate = new Date(cls.startsAt);
            classDate.setHours(0, 0, 0, 0);
            return classDate >= startDate && classDate <= endDate;
          });

          for (const cls of classesToDelete) {
            const response = await fetch(`/api/classes/${cls.id}`, {
              method: "DELETE",
            });
            if (!response.ok) {
              console.error(`Failed to delete class ${cls.id}`);
            }
          }
        }
      } else if (editOption === "future") {
        // Delete this class and all future occurrences
        if (selectedClass.isRecurring) {
          // For recurring classes, set the schedule end date to the day before selected date
          const dayBefore = new Date(selectedDate!);
          dayBefore.setDate(dayBefore.getDate() - 1);

          const response = await fetch(`/api/classes/${selectedClass.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scheduleEndDate: dayBefore.toISOString(),
              isOngoing: false,
            }),
          });
          if (!response.ok) throw new Error("Failed to update class schedule");
        } else {
          // For non-recurring classes, delete the class
          const response = await fetch(`/api/classes/${selectedClass.id}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Failed to delete class");
        }
      }

      // Refresh classes
      const res = await fetch("/api/classes");
      const data = await res.json();
      setAllClasses(data.classes || []);

      handleCloseModal();
    } catch (error) {
      console.error("Error deleting class:", error);
      alert("Failed to delete class");
    } finally {
      setDeleting(false);
    }
  }

  function getDeleteMessage(): string {
    if (!selectedClass) return "";

    if (editOption === "single") {
      return `Are you sure you want to delete this single occurrence of "${selectedClass.name}"? This action cannot be undone.`;
    } else if (editOption === "range") {
      return `Are you sure you want to delete all "${selectedClass.name}" classes from ${rangeStartDate} to ${rangeEndDate}? This action cannot be undone.`;
    } else if (editOption === "future") {
      return `Are you sure you want to delete "${selectedClass.name}" and all future occurrences? This action cannot be undone.`;
    }
    return "";
  }

  // --- Appointments Mode Handlers ---

  function openCreateAvailability(date: Date) {
    setAvailabilityModalMode("create");
    setEditingAvailability(null);
    setAvCoachId("");
    setAvAppointmentId("");
    setAvStartTime("09:00");
    setAvEndTime("10:00");
    setAvIsRecurring(false);
    setAvFrequencyNumber("1");
    setAvFrequencyUnit("Week");
    setAvScheduleStartDate(toLocalDateStr(date));
    setAvScheduleEndDate("");
    setAvIsOngoing(true);
    setAvColor("#6b7280");
    setAvLocationId("");
    setAvSpaceId("");
    setAvNotes("");
    setAvSelectedDate(date);
    setShowAvailabilityModal(true);
  }

  function openEditAvailability(block: CoachAvailabilityBlock, date: Date) {
    setAvailabilityModalMode("edit");
    setEditingAvailability(block);
    setAvCoachId(block.coachId);
    setAvAppointmentId(block.appointmentId || "");
    const startDt = new Date(block.startsAt);
    const endDt = new Date(block.endsAt);
    setAvStartTime(`${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`);
    setAvEndTime(`${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`);
    setAvIsRecurring(block.isRecurring);
    setAvFrequencyNumber(String(block.frequencyNumber || 1));
    setAvFrequencyUnit((block.frequencyUnit as "Day" | "Week" | "Month") || "Week");
    setAvScheduleStartDate(block.scheduleStartDate ? new Date(block.scheduleStartDate).toISOString().split("T")[0] : toLocalDateStr(date));
    setAvScheduleEndDate(block.scheduleEndDate ? new Date(block.scheduleEndDate).toISOString().split("T")[0] : "");
    setAvIsOngoing(block.isOngoing);
    setAvColor(block.color || "#6b7280");
    setAvLocationId(block.locationId || "");
    setAvSpaceId(block.spaceId || "");
    setAvNotes(block.notes || "");
    setAvSelectedDate(date);
    setShowAvailabilityModal(true);
  }

  async function handleSaveAvailability() {
    if (!avCoachId) return;
    setAvSaving(true);
    try {
      const dateStr = avSelectedDate ? toLocalDateStr(avSelectedDate) : avScheduleStartDate;
      const [startH, startM] = avStartTime.split(":").map(Number);
      const [endH, endM] = avEndTime.split(":").map(Number);
      const startsAt = new Date(`${dateStr}T${avStartTime}:00`);
      const endsAt = new Date(`${dateStr}T${avEndTime}:00`);

      const coachObj = coaches.find(c => c.id === avCoachId);
      const coachName = coachObj ? `${coachObj.firstName} ${coachObj.lastName}` : null;

      const payload = {
        coachId: avCoachId,
        coachName,
        appointmentId: avAppointmentId || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        isRecurring: avIsRecurring,
        frequencyNumber: avIsRecurring ? parseInt(avFrequencyNumber) || 1 : null,
        frequencyUnit: avIsRecurring ? avFrequencyUnit : null,
        scheduleStartDate: avIsRecurring ? new Date(`${avScheduleStartDate}T00:00:00`).toISOString() : null,
        scheduleEndDate: avIsRecurring && !avIsOngoing && avScheduleEndDate ? new Date(`${avScheduleEndDate}T23:59:59`).toISOString() : null,
        isOngoing: avIsRecurring ? avIsOngoing : true,
        color: avColor,
        locationId: avLocationId || null,
        spaceId: avSpaceId || null,
        notes: avNotes || null,
      };

      if (availabilityModalMode === "edit" && editingAvailability) {
        await fetch(`/api/coach-availability/${editingAvailability.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/coach-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      // Refresh availability
      const res = await fetch("/api/coach-availability");
      if (res.ok) {
        const data = await res.json();
        setAvailabilityBlocks(data.availabilityBlocks || []);
      }
      setShowAvailabilityModal(false);
    } catch (error) {
      console.error("Error saving availability:", error);
    } finally {
      setAvSaving(false);
    }
  }

  async function handleDeleteAvailability() {
    if (!editingAvailability) return;
    setAvSaving(true);
    try {
      await fetch(`/api/coach-availability/${editingAvailability.id}`, { method: "DELETE" });
      const res = await fetch("/api/coach-availability");
      if (res.ok) {
        const data = await res.json();
        setAvailabilityBlocks(data.availabilityBlocks || []);
      }
      setShowAvailabilityModal(false);
    } catch (error) {
      console.error("Error deleting availability:", error);
    } finally {
      setAvSaving(false);
    }
  }

  function openScheduleApptModal(date: Date, block?: CoachAvailabilityBlock) {
    setSchedApptTypeId("");
    setSchedMemberSearch("");
    setSchedFilteredMembers([]);
    setSchedSelectedMember(null);
    setSchedCoachId(block?.coachId || "");
    const startDt = block ? new Date(block.startsAt) : null;
    const endDt = block ? new Date(block.endsAt) : null;
    setSchedStartTime(startDt ? `${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}` : "09:00");
    setSchedEndTime(endDt ? `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}` : "10:00");
    setSchedDate(toLocalDateStr(date));
    setSchedNotes("");
    setSchedSpaceId(block?.spaceId || "");
    setShowScheduleApptModal(true);
  }

  function handleSchedMemberSearch(search: string) {
    setSchedMemberSearch(search);
    if (search.trim() === "") {
      setSchedFilteredMembers([]);
      return;
    }
    const searchLower = search.toLowerCase();
    const filtered = allMembers.filter(
      (m) =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchLower) ||
        m.firstName.toLowerCase().includes(searchLower) ||
        m.lastName.toLowerCase().includes(searchLower)
    );
    setSchedFilteredMembers(filtered.slice(0, 5));
  }

  async function handleSaveScheduledAppt() {
    if (!schedApptTypeId) return;
    setSchedSaving(true);
    try {
      const coachObj = coaches.find(c => c.id === schedCoachId);
      const coachName = coachObj ? `${coachObj.firstName} ${coachObj.lastName}` : null;

      await fetch("/api/scheduled-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: schedApptTypeId,
          scheduledDate: new Date(`${schedDate}T00:00:00`).toISOString(),
          startTime: schedStartTime,
          endTime: schedEndTime,
          memberId: schedSelectedMember?.id || null,
          memberName: schedSelectedMember ? `${schedSelectedMember.firstName} ${schedSelectedMember.lastName}` : null,
          coachId: schedCoachId || null,
          coachName,
          notes: schedNotes || null,
          spaceId: schedSpaceId || null,
        }),
      });

      // Refresh scheduled appointments
      const res = await fetch("/api/scheduled-appointments");
      if (res.ok) {
        const data = await res.json();
        setScheduledAppts((data.scheduledAppointments || []).filter((a: ScheduledAppt) => a.status !== "CANCELLED"));
      }
      setShowScheduleApptModal(false);
    } catch (error) {
      console.error("Error scheduling appointment:", error);
    } finally {
      setSchedSaving(false);
    }
  }

  function openViewApptModal(appt: ScheduledAppt) {
    setViewingAppt(appt);
    setShowViewApptModal(true);
  }

  async function handleUpdateApptStatus(status: string) {
    if (!viewingAppt) return;
    setViewApptSaving(true);
    try {
      await fetch(`/api/scheduled-appointments/${viewingAppt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const res = await fetch("/api/scheduled-appointments");
      if (res.ok) {
        const data = await res.json();
        setScheduledAppts((data.scheduledAppointments || []).filter((a: ScheduledAppt) => a.status !== "CANCELLED"));
      }
      setShowViewApptModal(false);
    } catch (error) {
      console.error("Error updating appointment:", error);
    } finally {
      setViewApptSaving(false);
    }
  }

  function openViewAvailabilityModal(block: CoachAvailabilityBlock, date: Date) {
    setViewingAvailability(block);
    setViewAvailabilityDate(date);
    setShowViewAvailabilityModal(true);
  }

  // --- Events Mode Handlers ---

  function openCreateEvent(date: Date) {
    setEventModalMode("create");
    setEditingEvent(null);
    setEvTitle("");
    setEvDescription("");
    setEvStartTime("09:00");
    setEvEndTime("10:00");
    setEvIsAllDay(false);
    setEvIsRecurring(false);
    setEvFrequencyNumber("1");
    setEvFrequencyUnit("Week");
    setEvScheduleStartDate(toLocalDateStr(date));
    setEvScheduleEndDate("");
    setEvIsOngoing(true);
    setEvColor("#3b82f6");
    setEvLocationId("");
    setEvSpaceId("");
    setEvNotes("");
    setEvSelectedDate(date);
    setShowEventModal(true);
  }

  function openEditEvent(event: CalendarEventItem, date: Date) {
    setEventModalMode("edit");
    setEditingEvent(event);
    setEvTitle(event.title);
    setEvDescription(event.description || "");
    const startDt = new Date(event.startsAt);
    const endDt = new Date(event.endsAt);
    setEvStartTime(`${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`);
    setEvEndTime(`${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`);
    setEvIsAllDay(event.isAllDay);
    setEvIsRecurring(event.isRecurring);
    setEvFrequencyNumber(String(event.frequencyNumber || 1));
    setEvFrequencyUnit((event.frequencyUnit as "Day" | "Week" | "Month") || "Week");
    setEvScheduleStartDate(event.scheduleStartDate ? new Date(event.scheduleStartDate).toISOString().split("T")[0] : toLocalDateStr(date));
    setEvScheduleEndDate(event.scheduleEndDate ? new Date(event.scheduleEndDate).toISOString().split("T")[0] : "");
    setEvIsOngoing(event.isOngoing);
    setEvColor(event.color || "#3b82f6");
    setEvLocationId(event.locationId || "");
    setEvSpaceId(event.spaceId || "");
    setEvNotes(event.notes || "");
    setEvSelectedDate(date);
    setShowEventModal(true);
  }

  async function handleSaveEvent() {
    if (!evTitle.trim()) return;
    setEvSaving(true);
    try {
      const dateStr = evSelectedDate ? toLocalDateStr(evSelectedDate) : evScheduleStartDate;
      const startsAt = evIsAllDay
        ? new Date(`${dateStr}T00:00:00`)
        : new Date(`${dateStr}T${evStartTime}:00`);
      const endsAt = evIsAllDay
        ? new Date(`${dateStr}T23:59:59`)
        : new Date(`${dateStr}T${evEndTime}:00`);

      const payload = {
        title: evTitle.trim(),
        description: evDescription.trim() || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        isAllDay: evIsAllDay,
        isRecurring: evIsRecurring,
        frequencyNumber: evIsRecurring ? parseInt(evFrequencyNumber) || 1 : null,
        frequencyUnit: evIsRecurring ? evFrequencyUnit : null,
        scheduleStartDate: evIsRecurring ? new Date(`${evScheduleStartDate}T00:00:00`).toISOString() : null,
        scheduleEndDate: evIsRecurring && !evIsOngoing && evScheduleEndDate ? new Date(`${evScheduleEndDate}T23:59:59`).toISOString() : null,
        isOngoing: evIsRecurring ? evIsOngoing : true,
        color: evColor,
        locationId: evLocationId || null,
        spaceId: evSpaceId || null,
        notes: evNotes || null,
      };

      if (eventModalMode === "edit" && editingEvent) {
        await fetch(`/api/calendar-events/${editingEvent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/calendar-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const res = await fetch("/api/calendar-events");
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events || []);
      }
      setShowEventModal(false);
    } catch (error) {
      console.error("Error saving event:", error);
    } finally {
      setEvSaving(false);
    }
  }

  async function handleDeleteEvent() {
    if (!editingEvent) return;
    setEvSaving(true);
    try {
      await fetch(`/api/calendar-events/${editingEvent.id}`, { method: "DELETE" });
      const res = await fetch("/api/calendar-events");
      if (res.ok) {
        const data = await res.json();
        setCalendarEvents(data.events || []);
      }
      setShowEventModal(false);
    } catch (error) {
      console.error("Error deleting event:", error);
    } finally {
      setEvSaving(false);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Calendar</h1>
          <div className="text-sm text-gray-600">Loading classes...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Calendar</h1>

        {/* Calendar Mode Toggle */}
        <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white p-0.5 w-fit">
          <button
            onClick={() => setCalendarMode("classes")}
            className={`rounded px-4 py-1.5 text-xs font-medium ${
              calendarMode === "classes"
                ? "bg-primary text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Classes
          </button>
          <button
            onClick={() => setCalendarMode("appointments")}
            className={`rounded px-4 py-1.5 text-xs font-medium ${
              calendarMode === "appointments"
                ? "bg-primary text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Appointments
          </button>
          <button
            onClick={() => setCalendarMode("events")}
            className={`rounded px-4 py-1.5 text-xs font-medium ${
              calendarMode === "events"
                ? "bg-primary text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Events
          </button>
        </div>

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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {getDateRangeText()}
            </h2>
            <button
              onClick={() => {
                window.open("/api/calendar/export", "_blank");
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              title="Export class schedule as .ics file"
            >
              Export .ics
            </button>
          </div>
        </div>



        {/* Calendar Grid — Classes Mode */}
        {calendarMode === "classes" && viewMode === "day" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="p-4">
              <div className="space-y-2">
                {getClassesForDate(currentDate).length === 0 && getApptsForDate(currentDate).length === 0 && getEventsForDate(currentDate).length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    No classes, appointments, or events scheduled for this day
                  </div>
                ) : (
                  <>
                    {getClassesForDate(currentDate).map((classSession) => {
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

                      const originalColor = classSession.color || "#a3a3a3";
                      const bgColor = getTintedColor(originalColor, 0.7);
                      const textColor = getTextColorForTint(originalColor);
                      const borderColor = originalColor;

                      return (
                        <button
                          key={classSession.id}
                          onClick={() => handleClassClick(classSession, currentDate)}
                          className="w-full rounded-lg border-l-4 border p-4 text-left transition-opacity hover:opacity-90"
                          style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: borderColor, borderColor: bgColor }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">
                                {classSession.name}
                              </div>
                              <div className="text-xs opacity-80">{classSession.classType}</div>
                              {getSpaceName(classSession.spaceId) && (
                                <div className="text-xs opacity-70">{getSpaceName(classSession.spaceId)}</div>
                              )}
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
                    })}
                    {getApptsForDate(currentDate).map((appt) => (
                      <div
                        key={appt.id}
                        className="w-full rounded-lg border-l-4 border border-purple-200 bg-purple-50 p-4 text-left"
                        style={{ borderLeftColor: "#8b5cf6" }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-purple-900">{appt.appointment.title}</div>
                            {appt.memberName && <div className="text-xs text-purple-600">{appt.memberName}</div>}
                            {appt.coachName && <div className="text-xs text-purple-500">Coach: {appt.coachName}</div>}
                            {getSpaceName(appt.spaceId) && <div className="text-xs text-purple-500">{getSpaceName(appt.spaceId)}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-purple-800">{appt.startTime} - {appt.endTime}</div>
                            <div className="text-xs text-purple-500">Appointment</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {getEventsForDate(currentDate).map((event) => {
                      const evStartTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const evEndTime = event.isAllDay ? "" : new Date(event.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const originalColor = event.color || "#3b82f6";
                      const bgColor = getTintedColor(originalColor, 0.7);
                      const textColor = getTextColorForTint(originalColor);
                      return (
                        <button
                          key={`ev-${event.id}`}
                          onClick={() => openEditEvent(event, currentDate)}
                          className="w-full rounded-lg border-l-4 border p-4 text-left transition-opacity hover:opacity-90"
                          style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor, borderColor: bgColor }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">{event.title}</div>
                              {event.description && <div className="text-xs opacity-80">{event.description}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{evStartTime}{evEndTime ? ` - ${evEndTime}` : ""}</div>
                              <div className="text-xs opacity-70">Event</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {calendarMode === "classes" && viewMode === "week" && (
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
                const appts = getApptsForDate(date);
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

                        const originalColor = classSession.color || "#a3a3a3";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        const borderColor = originalColor;

                        return (
                          <button
                            key={classSession.id}
                            onClick={() => handleClassClick(classSession, date)}
                            className="w-full rounded border-l-2 px-2 py-1 text-left text-xs transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: borderColor }}
                          >
                            <div className="font-medium">{startTime}</div>
                            <div className="truncate">{classSession.name}</div>
                            {getSpaceName(classSession.spaceId) && <div className="truncate text-[10px] opacity-70">{getSpaceName(classSession.spaceId)}</div>}
                          </button>
                        );
                      })}
                      {appts.map((appt) => (
                        <div
                          key={appt.id}
                          className="w-full rounded border-l-2 px-2 py-1 text-left text-xs bg-purple-100 border-l-purple-500 text-purple-800"
                          title={`${appt.appointment.title}\n${appt.startTime} – ${appt.endTime}${appt.memberName ? `\n${appt.memberName}` : ""}${getSpaceName(appt.spaceId) ? `\n${getSpaceName(appt.spaceId)}` : ""}`}
                        >
                          <div className="font-medium">{appt.startTime}</div>
                          <div className="truncate">{appt.appointment.title}</div>
                          {appt.memberName && <div className="truncate text-purple-600 text-[10px]">{appt.memberName}</div>}
                        </div>
                      ))}
                      {getEventsForDate(date).map((event) => {
                        const evTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = event.color || "#3b82f6";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        return (
                          <button key={`ev-${event.id}`} onClick={() => openEditEvent(event, date)} className="w-full rounded border-l-2 px-2 py-1 text-left text-xs transition-opacity hover:opacity-90" style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }}>
                            <div className="font-medium">{evTime}</div>
                            <div className="truncate">{event.title}</div>
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

        {calendarMode === "classes" && viewMode === "month" && (
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

                        const originalColor = classSession.color || "#a3a3a3";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        const borderColor = originalColor;

                        return (
                          <button
                            key={classSession.id}
                            onClick={() => handleClassClick(classSession, day.date)}
                            className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: borderColor }}
                            title={`${classSession.name}\n${startTime}${getSpaceName(classSession.spaceId) ? `\n${getSpaceName(classSession.spaceId)}` : ""}${classSession.isRecurring ? "\n(Recurring)" : ""}`}
                          >
                            <div className="truncate font-medium">{startTime}</div>
                            <div className="truncate">{classSession.name}</div>
                          </button>
                        );
                      })}
                      {day.appointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] bg-purple-100 border-l-purple-500 text-purple-800"
                          title={`${appt.appointment.title}\n${appt.startTime} – ${appt.endTime}${appt.memberName ? `\n${appt.memberName}` : ""}${appt.coachName ? `\nCoach: ${appt.coachName}` : ""}${getSpaceName(appt.spaceId) ? `\n${getSpaceName(appt.spaceId)}` : ""}`}
                        >
                          <div className="truncate font-medium">{appt.startTime}</div>
                          <div className="truncate">{appt.appointment.title}</div>
                          {appt.memberName && <div className="truncate text-purple-600">{appt.memberName}</div>}
                        </div>
                      ))}
                      {day.events.map((event) => {
                        const evTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = event.color || "#3b82f6";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        return (
                          <button key={`ev-${event.id}`} onClick={() => openEditEvent(event, day.date)} className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-90" style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }} title={`${event.title}\n${evTime}${event.isRecurring ? "\n(Recurring)" : ""}`}>
                            <div className="truncate font-medium">{evTime}</div>
                            <div className="truncate">{event.title}</div>
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


        {/* ========== Appointments Mode ========== */}

        {/* Appointments Day View */}
        {calendarMode === "appointments" && viewMode === "day" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500">
                  {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => openCreateAvailability(currentDate)}
                    className="rounded-md bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                  >
                    Add Availability
                  </button>
                  <button
                    onClick={() => openScheduleApptModal(currentDate)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primaryDark"
                  >
                    Schedule Appointment
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {getAvailabilityForDate(currentDate).length === 0 && getApptsForDate(currentDate).length === 0 && getEventsForDate(currentDate).length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    No availability, appointments, or events for this day
                  </div>
                ) : (
                  <>
                    {getAvailabilityForDate(currentDate).map((block) => {
                      const startTime = new Date(block.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const endTime = new Date(block.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const originalColor = block.color || "#6b7280";
                      const bgColor = getTintedColor(originalColor, 0.8);
                      const textColor = getTextColorForTint(originalColor);
                      const coachLabel = block.coachName || coaches.find(c => c.id === block.coachId)?.firstName || "Unknown";

                      return (
                        <button
                          key={block.id}
                          onClick={() => openViewAvailabilityModal(block, currentDate)}
                          className="w-full rounded-lg border-l-4 border p-4 text-left transition-opacity hover:opacity-90"
                          style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor, borderColor: bgColor }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">Available: {coachLabel}</div>
                              {block.notes && <div className="text-xs opacity-80">{block.notes}</div>}
                              {getSpaceName(block.spaceId) && <div className="text-xs opacity-70">{getSpaceName(block.spaceId)}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{startTime} - {endTime}</div>
                              {block.isRecurring && <div className="text-xs opacity-70">Recurring</div>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {getApptsForDate(currentDate).map((appt) => (
                      <button
                        key={appt.id}
                        onClick={() => openViewApptModal(appt)}
                        className="w-full rounded-lg border-l-4 border border-purple-200 bg-purple-50 p-4 text-left hover:bg-purple-100 transition-colors"
                        style={{ borderLeftColor: "#8b5cf6" }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-purple-900">{appt.appointment.title}</div>
                            {appt.memberName && <div className="text-xs text-purple-600">{appt.memberName}</div>}
                            {appt.coachName && <div className="text-xs text-purple-500">Coach: {appt.coachName}</div>}
                            {getSpaceName(appt.spaceId) && <div className="text-xs text-purple-500">{getSpaceName(appt.spaceId)}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-purple-800">{appt.startTime} - {appt.endTime}</div>
                            <div className={`text-xs font-medium ${appt.status === "COMPLETED" ? "text-green-600" : appt.status === "CANCELLED" ? "text-red-500" : "text-purple-500"}`}>
                              {appt.status}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                    {getEventsForDate(currentDate).map((event) => {
                      const evStartTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const evEndTime = event.isAllDay ? "" : new Date(event.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                      const originalColor = event.color || "#3b82f6";
                      const bgColor = getTintedColor(originalColor, 0.7);
                      const textColor = getTextColorForTint(originalColor);
                      return (
                        <button key={`ev-${event.id}`} onClick={() => openEditEvent(event, currentDate)} className="w-full rounded-lg border-l-4 border p-4 text-left transition-opacity hover:opacity-90" style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor, borderColor: bgColor }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">{event.title}</div>
                              {event.description && <div className="text-xs opacity-80">{event.description}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">{evStartTime}{evEndTime ? ` - ${evEndTime}` : ""}</div>
                              <div className="text-xs opacity-70">Event</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Appointments Week View */}
        {calendarMode === "appointments" && viewMode === "week" && (
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
                const avails = getAvailabilityForDate(date);
                const appts = getApptsForDate(date);
                const isToday = date.toISOString().split("T")[0] === today.toISOString().split("T")[0];

                return (
                  <div
                    key={index}
                    className={`min-h-[200px] p-2 ${
                      isToday
                        ? "border-[4px] border-primary"
                        : "border-r border-gray-300 last:border-r-0"
                    } bg-white cursor-pointer`}
                    onDoubleClick={() => openCreateAvailability(date)}
                  >
                    <div className="space-y-1">
                      {avails.map((block) => {
                        const startTime = new Date(block.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = block.color || "#6b7280";
                        const bgColor = getTintedColor(originalColor, 0.8);
                        const textColor = getTextColorForTint(originalColor);
                        const coachLabel = block.coachName || coaches.find(c => c.id === block.coachId)?.firstName || "";

                        return (
                          <button
                            key={block.id}
                            onClick={() => openViewAvailabilityModal(block, date)}
                            className="w-full rounded border-l-2 px-2 py-1 text-left text-xs transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }}
                          >
                            <div className="font-medium">{startTime}</div>
                            <div className="truncate">{coachLabel}</div>
                          </button>
                        );
                      })}
                      {appts.map((appt) => (
                        <button
                          key={appt.id}
                          onClick={() => openViewApptModal(appt)}
                          className="w-full rounded border-l-2 px-2 py-1 text-left text-xs bg-purple-100 border-l-purple-500 text-purple-800 hover:bg-purple-200 transition-colors"
                        >
                          <div className="font-medium">{appt.startTime}</div>
                          <div className="truncate">{appt.appointment.title}</div>
                          {appt.memberName && <div className="truncate text-purple-600 text-[10px]">{appt.memberName}</div>}
                        </button>
                      ))}
                      {getEventsForDate(date).map((event) => {
                        const evTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = event.color || "#3b82f6";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        return (
                          <button key={`ev-${event.id}`} onClick={() => openEditEvent(event, date)} className="w-full rounded border-l-2 px-2 py-1 text-left text-xs transition-opacity hover:opacity-90" style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }}>
                            <div className="font-medium">{evTime}</div>
                            <div className="truncate">{event.title}</div>
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

        {/* Appointments Month View */}
        {calendarMode === "appointments" && viewMode === "month" && (
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
                    } cursor-pointer`}
                    onDoubleClick={() => openCreateAvailability(day.date)}
                  >
                    <div
                      className={`mb-1 text-xs font-medium ${
                        day.isCurrentMonth ? "text-gray-900" : "text-gray-400"
                      } ${isToday ? "text-primary font-bold" : ""}`}
                    >
                      {day.date.getDate()}
                    </div>

                    <div className="space-y-0.5">
                      {day.availabilityBlocks.map((block) => {
                        const startTime = new Date(block.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = block.color || "#6b7280";
                        const bgColor = getTintedColor(originalColor, 0.8);
                        const textColor = getTextColorForTint(originalColor);
                        const coachLabel = block.coachName || coaches.find(c => c.id === block.coachId)?.firstName || "";

                        return (
                          <button
                            key={block.id}
                            onClick={() => openViewAvailabilityModal(block, day.date)}
                            className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }}
                            title={`Available: ${coachLabel}\n${startTime}${block.isRecurring ? "\n(Recurring)" : ""}`}
                          >
                            <div className="truncate font-medium">{startTime}</div>
                            <div className="truncate">{coachLabel}</div>
                          </button>
                        );
                      })}
                      {day.appointments.map((appt) => (
                        <button
                          key={appt.id}
                          onClick={() => openViewApptModal(appt)}
                          className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] bg-purple-100 border-l-purple-500 text-purple-800 hover:bg-purple-200 transition-colors"
                          title={`${appt.appointment.title}\n${appt.startTime} – ${appt.endTime}${appt.memberName ? `\n${appt.memberName}` : ""}${appt.coachName ? `\nCoach: ${appt.coachName}` : ""}`}
                        >
                          <div className="truncate font-medium">{appt.startTime}</div>
                          <div className="truncate">{appt.appointment.title}</div>
                          {appt.memberName && <div className="truncate text-purple-600">{appt.memberName}</div>}
                        </button>
                      ))}
                      {day.events.map((event) => {
                        const evTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = event.color || "#3b82f6";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        return (
                          <button key={`ev-${event.id}`} onClick={() => openEditEvent(event, day.date)} className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-90" style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }} title={`${event.title}\n${evTime}${event.isRecurring ? "\n(Recurring)" : ""}`}>
                            <div className="truncate font-medium">{evTime}</div>
                            <div className="truncate">{event.title}</div>
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

        {/* ========== Events Mode ========== */}

        {/* Events Day View */}
        {calendarMode === "events" && viewMode === "day" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500">
                  {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
                <button
                  onClick={() => openCreateEvent(currentDate)}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Add Event
                </button>
              </div>
              <div className="space-y-2">
                {getEventsForDate(currentDate).length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">
                    No events for this day
                  </div>
                ) : (
                  getEventsForDate(currentDate).map((event) => {
                    const startTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                    const endTime = event.isAllDay ? "" : new Date(event.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                    const originalColor = event.color || "#3b82f6";
                    const bgColor = getTintedColor(originalColor, 0.7);
                    const textColor = getTextColorForTint(originalColor);

                    return (
                      <button
                        key={event.id}
                        onClick={() => openEditEvent(event, currentDate)}
                        className="w-full rounded-lg border-l-4 border p-4 text-left transition-opacity hover:opacity-90"
                        style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor, borderColor: bgColor }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold">{event.title}</div>
                            {event.description && <div className="text-xs opacity-80">{event.description}</div>}
                            {getSpaceName(event.spaceId) && <div className="text-xs opacity-70">{getSpaceName(event.spaceId)}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{startTime}{endTime ? ` - ${endTime}` : ""}</div>
                            {event.isRecurring && <div className="text-xs opacity-70">Recurring</div>}
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

        {/* Events Week View */}
        {calendarMode === "events" && viewMode === "week" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-100">
              {getWeekDays(currentDate).map((date, index) => {
                const isToday = date.toISOString().split("T")[0] === today.toISOString().split("T")[0];
                return (
                  <div key={index} className="border-r border-gray-300 px-2 py-2 text-center last:border-r-0">
                    <div className="text-xs font-semibold text-gray-700">{dayNames[date.getDay()]}</div>
                    <div className={`text-sm font-medium ${isToday ? "text-primary font-bold" : "text-gray-900"}`}>{date.getDate()}</div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7">
              {getWeekDays(currentDate).map((date, index) => {
                const events = getEventsForDate(date);
                const isToday = date.toISOString().split("T")[0] === today.toISOString().split("T")[0];
                return (
                  <div
                    key={index}
                    className={`min-h-[200px] p-2 ${isToday ? "border-[4px] border-primary" : "border-r border-gray-300 last:border-r-0"} bg-white cursor-pointer`}
                    onDoubleClick={() => openCreateEvent(date)}
                  >
                    <div className="space-y-1">
                      {events.map((event) => {
                        const startTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = event.color || "#3b82f6";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        return (
                          <button
                            key={event.id}
                            onClick={() => openEditEvent(event, date)}
                            className="w-full rounded border-l-2 px-2 py-1 text-left text-xs transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }}
                          >
                            <div className="font-medium">{startTime}</div>
                            <div className="truncate">{event.title}</div>
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

        {/* Events Month View */}
        {calendarMode === "events" && viewMode === "month" && (
          <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
            <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-100">
              {dayNames.map((day) => (
                <div key={day} className="border-r border-gray-300 px-2 py-2 text-center text-xs font-semibold text-gray-700 last:border-r-0">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, index) => {
                const isToday = day.date.toISOString().split("T")[0] === today.toISOString().split("T")[0];
                return (
                  <div
                    key={index}
                    className={`min-h-[100px] p-1 ${isToday ? "border-[4px] border-primary" : "border-b border-r border-gray-300 last:border-r-0"} ${day.isCurrentMonth ? "bg-white" : "bg-gray-50"} cursor-pointer`}
                    onDoubleClick={() => openCreateEvent(day.date)}
                  >
                    <div className={`mb-1 text-xs font-medium ${day.isCurrentMonth ? "text-gray-900" : "text-gray-400"} ${isToday ? "text-primary font-bold" : ""}`}>
                      {day.date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {day.events.map((event) => {
                        const startTime = event.isAllDay ? "All Day" : new Date(event.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                        const originalColor = event.color || "#3b82f6";
                        const bgColor = getTintedColor(originalColor, 0.7);
                        const textColor = getTextColorForTint(originalColor);
                        return (
                          <button
                            key={event.id}
                            onClick={() => openEditEvent(event, day.date)}
                            className="w-full rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-opacity hover:opacity-90"
                            style={{ backgroundColor: bgColor, color: textColor, borderLeftColor: originalColor }}
                            title={`${event.title}\n${startTime}${event.isRecurring ? "\n(Recurring)" : ""}`}
                          >
                            <div className="truncate font-medium">{startTime}</div>
                            <div className="truncate">{event.title}</div>
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

        {/* Class Modal */}
        {showEditModal && selectedClass && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              {modalStep === "view" ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">
                      {selectedClass.name}
                    </h2>
                    <button
                      onClick={handleCloseModal}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Coach & Location Display */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedClass.coachName && (
                      <div className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1">
                        <span className="text-xs font-medium text-primary">Coach:</span>
                        <span className="text-xs font-medium text-primary">{selectedClass.coachName}</span>
                      </div>
                    )}
                    {selectedClass.locationId && (() => {
                      const loc = locations.find(l => l.id === selectedClass.locationId);
                      return loc ? (
                        <div className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1">
                          <span className="text-xs font-medium text-blue-600">{loc.name}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="mb-4 text-xs text-gray-600">
                    {selectedDate && (
                      <div>
                        {selectedDate.toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                    )}
                    <div className="mt-1">
                      {new Date(selectedClass.startsAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })} - {new Date(selectedClass.endsAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </div>
                    {selectedClass.classType && (
                      <div className="mt-1">Type: {selectedClass.classType}</div>
                    )}
                  </div>

                  {/* Add Member Input */}
                  <div className="mb-4">
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Add Member
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => handleMemberSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && filteredMembers.length > 0) {
                            e.preventDefault();
                            handleAddMember(filteredMembers[0]);
                            setMemberSearch("");
                            setFilteredMembers([]);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setMemberSearch("");
                            setFilteredMembers([]);
                          }, 200);
                        }}
                        placeholder="Search by name..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {filteredMembers.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                          {filteredMembers.map((member, idx) => (
                            <li
                              key={member.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleAddMember(member);
                              }}
                              className={`cursor-pointer px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 ${idx === 0 ? "bg-gray-100" : ""}`}
                            >
                              {member.firstName} {member.lastName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Member List */}
                  <div className="mb-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">
                      Signed In Members ({classAttendees.length})
                    </h3>
                    <div className="max-h-60 overflow-y-auto rounded border border-gray-200">
                      {classAttendees.length === 0 ? (
                        <div className="p-3 text-center text-xs text-gray-500">
                          No members signed in yet
                        </div>
                      ) : (
                        <div>
                          {/* Action Buttons Row */}
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={confirmedMembers.size === classAttendees.length && classAttendees.length > 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setConfirmedMembers(new Set(classAttendees.map(m => m.id)));
                                    } else {
                                      setConfirmedMembers(new Set());
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                                />
                                {confirmedMembers.size === classAttendees.length && classAttendees.length > 0 ? "Deselect All" : "Select All"}
                              </label>
                              <div className="flex items-center gap-1">
                                {(() => {
                                  const selectedIds = Array.from(confirmedMembers);
                                  const allSelectedConfirmed = selectedIds.length > 0 && selectedIds.every(id => attendanceConfirmed.has(id));
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => allSelectedConfirmed ? handleBulkUnconfirm() : handleBulkConfirm()}
                                      disabled={confirmedMembers.size === 0}
                                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {allSelectedConfirmed ? "Unconfirm" : "Confirm"}
                                    </button>
                                  );
                                })()}
                                <button
                                  type="button"
                                  onClick={() => handleBulkMarkAbsent()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Mark Absent
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBulkDelete()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBulkMessage()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Message
                                </button>
                              </div>
                            </div>
                          </div>
                          {/* Member Rows */}
                          <ul className="divide-y divide-gray-200">
                            {classAttendees.map((member) => {
                              // Always check current requirements - show warning until rectified
                              const { meets, reason: warningReason } = checkMemberRequirements(member);
                              const hasWarning = !meets;
                              // Format tooltip: remove member name prefix and convert bullets to simple lines
                              const tooltipText = warningReason
                                .replace(`${member.firstName} ${member.lastName}:\n`, "Missing Requirements:\n")
                                .replace(/• /g, "- ");
                              const isSelected = confirmedMembers.has(member.id);
                              const isConfirmedAttendance = attendanceConfirmed.has(member.id);
                              const isAbsent = markedAbsent.has(member.id);
                              const isMessaged = messagedMembers.has(member.id);
                              const memberCount = memberClassCounts[member.id]?.[selectedClass?.classType || ""] || 0;
                              return (
                                <li key={member.id} className="px-3 py-2 text-xs text-gray-700">
                                  <div className="grid grid-cols-[24px_24px_1fr_auto_80px_70px] gap-2 items-center">
                                    {/* Checkbox */}
                                    <div>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setConfirmedMembers(prev => new Set(prev).add(member.id));
                                          } else {
                                            setConfirmedMembers(prev => {
                                              const next = new Set(prev);
                                              next.delete(member.id);
                                              return next;
                                            });
                                          }
                                        }}
                                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                                      />
                                    </div>
                                    {/* Warning */}
                                    <div className="flex justify-center">
                                      {hasWarning ? (
                                        <span className="text-primary cursor-help" title={tooltipText}>⚠</span>
                                      ) : (
                                        <span className="text-gray-300">-</span>
                                      )}
                                    </div>
                                    {/* Name */}
                                    <div>
                                      <a
                                        href={`/members/${member.id}`}
                                        className="text-primary hover:underline"
                                      >
                                        {member.firstName} {member.lastName}
                                      </a>
                                    </div>
                                    {/* Attendance Count (Style - X/Y) */}
                                    <div className="text-center font-medium text-xs">
                                      {(() => {
                                        const rankReq = getNextRankRequirements(member, selectedClass?.classType || null);
                                        if (rankReq) {
                                          return `${rankReq.styleName} - ${rankReq.fulfilled}/${rankReq.requirement.minCount}`;
                                        }
                                        return memberCount > 0 ? memberCount : "-";
                                      })()}
                                    </div>
                                    {/* Confirmation Status */}
                                    <div className="text-center">
                                      {isConfirmedAttendance ? (
                                        <span className="text-green-600 font-medium">Confirmed</span>
                                      ) : isAbsent ? (
                                        <span className="text-primary font-medium">Absent</span>
                                      ) : (
                                        <span className="text-gray-400">Unconfirmed</span>
                                      )}
                                    </div>
                                    {/* Messaged Status */}
                                    <div className="text-center">
                                      {isMessaged ? (
                                        <span className="text-blue-600 font-medium">Messaged</span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Actions */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleEditClick}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit Class
                    </button>
                    <button
                      onClick={handleCloseModal}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : modalStep === "select" ? (
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
                      <div className="mt-1 text-primary">
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
                        className="mt-0.5 h-4 w-4 text-primary focus:ring-2 focus:ring-primary"
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

                    {/* Edit This Day's Classes Option */}
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-gray-300 p-3 hover:bg-gray-50">
                      <input
                        type="radio"
                        name="editOption"
                        value="day"
                        checked={editOption === "day"}
                        onChange={() => setEditOption("day")}
                        className="mt-0.5 h-4 w-4 text-primary focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          Edit this day&apos;s classes
                        </div>
                        <div className="text-[10px] text-gray-600">
                          Changes will apply to all classes on {selectedDate?.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
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
                        className="mt-0.5 h-4 w-4 text-primary focus:ring-2 focus:ring-primary"
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
                                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                          className="mt-0.5 h-4 w-4 text-primary focus:ring-2 focus:ring-primary"
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
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      onClick={handleCloseModal}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleContinueToEdit}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
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
                          Class Name <span className="text-primary">*</span>
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                                  const newRankIds = [...minRankIds];
                                  newRankIds[index] = "";
                                  setMinRankIds(newRankIds);
                                  if (index === 0) setMinRankId("");
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
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Class Schedule <span className="text-primary">*</span>
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
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
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
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                  required
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Coach Selection */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Coach
                      </label>
                      <select
                        value={selectedCoachId}
                        onChange={(e) => setSelectedCoachId(e.target.value)}
                        style={{ width: '200px' }}
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

                    {/* Location Selection */}
                    {locations.length > 0 && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Location
                        </label>
                        <select
                          value={selectedLocationId}
                          onChange={(e) => setSelectedLocationId(e.target.value)}
                          style={{ width: '200px' }}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">No Location</option>
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Space Selection */}
                    {spaces.length > 0 && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Space
                        </label>
                        <select
                          value={selectedSpaceId}
                          onChange={(e) => setSelectedSpaceId(e.target.value)}
                          style={{ width: '200px' }}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">No Space</option>
                          {spaces.map(space => (
                            <option key={space.id} value={space.id}>
                              {space.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Portal Booking & Kiosk Settings */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="editBookingEnabled"
                            checked={bookingEnabled}
                            onChange={(e) => setBookingEnabled(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                          />
                          <label htmlFor="editBookingEnabled" className="text-xs font-medium text-gray-700 cursor-pointer">
                            Enable Portal Booking
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="editKioskEnabled"
                            checked={kioskEnabled}
                            onChange={(e) => setKioskEnabled(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
                          />
                          <label htmlFor="editKioskEnabled" className="text-xs font-medium text-gray-700 cursor-pointer">
                            Allow Kiosk Sign In
                          </label>
                        </div>
                      </div>

                      {bookingEnabled && (
                        <div className="grid gap-2 grid-cols-3">
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
                              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Book Up To (days)
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={bookingAdvanceDays}
                              onChange={(e) => setBookingAdvanceDays(e.target.value)}
                              placeholder="No limit"
                              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Cutoff (mins)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={bookingCutoffMins}
                              onChange={(e) => setBookingCutoffMins(e.target.value)}
                              placeholder="No cutoff"
                              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Form Actions */}
                    <div className="flex justify-between pt-4">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Delete
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCloseModal}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:bg-gray-300"
                        >
                          {saving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* Requirement Error Popup */}
        {showRequirementError && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                  <span className="text-xl text-primary">⚠</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  Requirement Not Met
                </h3>
              </div>
              <p className="mb-6 whitespace-pre-line text-xs text-gray-600">
                {requirementErrorMessage}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowRequirementError(false);
                    setPendingMember(null);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinAnyways}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Join Anyways
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Popup */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                  <span className="text-xl text-primary">⚠</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  Delete Class
                </h3>
              </div>
              <p className="mb-6 text-xs text-gray-600">
                {getDeleteMessage()}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClass}
                  disabled={deleting}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:bg-gray-300"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Message Modal */}
        {showMessageModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Send Message to {confirmedMembers.size} Member{confirmedMembers.size !== 1 ? "s" : ""}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Recipients: {classAttendees
                    .filter(m => confirmedMembers.has(m.id))
                    .map(m => `${m.firstName} ${m.lastName}`)
                    .join(", ")}
                </p>
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Message
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={4}
                  placeholder="Type your message here..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowMessageModal(false);
                    setMessageText("");
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !messageText.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:bg-gray-300"
                >
                  {sendingMessage ? "Sending..." : "Send Message"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ========== Availability Modal ========== */}
        {showAvailabilityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {availabilityModalMode === "create" ? "Add Availability" : "Edit Availability"}
                </h2>
                <button onClick={() => setShowAvailabilityModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="space-y-4">
                {/* Coach */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Coach *</label>
                  <select value={avCoachId} onChange={(e) => setAvCoachId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">Select coach...</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </div>

                {/* Appointment Type (optional) */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Restrict to Appointment Type (optional)</label>
                  <select value={avAppointmentId} onChange={(e) => setAvAppointmentId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">Any appointment type</option>
                    {appointmentTypes.map((at) => (
                      <option key={at.id} value={at.id}>{at.title}</option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Date</label>
                  <input type="date" value={avScheduleStartDate} onChange={(e) => setAvScheduleStartDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Start Time</label>
                    <input type="time" value={avStartTime} onChange={(e) => setAvStartTime(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">End Time</label>
                    <input type="time" value={avEndTime} onChange={(e) => setAvEndTime(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                  </div>
                </div>

                {/* Recurring */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={avIsRecurring} onChange={(e) => setAvIsRecurring(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-red-600" />
                    Recurring
                  </label>
                </div>

                {avIsRecurring && (
                  <div className="space-y-3 rounded-md border border-gray-200 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">Every</span>
                      <input type="number" min="1" value={avFrequencyNumber} onChange={(e) => setAvFrequencyNumber(e.target.value)} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs" />
                      <select value={avFrequencyUnit} onChange={(e) => setAvFrequencyUnit(e.target.value as "Day" | "Week" | "Month")} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
                        <option value="Day">Day(s)</option>
                        <option value="Week">Week(s)</option>
                        <option value="Month">Month(s)</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={avIsOngoing} onChange={(e) => setAvIsOngoing(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-red-600" />
                        Ongoing (no end date)
                      </label>
                    </div>
                    {!avIsOngoing && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">End Date</label>
                        <input type="date" value={avScheduleEndDate} onChange={(e) => setAvScheduleEndDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                      </div>
                    )}
                  </div>
                )}

                {/* Color */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Color</label>
                  <input type="color" value={avColor} onChange={(e) => setAvColor(e.target.value)} className="h-8 w-12 rounded border border-gray-300 cursor-pointer" />
                </div>

                {/* Location & Space */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Location</label>
                    <select value={avLocationId} onChange={(e) => setAvLocationId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                      <option value="">None</option>
                      {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Space</label>
                    <select value={avSpaceId} onChange={(e) => setAvSpaceId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                      <option value="">None</option>
                      {spaces.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                  <textarea value={avNotes} onChange={(e) => setAvNotes(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Optional notes..." />
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <div>
                  {availabilityModalMode === "edit" && (
                    <button onClick={handleDeleteAvailability} disabled={avSaving} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300">
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAvailabilityModal(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleSaveAvailability} disabled={avSaving || !avCoachId} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:bg-gray-300">
                    {avSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== View Availability Modal ========== */}
        {showViewAvailabilityModal && viewingAvailability && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Coach Availability</h2>
                <button onClick={() => setShowViewAvailabilityModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="space-y-2 text-xs text-gray-700">
                <div><span className="font-medium">Coach:</span> {viewingAvailability.coachName || coaches.find(c => c.id === viewingAvailability.coachId)?.firstName || "Unknown"}</div>
                <div>
                  <span className="font-medium">Time:</span>{" "}
                  {new Date(viewingAvailability.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} -{" "}
                  {new Date(viewingAvailability.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </div>
                {viewingAvailability.isRecurring && (
                  <div><span className="font-medium">Recurring:</span> Every {viewingAvailability.frequencyNumber} {viewingAvailability.frequencyUnit}(s)</div>
                )}
                {viewingAvailability.notes && <div><span className="font-medium">Notes:</span> {viewingAvailability.notes}</div>}
                {getSpaceName(viewingAvailability.spaceId) && <div><span className="font-medium">Space:</span> {getSpaceName(viewingAvailability.spaceId)}</div>}
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => {
                    setShowViewAvailabilityModal(false);
                    if (viewAvailabilityDate) openScheduleApptModal(viewAvailabilityDate, viewingAvailability);
                  }}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700"
                >
                  Schedule Appointment
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowViewAvailabilityModal(false);
                      if (viewAvailabilityDate) openEditAvailability(viewingAvailability, viewAvailabilityDate);
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button onClick={() => setShowViewAvailabilityModal(false)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== Schedule Appointment Modal ========== */}
        {showScheduleApptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Schedule Appointment</h2>
                <button onClick={() => setShowScheduleApptModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="space-y-4">
                {/* Appointment Type */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Appointment Type *</label>
                  <select value={schedApptTypeId} onChange={(e) => setSchedApptTypeId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">Select type...</option>
                    {appointmentTypes.map((at) => (
                      <option key={at.id} value={at.id}>{at.title}{at.duration ? ` (${at.duration} min)` : ""}{at.priceCents ? ` - $${(at.priceCents / 100).toFixed(2)}` : ""}</option>
                    ))}
                  </select>
                </div>

                {/* Member */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Member</label>
                  {schedSelectedMember ? (
                    <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2">
                      <span className="text-xs font-medium text-gray-900">{schedSelectedMember.firstName} {schedSelectedMember.lastName}</span>
                      <button onClick={() => setSchedSelectedMember(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={schedMemberSearch}
                        onChange={(e) => handleSchedMemberSearch(e.target.value)}
                        placeholder="Search by name..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {schedFilteredMembers.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                          {schedFilteredMembers.map((member) => (
                            <li
                              key={member.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSchedSelectedMember(member);
                                setSchedMemberSearch("");
                                setSchedFilteredMembers([]);
                              }}
                              className="cursor-pointer px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                            >
                              {member.firstName} {member.lastName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Coach */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Coach</label>
                  <select value={schedCoachId} onChange={(e) => setSchedCoachId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">Select coach...</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </div>

                {/* Date & Time */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Date</label>
                  <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Start Time</label>
                    <input type="time" value={schedStartTime} onChange={(e) => setSchedStartTime(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">End Time</label>
                    <input type="time" value={schedEndTime} onChange={(e) => setSchedEndTime(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                  </div>
                </div>

                {/* Space */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Space</label>
                  <select value={schedSpaceId} onChange={(e) => setSchedSpaceId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                    <option value="">None</option>
                    {spaces.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                  <textarea value={schedNotes} onChange={(e) => setSchedNotes(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Optional notes..." />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setShowScheduleApptModal(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSaveScheduledAppt} disabled={schedSaving || !schedApptTypeId} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:bg-gray-300">
                  {schedSaving ? "Scheduling..." : "Schedule"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== View Appointment Modal ========== */}
        {showViewApptModal && viewingAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{viewingAppt.appointment.title}</h2>
                <button onClick={() => setShowViewApptModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="space-y-2 text-xs text-gray-700">
                {viewingAppt.memberName && <div><span className="font-medium">Member:</span> {viewingAppt.memberName}</div>}
                {viewingAppt.coachName && <div><span className="font-medium">Coach:</span> {viewingAppt.coachName}</div>}
                <div>
                  <span className="font-medium">Date:</span>{" "}
                  {new Date(viewingAppt.scheduledDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </div>
                <div><span className="font-medium">Time:</span> {viewingAppt.startTime} - {viewingAppt.endTime}</div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span className={`font-semibold ${viewingAppt.status === "COMPLETED" ? "text-green-600" : viewingAppt.status === "CANCELLED" ? "text-red-500" : "text-purple-600"}`}>
                    {viewingAppt.status}
                  </span>
                </div>
                {viewingAppt.notes && <div><span className="font-medium">Notes:</span> {viewingAppt.notes}</div>}
                {getSpaceName(viewingAppt.spaceId) && <div><span className="font-medium">Space:</span> {getSpaceName(viewingAppt.spaceId)}</div>}
              </div>

              <div className="mt-6 flex justify-between">
                <div className="flex gap-2">
                  {viewingAppt.status === "SCHEDULED" && (
                    <>
                      <button
                        onClick={() => handleUpdateApptStatus("COMPLETED")}
                        disabled={viewApptSaving}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-gray-300"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => handleUpdateApptStatus("CANCELLED")}
                        disabled={viewApptSaving}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                <button onClick={() => setShowViewApptModal(false)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== Event Modal ========== */}
        {showEventModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {eventModalMode === "create" ? "Add Event" : "Edit Event"}
                </h2>
                <button onClick={() => setShowEventModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Title *</label>
                  <input type="text" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Event title..." />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Description</label>
                  <textarea value={evDescription} onChange={(e) => setEvDescription(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Optional description..." />
                </div>

                {/* Date */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Date</label>
                  <input type="date" value={evScheduleStartDate} onChange={(e) => setEvScheduleStartDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" />
                </div>

                {/* All Day */}
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={evIsAllDay} onChange={(e) => setEvIsAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-red-600" />
                    All Day Event
                  </label>
                </div>

                {/* Time (if not all day) */}
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

                {/* Recurring */}
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

                {/* Color */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Color</label>
                  <input type="color" value={evColor} onChange={(e) => setEvColor(e.target.value)} className="h-8 w-12 rounded border border-gray-300 cursor-pointer" />
                </div>

                {/* Location & Space */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Location</label>
                    <select value={evLocationId} onChange={(e) => setEvLocationId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                      <option value="">None</option>
                      {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Space</label>
                    <select value={evSpaceId} onChange={(e) => setEvSpaceId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs">
                      <option value="">None</option>
                      {spaces.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                  <textarea value={evNotes} onChange={(e) => setEvNotes(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs" placeholder="Optional notes..." />
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <div>
                  {eventModalMode === "edit" && (
                    <button onClick={handleDeleteEvent} disabled={evSaving} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-gray-300">
                      Delete
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowEventModal(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={handleSaveEvent} disabled={evSaving || !evTitle.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300">
                    {evSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
