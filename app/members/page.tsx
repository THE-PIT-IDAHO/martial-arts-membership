"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string; // ISO string
  memberNumber?: number | null;

  // Extra fields for optional columns
  city?: string | null;
  state?: string | null;
  dateOfBirth?: string | null; // ISO string
  membershipType?: string | null;
  primaryStyle?: string | null;
  waiverSigned?: boolean | null;
};

type SortKey =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "status"
  | "memberNumber"
  | "createdAt"
  | "cityState"
  | "dateOfBirth"
  | "age"
  | "membershipType"
  | "waiverSigned";

type SortDirection = "asc" | "desc";

/** ID for a customizable column in the table (not including first/last name) */
type ColumnId =
  | "memberNumber"
  | "status"
  | "email"
  | "phone"
  | "createdAt"
  | "cityState"
  | "dateOfBirth"
  | "age"
  | "membershipType"
  | "waiverSigned";

type ColumnDef = {
  id: ColumnId;
  label: string;
  /** Whether this column participates in sorting (shows clickable header + arrow) */
  sortable?: boolean;
};

/** All possible customizable columns (first/last name are always-on static columns) */
const ALL_COLUMNS: ColumnDef[] = [
  { id: "memberNumber", label: "Member #", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "email", label: "Email", sortable: true },
  { id: "phone", label: "Phone", sortable: true },
  { id: "createdAt", label: "Joined", sortable: true },
  { id: "cityState", label: "City / State", sortable: true },
  { id: "dateOfBirth", label: "DOB", sortable: true },
  { id: "age", label: "Age", sortable: true },
  { id: "membershipType", label: "Membership Type", sortable: true },
  { id: "waiverSigned", label: "Waiver Signed", sortable: true },
];

const COLUMNS_BY_ID: Record<ColumnId, ColumnDef> = ALL_COLUMNS.reduce(
  (acc, col) => {
    acc[col.id] = col;
    return acc;
  },
  {} as Record<ColumnId, ColumnDef>
);

// Defaults for first load / reset
const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = [
  "memberNumber",
  "status",
  "email",
  "phone",
  "createdAt",
];

const DEFAULT_SORT_KEY: SortKey = "firstName";
const DEFAULT_SORT_DIRECTION: SortDirection = "asc";

const ALL_SORT_KEYS: SortKey[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "status",
  "memberNumber",
  "createdAt",
  "cityState",
  "dateOfBirth",
  "age",
  "membershipType",
  "waiverSigned",
];

const STORAGE_KEYS = {
  columns: "memberList.visibleColumns",
  sortKey: "memberList.sortKey",
  sortDir: "memberList.sortDirection",
};

