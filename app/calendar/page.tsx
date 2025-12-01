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
  excludedDates: string | null; // JSON array of ISO date strings
  color: string | null;
  coachId: string | null;
  coachName: string | null;
}

interface Coach {
  id: string;
  firstName: string;
  lastName: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  classes: ClassSession[];
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
  const [modalStep, setModalStep] = useState<"view" | "select" | "edit">("view");
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editOption, setEditOption] = useState<"single" | "day" | "range" | "future">("single");
  const [rangeStartDate, setRangeStartDate] = useState("");
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
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState("");

  // Fetch all classes, styles, and members
  useEffect(() => {
    async function fetchData() {
      try {
        const [classesRes, stylesRes, membersRes, countsRes, coachesRes] = await Promise.all([
          fetch("/api/classes"),
          fetch("/api/styles"),
          fetch("/api/members"),
          fetch("/api/attendance/counts"),
          fetch("/api/members?status=COACH")
        ]);

        if (!classesRes.ok || !stylesRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const classesData = await classesRes.json();
        const stylesData = await stylesRes.json();
        const membersData = membersRes.ok ? await membersRes.json() : { members: [] };
        const countsData = countsRes.ok ? await countsRes.json() : { counts: {} };
        const coachesData = coachesRes.ok ? await coachesRes.json() : { members: [] };

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
      const dateStr = clickedDate.toISOString().split("T")[0];
      const res = await fetch(`/api/attendance?classSessionId=${classSession.id}&date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        const warningSet = new Set<string>();
        const confirmedSet = new Set<string>();
        const absentSet = new Set<string>();
        const attendees: MemberWithStyles[] = (data.attendances || []).map((att: { member: { id: string; firstName: string; lastName: string; primaryStyle?: string | null; stylesNotes?: string | null; rank?: string | null }; requirementOverride?: boolean; confirmed?: boolean }) => {
          const m = att.member;
          let memberStyles: MemberStyle[] = [];

          // Track confirmed vs absent status from database
          if (att.confirmed) {
            confirmedSet.add(m.id);
          } else {
            absentSet.add(m.id);
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
          attendanceDate: selectedDate.toISOString().split("T")[0],
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
      const dateStr = selectedDate.toISOString().split("T")[0];
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
          date: selectedDate.toISOString().split("T")[0],
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
          date: selectedDate.toISOString().split("T")[0],
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

  // Send message to selected members
  async function handleSendMessage() {
    if (!messageText.trim() || confirmedMembers.size === 0) return;

    setSendingMessage(true);

    // Get selected member details
    const selectedMembersList = classAttendees.filter(m => confirmedMembers.has(m.id));

    // TODO: Implement actual email/text sending via API
    // For now, just show what would be sent
    const memberNames = selectedMembersList.map(m => `${m.firstName} ${m.lastName}`).join(", ");
    alert(`Message would be sent to: ${memberNames}\n\nMessage: ${messageText}`);

    // Mark members as messaged
    setMessagedMembers(prev => {
      const next = new Set(prev);
      confirmedMembers.forEach(id => next.add(id));
      return next;
    });

    setSendingMessage(false);
    setShowMessageModal(false);
    setMessageText("");
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
  }

  async function handleDeleteClass() {
    if (!selectedClass || !selectedDate) return;

    setDeleting(true);
    try {
      if (editOption === "single") {
        if (selectedClass.isRecurring) {
          // For recurring classes, add the date to excludedDates instead of deleting
          const dateStr = selectedDate.toISOString().split("T")[0];
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
        } else {
          // For non-recurring classes, delete the class session
          const response = await fetch(`/api/classes/${selectedClass.id}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Failed to delete class");
        }
      } else if (editOption === "day") {
        // Delete all classes on this day
        const dateStr = selectedDate.toISOString().split("T")[0];
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
              datesToExclude.push(currentDate.toISOString().split("T")[0]);
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

                  {/* Coach Display */}
                  {selectedClass.coachName && (
                    <div className="mb-3 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1">
                      <span className="text-xs font-medium text-primary">Coach:</span>
                      <span className="text-xs font-medium text-primary">{selectedClass.coachName}</span>
                    </div>
                  )}

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
                          {filteredMembers.map((member) => (
                            <li
                              key={member.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleAddMember(member);
                              }}
                              className="cursor-pointer px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
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
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                {confirmedMembers.size === classAttendees.length && classAttendees.length > 0 ? "Deselect All" : "Select All"}
                              </label>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleBulkConfirm()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBulkMarkAbsent()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Mark Absent
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBulkDelete()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleBulkMessage()}
                                  disabled={confirmedMembers.size === 0}
                                  className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
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
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
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
                                        <span className="text-gray-400">-</span>
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
                      onClick={handleCloseModal}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleEditClick}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit Class
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

                    {/* Form Actions */}
                    <div className="flex justify-between pt-4">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="rounded-md border border-red-600 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
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
      </div>
    </AppLayout>
  );
}
