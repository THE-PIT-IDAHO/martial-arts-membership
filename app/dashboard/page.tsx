"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import dynamic from "next/dynamic";

const DashboardCharts = dynamic(() => import("@/components/dashboard-charts"), { ssr: false });

type Attendee = {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  confirmed: boolean;
  checkedInAt: string;
  source: string;
};

type ClassToday = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  styleName: string | null;
  classType: string | null;
  color: string | null;
  coachName: string | null;
  attendanceCount: number;
  attendees: Attendee[];
};

type DashboardData = {
  members: {
    total: number;
    active: number;
    prospects: number;
    recent: Array<{
      id: string;
      firstName: string;
      lastName: string;
      status: string;
      createdAt: string;
    }>;
  };
  classesToday: ClassToday[];
  attendance: {
    todayCount: number;
    recentCheckins: Array<{
      id: string;
      checkedInAt: string;
      confirmed: boolean;
      source: string | null;
      member: { id: string; firstName: string; lastName: string };
      classSession: { name: string } | null;
    }>;
  };
  tasks: {
    open: Array<{
      id: string;
      title: string;
      priority: string;
      dueDate: string | null;
      recurrence: string | null;
      assignedRole: string | null;
    }>;
    overdueCount: number;
  };
  revenue: {
    todayPosCents: number;
    todayTransactionCount: number;
    monthPosCents: number;
    monthTransactionCount: number;
    monthlyRecurringRevenue: number;
    activeMembershipCount: number;
  };
  appointments: Array<{
    id: string;
    startTime: string;
    endTime: string;
    memberName: string | null;
    coachName: string | null;
    status: string;
    appointment: { title: string; color: string | null };
  }>;
  billing: {
    pastDueCount: number;
    upcomingBillings: Array<{
      id: string;
      nextPaymentDate: string;
      customPriceCents: number | null;
      member: { id: string; firstName: string; lastName: string };
      membershipPlan: { name: string; priceCents: number | null; billingCycle: string };
    }>;
    pastDueInvoices: Array<{
      id: string;
      amountCents: number;
      dueDate: string;
      member: { id: string; firstName: string; lastName: string };
      membership: { membershipPlan: { name: string } };
    }>;
  };
  expiringMemberships: Array<{
    id: string;
    endDate: string;
    member: { id: string; firstName: string; lastName: string };
    membershipPlan: { name: string };
  }>;
  lowStockItems: Array<{
    id: string;
    name: string;
    stock: number;
    threshold: number;
  }>;
  eligibleForPromotion: Array<{
    memberId: string;
    memberName: string;
    styleName: string;
    currentRank: string;
    nextRank: string;
    requirementsMet: Array<{ label: string; count: number; required: number }>;
  }>;
  activeTrials: Array<{
    id: string;
    memberId: string;
    memberName: string;
    classesUsed: number;
    maxClasses: number;
    expiresAt: string;
    daysRemaining: number;
  }>;
};