export default function MembersPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(DEFAULT_SORT_DIRECTION);

  // Visible customizable columns & drag state (first/last name are fixed on the left)
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(
    DEFAULT_VISIBLE_COLUMNS
  );
  const [draggingColumn, setDraggingColumn] = useState<ColumnId | null>(null);

  // Column config popup
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Status filter buttons
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>([]);

  // --------------------------------------------------
  // Load members
  // --------------------------------------------------
  useEffect(() => {
    async function fetchMembers() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/members");
        if (!res.ok) {
          throw new Error("Failed to load members");
        }
        const data = await res.json();

        const rows: MemberRow[] = (data.members || []).map((m: any) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email ?? null,
          phone: m.phone ?? null,
          status: m.status ?? "PROSPECT",
          createdAt: m.createdAt,
          memberNumber: m.memberNumber ?? null,

          // extra fields from Member model
          city: m.city ?? null,
          state: m.state ?? null,
          dateOfBirth: m.dateOfBirth ?? null,
          membershipType: m.membershipType ?? null,
          primaryStyle: m.primaryStyle ?? null,
          waiverSigned: m.waiverSigned ?? null,
        }));

        setMembers(rows);

        // Build status filter buttons from the data
        const statuses = Array.from(
          new Set(
            rows
              .map((r) => (r.status ?? "").toUpperCase())
              .filter((s) => s.length > 0)
          )
        ).sort();

        setAvailableStatuses(statuses);
        setActiveStatusFilters(statuses); // start with all statuses visible
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load members");
      } finally {
        setLoading(false);
      }
    }

    fetchMembers();
  }, []);

  // --------------------------------------------------
  // Delete member
  // --------------------------------------------------
  async function handleDeleteMember(memberId: string, memberName: string) {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${memberName}? This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete member");
      }

      // Remove member from local state
      setMembers((current) => current.filter((m) => m.id !== memberId));
    } catch (err: any) {
      console.error("Error deleting member:", err);
      setError(err.message || "Failed to delete member");
    }
  }

  // --------------------------------------------------
  // Load saved layout/sort from localStorage on mount
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // Columns
      const storedCols = window.localStorage.getItem(STORAGE_KEYS.columns);
      if (storedCols) {
        const parsed = JSON.parse(storedCols) as string[];
        const cleaned = parsed.filter(
          (id): id is ColumnId =>
            (ALL_COLUMNS as ColumnDef[])
              .map((c) => c.id)
              .includes(id as ColumnId)
        );
        if (cleaned.length > 0) {
          setVisibleColumns(cleaned);
        }
      }

      // Sort key
      const storedKey = window.localStorage.getItem(STORAGE_KEYS.sortKey);
      if (storedKey && ALL_SORT_KEYS.includes(storedKey as SortKey)) {
        setSortKey(storedKey as SortKey);
      }

      // Sort direction
      const storedDir = window.localStorage.getItem(STORAGE_KEYS.sortDir);
      if (storedDir === "asc" || storedDir === "desc") {
        setSortDirection(storedDir);
      }
    } catch (err) {
      console.warn("Failed to load list preferences from localStorage", err);
    }
  }, []);

  // --------------------------------------------------
  // Persist columns + sort to localStorage when they change
  // --------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.columns,
        JSON.stringify(visibleColumns)
      );
    } catch (err) {
      console.warn("Failed to save columns to localStorage", err);
    }
  }, [visibleColumns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.sortKey, sortKey);
      window.localStorage.setItem(STORAGE_KEYS.sortDir, sortDirection);
    } catch (err) {
      console.warn("Failed to save sort settings to localStorage", err);
    }
  }, [sortKey, sortDirection]);

  // --------------------------------------------------
  // Sorting logic
  // --------------------------------------------------
  /** Map a column ID to an actual SortKey, if any */
  function columnSortKey(id: ColumnId): SortKey | null {
    switch (id) {
      case "email":
        return "email";
      case "phone":
        return "phone";
      case "status":
        return "status";
      case "memberNumber":
        return "memberNumber";
      case "createdAt":
        return "createdAt";
      case "cityState":
        return "cityState";
      case "dateOfBirth":
        return "dateOfBirth";
      case "age":
        return "age";
      case "membershipType":
        return "membershipType";
      case "waiverSigned":
        return "waiverSigned";
      default:
        return null;
    }
  }

  function handleSort(nextKey: SortKey) {
    // If you click the same column again, just flip direction
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    // If you click a NEW column:
    // - createdAt starts newest-first (desc)
    // - everything else starts ascending
    setSortKey(nextKey);
    if (nextKey === "createdAt") {
      setSortDirection("desc");
    } else {
      setSortDirection("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    return null;
  }

  // --------------------------------------------------
  // Column visibility / drag / reset
  // --------------------------------------------------
  function handleToggleColumn(id: ColumnId) {
    setVisibleColumns((current) => {
      if (current.includes(id)) {
        // allow hiding any customizable column; table will still have first/last name
        return current.filter((c) => c !== id);
      } else {
        return [...current, id];
      }
    });
  }

  function handleDragStart(id: ColumnId) {
    setDraggingColumn(id);
  }

  function handleDrop(targetId: ColumnId) {
    setVisibleColumns((current) => {
      if (!draggingColumn || draggingColumn === targetId) return current;

      const next = [...current];
      const fromIndex = next.indexOf(draggingColumn);
      const toIndex = next.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return current;

      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggingColumn);
      return next;
    });
    setDraggingColumn(null);
  }

  function resetColumnsAndSort() {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    setSortKey(DEFAULT_SORT_KEY);
    setSortDirection(DEFAULT_SORT_DIRECTION);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEYS.columns);
        window.localStorage.removeItem(STORAGE_KEYS.sortKey);
        window.localStorage.removeItem(STORAGE_KEYS.sortDir);
      } catch (err) {
        console.warn("Failed to clear localStorage preferences", err);
      }
    }
  }

  // --------------------------------------------------
  // Status filter buttons
  // --------------------------------------------------
  function toggleStatusFilter(status: string) {
    setActiveStatusFilters((current) => {
      const isActive = current.includes(status);
      if (isActive) {
        // turning OFF this status
        return current.filter((s) => s !== status);
      } else {
        // turning ON this status
        return [...current, status];
      }
    });
  }

  // --------------------------------------------------
  // Helper functions
  // --------------------------------------------------
  function calculateAge(dateOfBirth: string | null | undefined): number | null {
    if (!dateOfBirth) return null;
    const d = new Date(dateOfBirth);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const hasHadBirthdayThisYear =
      today.getMonth() > d.getMonth() ||
      (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
    if (!hasHadBirthdayThisYear) age--;
    return age >= 0 ? age : null;
  }

  // --------------------------------------------------
  // Filter & sort rows
  // --------------------------------------------------
  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = members.filter((m) => {
      // status group filter
      const statusNormalized = (m.status ?? "").toUpperCase();
      if (
        activeStatusFilters.length > 0 &&
        !activeStatusFilters.includes(statusNormalized)
      ) {
        return false;
      }

      if (!q) return true;

      const fullName = `${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      const phone = (m.phone ?? "").toLowerCase();
      const status = (m.status ?? "").toLowerCase();
      const memberNum = m.memberNumber != null ? String(m.memberNumber) : "";
      const cityState = `${m.city ?? ""} ${m.state ?? ""}`.toLowerCase();
      const membershipType = (m.membershipType ?? "").toLowerCase();
      const primaryStyle = (m.primaryStyle ?? "").toLowerCase();

      return (
        fullName.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        status.includes(q) ||
        memberNum.includes(q) ||
        cityState.includes(q) ||
        membershipType.includes(q) ||
        primaryStyle.includes(q)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "firstName") {
        const aVal = (a.firstName ?? "").toLowerCase();
        const bVal = (b.firstName ?? "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "lastName") {
        const aVal = (a.lastName ?? "").toLowerCase();
        const bVal = (b.lastName ?? "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "email") {
        const aVal = (a.email ?? "").toLowerCase();
        const bVal = (b.email ?? "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "phone") {
        const aVal = (a.phone ?? "").toLowerCase();
        const bVal = (b.phone ?? "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "status") {
        const aVal = (a.status ?? "").toLowerCase();
        const bVal = (b.status ?? "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "memberNumber") {
        const aNum = a.memberNumber ?? Number.POSITIVE_INFINITY;
        const bNum = b.memberNumber ?? Number.POSITIVE_INFINITY;
        if (aNum === bNum) return 0;
        return aNum > bNum ? dir : -dir;
      }

      if (sortKey === "createdAt") {
        const aTime = new Date(a.createdAt).getTime() || 0;
        const bTime = new Date(b.createdAt).getTime() || 0;
        if (aTime === bTime) return 0;
        return aTime > bTime ? dir : -dir;
      }

      if (sortKey === "cityState") {
        const aVal = `${a.city ?? ""} ${a.state ?? ""}`.toLowerCase();
        const bVal = `${b.city ?? ""} ${b.state ?? ""}`.toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "dateOfBirth") {
        const aTime = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
        const bTime = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
        if (aTime === bTime) return 0;
        return aTime > bTime ? dir : -dir;
      }

      if (sortKey === "age") {
        const aAge = calculateAge(a.dateOfBirth) ?? -1;
        const bAge = calculateAge(b.dateOfBirth) ?? -1;
        if (aAge === bAge) return 0;
        return aAge > bAge ? dir : -dir;
      }

      if (sortKey === "membershipType") {
        const aVal = (a.membershipType ?? "").toLowerCase();
        const bVal = (b.membershipType ?? "").toLowerCase();
        return aVal.localeCompare(bVal) * dir;
      }

      if (sortKey === "waiverSigned") {
        const aVal = a.waiverSigned ? 1 : 0;
        const bVal = b.waiverSigned ? 1 : 0;
        if (aVal === bVal) return 0;
        return aVal > bVal ? dir : -dir;
      }

      return 0;
    });

    return sorted;
  }, [members, search, sortKey, sortDirection, activeStatusFilters]);

  // --------------------------------------------------
  // Render helpers
  // --------------------------------------------------
  function getStatusColors(status: string) {
    const normalized = (status || "").toUpperCase();

    if (normalized === "ACTIVE") {
      return { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" };
    } else if (normalized === "PROSPECT") {
      return { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" };
    } else if (normalized === "INACTIVE") {
      return { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" };
    } else if (normalized === "PARENT") {
      return { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" };
    } else if (normalized === "BANNED") {
      return { bg: "bg-gray-200", text: "text-gray-900", border: "border-gray-400" };
    }

    return { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-300" };
  }

  function renderStatusBadge(status: string) {
    const normalized = (status || "").toUpperCase();
    const colors = getStatusColors(status);

    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
      >
        {normalized || "UNKNOWN"}
      </span>
    );
  }

  function renderCell(columnId: ColumnId, m: MemberRow) {
    switch (columnId) {
      case "memberNumber":
        return m.memberNumber != null ? (
          <span className="text-xs text-gray-900">{m.memberNumber}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );

      case "status":
        return renderStatusBadge(m.status);

      case "email":
        return m.email ? (
          <span className="text-xs text-gray-900">{m.email}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );

      case "phone":
        return m.phone ? (
          <span className="text-xs text-gray-900">{m.phone}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );

      case "createdAt":
        return m.createdAt ? (
          <span className="text-[11px] text-gray-500">
            {new Date(m.createdAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );

      case "cityState": {
        const cs = [m.city, m.state].filter(Boolean).join(", ");
        return cs ? (
          <span className="text-xs text-gray-900">{cs}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );
      }

      case "dateOfBirth":
        return m.dateOfBirth ? (
          <span className="text-xs text-gray-900">
            {new Date(m.dateOfBirth).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );

      case "age": {
        const age = calculateAge(m.dateOfBirth);
        return age !== null ? (
          <span className="text-xs text-gray-900">{age}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );
      }

      case "membershipType":
        return m.membershipType ? (
          <span className="text-xs text-gray-900">{m.membershipType}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        );

      case "waiverSigned":
        return (
          <span className="text-xs">
            {m.waiverSigned ? "Signed" : "Not signed"}
          </span>
        );

      default:
        return null;
    }
  }

  // --------------------------------------------------
  // JSX
  // --------------------------------------------------
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Members</h1>
            <p className="text-sm text-gray-600">
              Full member list with sortable, customizable columns.
            </p>
          </div>
          <Link
            href="/members/new"
            className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
          >
            Add Member
          </Link>
        </div>

        {/* Search + column config + status filters */}
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone, status, #..."
                className="w-full sm:w-72 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowColumnConfig(true)}
                className="flex items-center gap-1 rounded-md border border-primary bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primaryDark"
              >
                Customize Columns
              </button>

              {/* Status filter toggle buttons */}
              {availableStatuses.map((status) => {
                const isActive = activeStatusFilters.includes(status);
                const colors = getStatusColors(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatusFilter(status)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border ${
                      isActive
                        ? `${colors.bg} ${colors.text} ${colors.border}`
                        : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {/* First Name (fixed left) */}
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("firstName")}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      First Name
                      {sortIndicator("firstName")}
                    </button>
                  </th>

                  {/* Last Name (fixed left) */}
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("lastName")}
                      className="inline-flex items-center gap-1 hover:text-gray-900"
                    >
                      Last Name
                      {sortIndicator("lastName")}
                    </button>
                  </th>

                  {/* Customizable columns */}
                  {visibleColumns.map((colId) => {
                    const col = COLUMNS_BY_ID[colId];
                    const sortForCol = col.sortable
                      ? columnSortKey(colId)
                      : null;

                    return (
                      <th
                        key={colId}
                        draggable
                        onDragStart={() => handleDragStart(colId)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDrop(colId);
                        }}
                        className={`px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap ${
                          draggingColumn === colId ? "bg-gray-100" : ""
                        } cursor-move`}
                      >
                        {sortForCol ? (
                          <button
                            type="button"
                            onClick={() =>
                              sortForCol && handleSort(sortForCol)
                            }
                            className="inline-flex items-center gap-1 hover:text-gray-900"
                          >
                            {col.label}
                            {sortForCol && sortIndicator(sortForCol)}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                          </span>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 3}
                      className="px-3 py-6 text-center text-sm text-gray-500"
                    >
                      Loading members…
                    </td>
                  </tr>
                ) : filteredAndSorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 3}
                      className="px-3 py-6 text-center text-sm text-gray-400"
                    >
                      No members found. Try adjusting your search, status
                      filters, or column settings.
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      {/* First Name cell */}
                      <td className="px-3 py-2 whitespace-nowrap align-middle">
                        <Link
                          href={`/members/${m.id}`}
                          className="text-sm font-medium text-primary hover:text-primaryDark"
                        >
                          {m.firstName || "—"}
                        </Link>
                      </td>

                      {/* Last Name cell */}
                      <td className="px-3 py-2 whitespace-nowrap align-middle">
                        <Link
                          href={`/members/${m.id}`}
                          className="text-sm font-medium text-primary hover:text-primaryDark"
                        >
                          {m.lastName || "—"}
                        </Link>
                      </td>

                      {/* Customizable columns */}
                      {visibleColumns.map((colId) => (
                        <td
                          key={colId}
                          className="px-3 py-2 whitespace-nowrap align-middle text-center"
                        >
                          {renderCell(colId, m)}
                        </td>
                      ))}

                      <td className="px-3 py-2 whitespace-nowrap align-middle text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/members/${m.id}`}
                            className="text-xs text-primary hover:text-primaryDark font-medium"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteMember(
                                m.id,
                                `${m.firstName} ${m.lastName}`
                              )
                            }
                            className="text-xs text-red-600 hover:text-red-700 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Column config popup */}
      {showColumnConfig && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">
                Customize Member List Columns
              </h2>
              <button
                type="button"
                onClick={() => setShowColumnConfig(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-2">
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col.id)}
                      onChange={() => handleToggleColumn(col.id)}
                      className="h-3 w-3"
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={resetColumnsAndSort}
                className="text-[11px] text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
              >
                Reset to default
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowColumnConfig(false)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