type SearchMember = {
  id: string;
  firstName: string;
  lastName: string;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Class attendance modal state
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkedMembers, setCheckedMembers] = useState<Set<string>>(new Set());

  const loadDashboard = useCallback(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Auto-run billing + lifecycle emails on first dashboard load of the day (fire and forget)
    Promise.all([
      fetch("/api/billing/auto-run", { method: "POST" }).catch(() => {}),
      fetch("/api/lifecycle/auto-run", { method: "POST" }).catch(() => {}),
    ]).then(() => loadDashboard()).catch(() => loadDashboard());
  }, [loadDashboard]);

  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function formatShortDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatCents(cents: number) {
    return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function isOverdue(dueDate: string | null) {
    if (!dueDate) return false;
    const d = new Date(dueDate);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  }

  function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const priorityBadge = (p: string) => {
    switch (p) {
      case "HIGH": return "bg-red-100 text-red-700";
      case "MEDIUM": return "bg-yellow-100 text-yellow-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "ACTIVE": return "bg-green-100 text-green-700";
      case "PROSPECT": return "bg-blue-100 text-blue-700";
      case "TRIAL": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  // --- Interactive class functions ---

  async function searchMembers(query: string) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/members?search=${encodeURIComponent(query)}&limit=8`);
      if (res.ok) {
        const json = await res.json();
        const members = json.members || json;
        setSearchResults(
          (Array.isArray(members) ? members : []).map((m: SearchMember) => ({
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
          }))
        );
      }
    } catch { /* ignore */ }
    setSearching(false);
  }

  async function addMemberToClass(classId: string, memberId: string) {
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          classSessionId: classId,
          attendanceDate: todayDateStr(),
        }),
      });
      if (res.ok || res.status === 409) {
        setMemberSearch("");
        setSearchResults([]);
        loadDashboard();
      }
    } catch { /* ignore */ }
  }

  async function toggleConfirm(attendee: Attendee, classId: string) {
    const endpoint = "/api/attendance/confirm";
    const method = attendee.confirmed ? "DELETE" : "POST";
    try {
      await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: [attendee.memberId],
          classSessionId: classId,
          date: todayDateStr(),
        }),
      });
      loadDashboard();
    } catch { /* ignore */ }
  }

  async function removeMemberFromClass(attendanceId: string) {
    try {
      await fetch(`/api/attendance?id=${attendanceId}`, { method: "DELETE" });
      loadDashboard();
    } catch { /* ignore */ }
  }

  async function confirmAll(cls: ClassToday) {
    const unconfirmedIds = cls.attendees.filter((a) => !a.confirmed).map((a) => a.memberId);
    if (unconfirmedIds.length === 0) return;
    try {
      await fetch("/api/attendance/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: unconfirmedIds,
          classSessionId: cls.id,
          date: todayDateStr(),
        }),
      });
      loadDashboard();
    } catch { /* ignore */ }
  }

  const selectedClass = data?.classesToday.find((c) => c.id === selectedClassId) ?? null;

  function openClassModal(cls: ClassToday) {
    setSelectedClassId(cls.id);
    setMemberSearch("");
    setSearchResults([]);
    setCheckedMembers(new Set());
  }

  function closeClassModal() {
    setSelectedClassId(null);
    setMemberSearch("");
    setSearchResults([]);
    setCheckedMembers(new Set());
  }

  async function handleBulkConfirm(cls: ClassToday) {
    const ids = [...checkedMembers].filter((id) =>
      cls.attendees.some((a) => a.memberId === id && !a.confirmed)
    );
    if (ids.length === 0) return;
    try {
      await fetch("/api/attendance/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: ids,
          classSessionId: cls.id,
          date: todayDateStr(),
        }),
      });
      setCheckedMembers(new Set());
      loadDashboard();
    } catch { /* ignore */ }
  }

  async function handleBulkMarkAbsent(cls: ClassToday) {
    const ids = [...checkedMembers].filter((id) =>
      cls.attendees.some((a) => a.memberId === id && a.confirmed)
    );
    if (ids.length === 0) return;
    try {
      await fetch("/api/attendance/confirm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: ids,
          classSessionId: cls.id,
          date: todayDateStr(),
        }),
      });
      setCheckedMembers(new Set());
      loadDashboard();
    } catch { /* ignore */ }
  }

  async function handleBulkDelete(cls: ClassToday) {
    const toDelete = cls.attendees.filter((a) => checkedMembers.has(a.memberId));
    if (toDelete.length === 0) return;
    try {
      for (const att of toDelete) {
        await fetch(`/api/attendance?id=${att.id}`, { method: "DELETE" });
      }
      setCheckedMembers(new Set());
      loadDashboard();
    } catch { /* ignore */ }
  }

  // Determine class time status
  function classTimeStatus(cls: ClassToday) {
    const now = new Date();
    const start = new Date(cls.startsAt);
    const end = new Date(cls.endsAt);
    // Use only the time portion for today
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();
    if (nowMins < startMins) return "upcoming";
    if (nowMins >= startMins && nowMins <= endMins) return "in-progress";
    return "completed";
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">{dateStr}</p>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading dashboard...</div>
        ) : !data ? (
          <div className="text-sm text-gray-500">Failed to load dashboard data.</div>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-6">
              <div
                className="rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => router.push("/members")}
              >
                <p className="text-xs font-semibold uppercase text-gray-500">Active Members</p>
                <p className="mt-1 text-2xl font-bold">{data.members.active}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {data.members.total} total &middot; {data.members.prospects} prospects
                </p>
              </div>

              <div
                className="rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => router.push("/classes")}
              >
                <p className="text-xs font-semibold uppercase text-gray-500">Classes Today</p>
                <p className="mt-1 text-2xl font-bold">{data.classesToday.length}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {data.classesToday.length === 0
                    ? "No classes scheduled"
                    : `Next: ${formatTime(data.classesToday[0].startsAt)}`}
                </p>
              </div>

              <div
                className="rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => router.push("/classes")}
              >
                <p className="text-xs font-semibold uppercase text-gray-500">Check-ins Today</p>
                <p className="mt-1 text-2xl font-bold">{data.attendance.todayCount}</p>
                <p className="text-xs text-gray-400 mt-1">Total attendance</p>
              </div>

              <div
                className="rounded-lg border border-gray-200 bg-white p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => router.push("/tasks")}
              >
                <p className="text-xs font-semibold uppercase text-gray-500">Open Tasks</p>
                <p className="mt-1 text-2xl font-bold">{data.tasks.open.length}</p>
                {data.tasks.overdueCount > 0 ? (
                  <p className="text-xs text-red-600 font-semibold mt-1">
                    {data.tasks.overdueCount} overdue
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">All on track</p>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">Today&apos;s Revenue</p>
                <p className="mt-1 text-2xl font-bold">{formatCents(data.revenue.todayPosCents)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {data.revenue.todayTransactionCount} transaction{data.revenue.todayTransactionCount !== 1 ? "s" : ""}
                </p>
              </div>

              <div
                className={`rounded-lg border bg-white p-4 cursor-pointer hover:border-primary transition-colors ${
                  data.billing.pastDueCount > 0 ? "border-red-300 bg-red-50" : "border-gray-200"
                }`}
                onClick={() => router.push("/memberships")}
              >
                <p className="text-xs font-semibold uppercase text-gray-500">Past Due</p>
                <p className={`mt-1 text-2xl font-bold ${data.billing.pastDueCount > 0 ? "text-red-600" : ""}`}>
                  {data.billing.pastDueCount}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {data.billing.upcomingBillings.length} upcoming
                </p>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {/* Today's Schedule + Attendance Detail (side-by-side) */}
              <div className="lg:col-span-2 grid gap-4 grid-cols-1 lg:grid-cols-2">
                {/* Schedule List */}
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-gray-900">Today&apos;s Schedule</h2>
                    <button
                      onClick={() => router.push("/calendar")}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      View Calendar
                    </button>
                  </div>
                  {data.classesToday.length === 0 && data.appointments.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">
                      No classes or appointments today.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {data.classesToday.map((cls) => {
                        const status = classTimeStatus(cls);
                        const confirmedCount = cls.attendees.filter((a) => a.confirmed).length;
                        const isSelected = selectedClassId === cls.id;

                        return (
                          <div
                            key={cls.id}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                              isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-gray-50"
                            }`}
                            onClick={() => openClassModal(cls)}
                          >
                            <div
                              className="h-10 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: cls.color || "#a3a3a3" }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">{cls.name}</p>
                                {status === "in-progress" && (
                                  <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 animate-pulse">
                                    LIVE
                                  </span>
                                )}
                                {status === "completed" && (
                                  <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500">
                                    DONE
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">
                                {formatTime(cls.startsAt)} &ndash; {formatTime(cls.endsAt)}
                                {cls.coachName && <span> &middot; {cls.coachName}</span>}
                                {cls.styleName && <span> &middot; {cls.styleName}</span>}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-sm font-semibold text-gray-700">
                                {cls.attendees.length}
                              </span>
                              <span className="text-xs text-gray-400 ml-1">
                                signed in
                              </span>
                              {confirmedCount > 0 && (
                                <p className="text-xs text-green-600">{confirmedCount} confirmed</p>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Appointments */}
                      {data.appointments.map((appt) => (
                        <div key={appt.id} className="flex items-center gap-3 px-4 py-3">
                          <div
                            className="h-10 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: appt.appointment.color || "#6b7280" }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {appt.appointment.title}
                            </p>
                            <p className="text-xs text-gray-400">
                              {appt.startTime} &ndash; {appt.endTime}
                              {appt.memberName && <span> &middot; {appt.memberName}</span>}
                            </p>
                          </div>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            appt.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {appt.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attendance Detail Panel */}
                <div className="rounded-lg border border-gray-200 bg-white">
                  {!selectedClass ? (
                    <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-gray-400">
                      Select a class to view attendance
                    </div>
                  ) : (
                    <>
                      {/* Detail Header */}
                      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="h-6 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: selectedClass.color || "#a3a3a3" }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">{selectedClass.name}</p>
                              {classTimeStatus(selectedClass) === "in-progress" && (
                                <span className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 animate-pulse">
                                  LIVE
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400">
                              {formatTime(selectedClass.startsAt)} &ndash; {formatTime(selectedClass.endsAt)}
                              {selectedClass.coachName && <span> &middot; {selectedClass.coachName}</span>}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={closeClassModal}
                          className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Add Member Search */}
                      <div className="border-b border-gray-100 px-4 py-2">
                        <div className="relative">
                          <input
                            type="text"
                            value={memberSearch}
                            onChange={(e) => {
                              setMemberSearch(e.target.value);
                              searchMembers(e.target.value);
                            }}
                            placeholder="Search member to add..."
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          {memberSearch.length >= 2 && (
                            <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                              {searching ? (
                                <li className="px-3 py-2 text-xs text-gray-400">Searching...</li>
                              ) : searchResults.filter((m) => !selectedClass.attendees.some((a) => a.memberId === m.id)).length === 0 ? (
                                <li className="px-3 py-2 text-xs text-gray-400">No members found</li>
                              ) : (
                                searchResults
                                  .filter((m) => !selectedClass.attendees.some((a) => a.memberId === m.id))
                                  .map((m) => (
                                    <li
                                      key={m.id}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        addMemberToClass(selectedClass.id, m.id);
                                      }}
                                      className="cursor-pointer px-3 py-2 text-sm text-gray-700 hover:bg-primary hover:text-white"
                                    >
                                      {m.firstName} {m.lastName}
                                    </li>
                                  ))
                              )}
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* Select All + Bulk Actions */}
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checkedMembers.size === selectedClass.attendees.length && selectedClass.attendees.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setCheckedMembers(new Set(selectedClass.attendees.map((a) => a.memberId)));
                                } else {
                                  setCheckedMembers(new Set());
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                            />
                            {checkedMembers.size === selectedClass.attendees.length && selectedClass.attendees.length > 0
                              ? "Deselect All"
                              : `Select All (${selectedClass.attendees.length})`}
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleBulkConfirm(selectedClass)}
                              disabled={checkedMembers.size === 0}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBulkMarkAbsent(selectedClass)}
                              disabled={checkedMembers.size === 0}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Mark Absent
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBulkDelete(selectedClass)}
                              disabled={checkedMembers.size === 0}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Attendee List */}
                      <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 300px)" }}>
                        {selectedClass.attendees.length === 0 ? (
                          <div className="text-center text-sm text-gray-400 py-8">
                            No one signed in yet.
                          </div>
                        ) : (
                          <ul className="divide-y divide-gray-100">
                            {selectedClass.attendees.map((att) => {
                              const isChecked = checkedMembers.has(att.memberId);
                              return (
                                <li key={att.id} className="px-4 py-2 hover:bg-gray-50">
                                  <div className="grid grid-cols-[24px_1fr_auto_70px] gap-2 items-center">
                                    {/* Checkbox */}
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const next = new Set(checkedMembers);
                                        if (e.target.checked) {
                                          next.add(att.memberId);
                                        } else {
                                          next.delete(att.memberId);
                                        }
                                        setCheckedMembers(next);
                                      }}
                                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                                    />
                                    {/* Name + source */}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <a
                                        href={`/members/${att.memberId}`}
                                        className="text-sm text-primary hover:underline truncate"
                                      >
                                        {att.firstName} {att.lastName}
                                      </a>
                                      {att.source === "KIOSK" && (
                                        <span className="text-[10px] rounded bg-blue-50 text-blue-600 px-1 shrink-0">KIOSK</span>
                                      )}
                                    </div>
                                    {/* Time */}
                                    <span className="text-[10px] text-gray-400 shrink-0">
                                      {formatTime(att.checkedInAt)}
                                    </span>
                                    {/* Status */}
                                    <div className="text-center">
                                      {att.confirmed ? (
                                        <span className="text-[11px] text-green-600 font-medium">Confirmed</span>
                                      ) : (
                                        <span className="text-[11px] text-gray-400">-</span>
                                      )}
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Revenue Summary */}
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Revenue</h2>
                  <span className="text-xs text-gray-400">This Month</span>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Today&apos;s Sales</p>
                      <p className="text-lg font-bold text-gray-900">{formatCents(data.revenue.todayPosCents)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Transactions</p>
                      <p className="text-lg font-bold text-gray-900">{data.revenue.todayTransactionCount}</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Month-to-Date</p>
                      <p className="text-lg font-bold text-gray-900">{formatCents(data.revenue.monthPosCents)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Transactions</p>
                      <p className="text-lg font-bold text-gray-900">{data.revenue.monthTransactionCount}</p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-500">Monthly Recurring Revenue (MRR)</p>
                    <p className="text-lg font-bold text-green-600">{formatCents(data.revenue.monthlyRecurringRevenue)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      From {data.revenue.activeMembershipCount} active membership{data.revenue.activeMembershipCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tasks */}
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
                  <button
                    onClick={() => router.push("/tasks")}
                    className="text-xs text-primary hover:text-primaryDark font-medium"
                  >
                    View All
                  </button>
                </div>
                {data.tasks.open.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    No open tasks. Nice work!
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {data.tasks.open.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{task.title}</p>
                          {task.dueDate && (
                            <p className={`text-xs ${isOverdue(task.dueDate) ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                              {isOverdue(task.dueDate) ? "Overdue: " : "Due: "}
                              {formatShortDate(task.dueDate)}
                            </p>
                          )}
                        </div>
                        {task.assignedRole && (
                          <span className="inline-block rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                            {task.assignedRole === "FRONT_DESK" ? "Front Desk" : task.assignedRole.charAt(0) + task.assignedRole.slice(1).toLowerCase()}
                          </span>
                        )}
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${priorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Check-ins */}
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Recent Check-ins</h2>
                  <span className="text-xs text-gray-400">Today</span>
                </div>
                {data.attendance.recentCheckins.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    No check-ins yet today.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {data.attendance.recentCheckins.map((checkin) => (
                      <div
                        key={checkin.id}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/members/${checkin.member.id}`)}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {checkin.member.firstName} {checkin.member.lastName}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {checkin.classSession && (
                              <span className="text-xs text-gray-400">{checkin.classSession.name}</span>
                            )}
                            {checkin.source === "KIOSK" && (
                              <span className="text-[10px] rounded bg-blue-50 text-blue-600 px-1">KIOSK</span>
                            )}
                            {checkin.confirmed && (
                              <span className="text-[10px] rounded bg-green-50 text-green-600 px-1">Confirmed</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatTime(checkin.checkedInAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alerts & Notices */}
              <div className="space-y-4">
                {/* Past Due Members */}
                {data.billing.pastDueInvoices.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-white">
                    <div className="flex items-center justify-between border-b border-red-100 px-4 py-3">
                      <h2 className="text-sm font-semibold text-red-700">Past Due</h2>
                      <span className="text-xs text-red-400">{data.billing.pastDueCount} invoice{data.billing.pastDueCount !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.billing.pastDueInvoices.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/members/${inv.member.id}`)}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {inv.member.firstName} {inv.member.lastName}
                            </p>
                            <p className="text-xs text-gray-400">{inv.membership.membershipPlan.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-red-600">{formatCents(inv.amountCents)}</p>
                            <p className="text-[10px] text-gray-400">Due {formatShortDate(inv.dueDate)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Billings */}
                {data.billing.upcomingBillings.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <h2 className="text-sm font-semibold text-gray-900">Upcoming Billings</h2>
                      <span className="text-xs text-gray-400">Next 7 days</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.billing.upcomingBillings.map((ms) => (
                        <div
                          key={ms.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/members/${ms.member.id}`)}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {ms.member.firstName} {ms.member.lastName}
                            </p>
                            <p className="text-xs text-gray-400">{ms.membershipPlan.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-gray-700">
                              {formatCents(ms.customPriceCents ?? ms.membershipPlan.priceCents ?? 0)}
                            </p>
                            <p className="text-[10px] text-gray-400">{formatShortDate(ms.nextPaymentDate)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Promotion Eligible */}
                {data.eligibleForPromotion.length > 0 && (
                  <div className="rounded-lg border border-green-200 bg-white">
                    <div className="flex items-center justify-between border-b border-green-100 px-4 py-3">
                      <h2 className="text-sm font-semibold text-green-700">Promotion Eligible</h2>
                      <button
                        onClick={() => router.push("/promotions")}
                        className="text-xs text-primary hover:text-primaryDark font-medium"
                      >
                        Promotions
                      </button>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.eligibleForPromotion.map((p, i) => (
                        <div
                          key={`${p.memberId}-${p.styleName}-${i}`}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/members/${p.memberId}`)}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{p.memberName}</p>
                            <p className="text-xs text-gray-400">
                              {p.styleName}: {p.currentRank} → {p.nextRank}
                            </p>
                          </div>
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            Ready
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trial Members */}
                {data.activeTrials && data.activeTrials.length > 0 && (
                  <div className="rounded-lg border border-purple-200 bg-white">
                    <div className="flex items-center justify-between border-b border-purple-100 px-4 py-3">
                      <h2 className="text-sm font-semibold text-purple-700">Trial Members</h2>
                      <span className="text-xs text-purple-400">{data.activeTrials.length} active</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.activeTrials.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/members/${t.memberId}`)}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{t.memberName}</p>
                            <p className="text-xs text-gray-400">
                              {t.classesUsed}/{t.maxClasses} classes used
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            t.daysRemaining <= 2
                              ? "bg-red-100 text-red-700"
                              : "bg-purple-100 text-purple-700"
                          }`}>
                            {t.daysRemaining}d left
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expiring Memberships */}
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-gray-900">Expired Memberships</h2>
                    <span className="text-xs text-gray-400">Non-recurring</span>
                  </div>
                  {data.expiringMemberships.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">
                      No expired memberships.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {data.expiringMemberships.map((ms) => (
                        <div
                          key={ms.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/members/${ms.member.id}`)}
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {ms.member.firstName} {ms.member.lastName}
                            </p>
                            <p className="text-xs text-gray-400">{ms.membershipPlan.name}</p>
                          </div>
                          <span className="text-xs font-semibold text-orange-600">
                            Expired {formatShortDate(ms.endDate)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Low Stock Items */}
                {data.lowStockItems.length > 0 && (
                  <div className="rounded-lg border border-yellow-200 bg-white">
                    <div className="flex items-center justify-between border-b border-yellow-100 px-4 py-3">
                      <h2 className="text-sm font-semibold text-yellow-700">Low Stock</h2>
                      <button
                        onClick={() => router.push("/pos/items")}
                        className="text-xs text-primary hover:text-primaryDark font-medium"
                      >
                        View Inventory
                      </button>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {data.lowStockItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push("/pos/items")}
                        >
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                          <span className="text-xs font-semibold text-yellow-600">
                            {item.stock} left (threshold: {item.threshold})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Members This Week */}
                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-gray-900">New This Week</h2>
                    <button
                      onClick={() => router.push("/members")}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      All Members
                    </button>
                  </div>
                  {data.members.recent.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">
                      No new members this week.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {data.members.recent.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => router.push(`/members/${m.id}`)}
                        >
                          <p className="text-sm font-medium text-gray-900">
                            {m.firstName} {m.lastName}
                          </p>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(m.status)}`}>
                            {m.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Analytics Charts */}
            <DashboardCharts />
          </>
        )}
      </div>

    </AppLayout>
  );
}
