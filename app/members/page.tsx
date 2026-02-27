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

  // Track if we've loaded preferences from localStorage (to prevent overwriting on initial render)
  const [hasLoadedPrefs, setHasLoadedPrefs] = useState(false);

  // Column config popup
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Status filter buttons (excludes comma-separated statuses)
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [activeStatusFilters, setActiveStatusFilters] = useState<string[]>([]);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<"upload" | "paste" | "map" | "preview" | "importing" | "done">("upload");
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [pasteText, setPasteText] = useState<string>("");

  // Spreadsheet columns for manual entry
  const SPREADSHEET_COLUMNS = [
    { key: "firstName", label: "First Name *", width: "w-28" },
    { key: "lastName", label: "Last Name *", width: "w-28" },
    { key: "email", label: "Email", width: "w-40" },
    { key: "phone", label: "Phone", width: "w-28" },
    { key: "status", label: "Status", width: "w-24" },
    { key: "dateOfBirth", label: "DOB", width: "w-28" },
    { key: "style", label: "Style", width: "w-28" },
    { key: "rank", label: "Rank", width: "w-28" },
    { key: "lastPromotionDate", label: "Promotion Date", width: "w-28" },
  ];
  const EMPTY_ROW = SPREADSHEET_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {});
  const [spreadsheetRows, setSpreadsheetRows] = useState<Record<string, string>[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);

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

        // Build status filter buttons - always show all standard statuses
        // Sort by priority order: COACH, ACTIVE, PARENT, INACTIVE, PROSPECT, BANNED
        const priorityOrder = ["COACH", "ACTIVE", "PARENT", "INACTIVE", "PROSPECT", "BANNED"];

        // Collect all unique statuses from members (including individual parts of comma-separated)
        const memberStatuses = new Set<string>();
        rows.forEach((r) => {
          const status = (r.status ?? "").toUpperCase();
          if (status.includes(",")) {
            // Split comma-separated statuses and add each one
            status.split(",").forEach(s => {
              const trimmed = s.trim();
              if (trimmed.length > 0) memberStatuses.add(trimmed);
            });
          } else if (status.length > 0) {
            memberStatuses.add(status);
          }
        });

        // Always include all priority statuses, plus any extras from members
        const allStatuses = new Set([...priorityOrder, ...memberStatuses]);

        const statuses = Array.from(allStatuses).sort((a, b) => {
          const aIndex = priorityOrder.indexOf(a);
          const bIndex = priorityOrder.indexOf(b);
          // If status is not in priority list, put it at the end
          const aPriority = aIndex === -1 ? priorityOrder.length : aIndex;
          const bPriority = bIndex === -1 ? priorityOrder.length : bIndex;
          return aPriority - bPriority;
        });

        setAvailableStatuses(statuses);

        // Load saved status filters from localStorage, or default to all statuses
        const savedFilters = localStorage.getItem("membersStatusFilters");
        if (savedFilters) {
          try {
            const parsed = JSON.parse(savedFilters);
            // Only use saved filters that are still valid (exist in available statuses)
            const validFilters = parsed.filter((f: string) => statuses.includes(f));
            setActiveStatusFilters(validFilters.length > 0 ? validFilters : statuses);
          } catch {
            setActiveStatusFilters(statuses);
          }
        } else {
          setActiveStatusFilters(statuses); // start with all statuses visible
        }
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

    // Mark that we've loaded preferences (even if there were none)
    setHasLoadedPrefs(true);
  }, []);

  // --------------------------------------------------
  // Persist columns + sort to localStorage when they change
  // --------------------------------------------------
  useEffect(() => {
    // Don't save until we've loaded preferences (prevents overwriting on initial render)
    if (!hasLoadedPrefs) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.columns,
        JSON.stringify(visibleColumns)
      );
    } catch (err) {
      console.warn("Failed to save columns to localStorage", err);
    }
  }, [visibleColumns, hasLoadedPrefs]);

  useEffect(() => {
    // Don't save until we've loaded preferences (prevents overwriting on initial render)
    if (!hasLoadedPrefs) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.sortKey, sortKey);
      window.localStorage.setItem(STORAGE_KEYS.sortDir, sortDirection);
    } catch (err) {
      console.warn("Failed to save sort settings to localStorage", err);
    }
  }, [sortKey, sortDirection, hasLoadedPrefs]);

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
      let newFilters: string[];
      if (isActive) {
        // turning OFF this status
        newFilters = current.filter((s) => s !== status);
      } else {
        // turning ON this status
        newFilters = [...current, status];
      }
      // Save to localStorage
      localStorage.setItem("membersStatusFilters", JSON.stringify(newFilters));
      return newFilters;
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
  // CSV Import functions
  // --------------------------------------------------
  const CSV_FIELD_OPTIONS = [
    { value: "", label: "-- Skip this column --" },
    { value: "firstName", label: "First Name *" },
    { value: "lastName", label: "Last Name *" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "status", label: "Status" },
    { value: "dateOfBirth", label: "Date of Birth" },
    { value: "address", label: "Address" },
    { value: "city", label: "City" },
    { value: "state", label: "State" },
    { value: "zipCode", label: "Zip Code" },
    { value: "emergencyContactName", label: "Emergency Contact Name" },
    { value: "emergencyContactPhone", label: "Emergency Contact Phone" },
    { value: "parentGuardianName", label: "Parent/Guardian Name" },
    { value: "notes", label: "Notes" },
    { value: "medicalNotes", label: "Medical Notes" },
    { value: "style", label: "Style (must exist in system)" },
    { value: "rank", label: "Rank (must exist in style)" },
    { value: "lastPromotionDate", label: "Last Promotion Date" },
  ];

  function parseCSV(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Detect delimiter: if first line has tabs, use tab; otherwise use comma
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    // CSV/TSV parsing (handles quoted fields)
    function parseLine(line: string): string[] {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(line => parseLine(line));

    return { headers, rows };
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0) {
        setImportError("No data found in CSV file");
        return;
      }

      setCsvHeaders(headers);
      setCsvPreview(rows);

      // Auto-map columns based on header names
      const autoMapping: Record<string, string> = {};
      headers.forEach((header) => {
        const h = header.toLowerCase().replace(/[^a-z]/g, "");
        if (h.includes("first") && h.includes("name")) autoMapping[header] = "firstName";
        else if (h.includes("last") && h.includes("name")) autoMapping[header] = "lastName";
        else if (h === "firstname" || h === "first") autoMapping[header] = "firstName";
        else if (h === "lastname" || h === "last") autoMapping[header] = "lastName";
        else if (h === "name" && !autoMapping["firstName"]) autoMapping[header] = "firstName";
        else if (h.includes("email")) autoMapping[header] = "email";
        else if (h.includes("phone") && !h.includes("emergency")) autoMapping[header] = "phone";
        else if (h === "status") autoMapping[header] = "status";
        else if (h.includes("dob") || h.includes("birth") || h.includes("birthday")) autoMapping[header] = "dateOfBirth";
        else if (h.includes("address") && !h.includes("city") && !h.includes("state") && !h.includes("zip")) autoMapping[header] = "address";
        else if (h === "city") autoMapping[header] = "city";
        else if (h === "state") autoMapping[header] = "state";
        else if (h.includes("zip") || h.includes("postal")) autoMapping[header] = "zipCode";
        else if (h.includes("emergency") && h.includes("name")) autoMapping[header] = "emergencyContactName";
        else if (h.includes("emergency") && h.includes("phone")) autoMapping[header] = "emergencyContactPhone";
        else if (h.includes("parent") || h.includes("guardian")) autoMapping[header] = "parentGuardianName";
        else if (h.includes("note") && !h.includes("medical")) autoMapping[header] = "notes";
        else if (h.includes("medical")) autoMapping[header] = "medicalNotes";
        else if (h === "style" || h.includes("martial") && h.includes("art")) autoMapping[header] = "style";
        else if (h === "rank" || h === "belt" || h.includes("belt") && !h.includes("size")) autoMapping[header] = "rank";
        else if (h.includes("promotion") || (h.includes("last") && h.includes("date"))) autoMapping[header] = "lastPromotionDate";
      });

      setColumnMapping(autoMapping);
      setImportStep("map");
    };
    reader.readAsText(file);
  }

  function handlePasteSubmit() {
    if (!pasteText.trim()) {
      setImportError("Please paste some data");
      return;
    }

    setImportError(null);
    const { headers, rows } = parseCSV(pasteText);

    if (headers.length === 0) {
      setImportError("No data found. Make sure to include headers in the first row.");
      return;
    }

    if (rows.length === 0) {
      setImportError("No data rows found. Make sure your data has at least one row after the header.");
      return;
    }

    setCsvHeaders(headers);
    setCsvPreview(rows);

    // Auto-map columns based on header names
    const autoMapping: Record<string, string> = {};
    headers.forEach((header) => {
      const h = header.toLowerCase().replace(/[^a-z]/g, "");
      if (h.includes("first") && h.includes("name")) autoMapping[header] = "firstName";
      else if (h.includes("last") && h.includes("name")) autoMapping[header] = "lastName";
      else if (h === "firstname" || h === "first") autoMapping[header] = "firstName";
      else if (h === "lastname" || h === "last") autoMapping[header] = "lastName";
      else if (h === "name" && !autoMapping["firstName"]) autoMapping[header] = "firstName";
      else if (h.includes("email")) autoMapping[header] = "email";
      else if (h.includes("phone") && !h.includes("emergency")) autoMapping[header] = "phone";
      else if (h === "status") autoMapping[header] = "status";
      else if (h.includes("dob") || h.includes("birth") || h.includes("birthday")) autoMapping[header] = "dateOfBirth";
      else if (h.includes("address") && !h.includes("city") && !h.includes("state") && !h.includes("zip")) autoMapping[header] = "address";
      else if (h === "city") autoMapping[header] = "city";
      else if (h === "state") autoMapping[header] = "state";
      else if (h.includes("zip") || h.includes("postal")) autoMapping[header] = "zipCode";
      else if (h.includes("emergency") && h.includes("name")) autoMapping[header] = "emergencyContactName";
      else if (h.includes("emergency") && h.includes("phone")) autoMapping[header] = "emergencyContactPhone";
      else if (h.includes("parent") || h.includes("guardian")) autoMapping[header] = "parentGuardianName";
      else if (h.includes("note") && !h.includes("medical")) autoMapping[header] = "notes";
      else if (h.includes("medical")) autoMapping[header] = "medicalNotes";
      else if (h === "style" || h.includes("martial") && h.includes("art")) autoMapping[header] = "style";
      else if (h === "rank" || h === "belt" || h.includes("belt") && !h.includes("size")) autoMapping[header] = "rank";
      else if (h.includes("promotion") || (h.includes("last") && h.includes("date"))) autoMapping[header] = "lastPromotionDate";
    });

    setColumnMapping(autoMapping);
    setImportStep("map");
  }

  function getMappedData(): any[] {
    return csvPreview.map((row) => {
      const member: any = {};
      csvHeaders.forEach((header, idx) => {
        const field = columnMapping[header];
        if (field && row[idx]) {
          member[field] = row[idx];
        }
      });
      return member;
    }).filter(m => m.firstName && m.lastName); // Only include rows with required fields
  }

  async function handleImport() {
    setImportStep("importing");
    setImportError(null);

    const members = getMappedData();

    if (members.length === 0) {
      setImportError("No valid members to import. Ensure First Name and Last Name are mapped.");
      setImportStep("preview");
      return;
    }

    try {
      const res = await fetch("/api/members/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members }),
      });

      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || "Failed to import members");
        setImportStep("preview");
        return;
      }

      setImportResult({ imported: data.imported });
      setImportStep("done");

      // Refresh member list
      const membersRes = await fetch("/api/members");
      const membersData = await membersRes.json();
      const rows: MemberRow[] = (membersData.members || []).map((m: any) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email ?? null,
        phone: m.phone ?? null,
        status: m.status ?? "PROSPECT",
        createdAt: m.createdAt,
        memberNumber: m.memberNumber ?? null,
        city: m.city ?? null,
        state: m.state ?? null,
        dateOfBirth: m.dateOfBirth ?? null,
        membershipType: m.membershipType ?? null,
        primaryStyle: m.primaryStyle ?? null,
        waiverSigned: m.waiverSigned ?? null,
      }));
      setMembers(rows);

    } catch (err) {
      setImportError("Network error. Please try again.");
      setImportStep("preview");
    }
  }

  function resetImport() {
    setCsvFile(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setImportStep("upload");
    setImportError(null);
    setImportResult(null);
    setPasteText("");
    setSpreadsheetRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  }

  function updateSpreadsheetCell(rowIndex: number, key: string, value: string) {
    setSpreadsheetRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };
      return updated;
    });
  }

  // Handle paste from spreadsheet (Excel, Google Sheets, etc.)
  function handleSpreadsheetPaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const pastedText = e.clipboardData.getData("text");

    // Check if this looks like multi-cell data (contains tabs or newlines)
    if (!pastedText.includes("\t") && !pastedText.includes("\n")) {
      // Single cell paste - let default behavior handle it
      return;
    }

    e.preventDefault();

    // Parse the pasted data - rows are separated by newlines, columns by tabs
    const pastedRows = pastedText.split(/\r?\n/).filter(row => row.trim() !== "");
    const columnKeys = SPREADSHEET_COLUMNS.map(col => col.key);

    setSpreadsheetRows(prev => {
      const updated = [...prev];

      pastedRows.forEach((pastedRow, pastedRowIdx) => {
        const targetRowIndex = rowIndex + pastedRowIdx;
        const cells = pastedRow.split("\t");

        // Add new rows if needed
        while (updated.length <= targetRowIndex) {
          updated.push({ ...EMPTY_ROW });
        }

        // Fill in the cells starting from the current column
        cells.forEach((cellValue, cellIdx) => {
          const targetColIndex = colIndex + cellIdx;
          if (targetColIndex < columnKeys.length) {
            const key = columnKeys[targetColIndex];
            updated[targetRowIndex] = { ...updated[targetRowIndex], [key]: cellValue.trim() };
          }
        });
      });

      return updated;
    });
  }

  function addSpreadsheetRow() {
    setSpreadsheetRows(prev => [...prev, { ...EMPTY_ROW }]);
  }

  function removeSpreadsheetRow(rowIndex: number) {
    if (spreadsheetRows.length <= 1) return;
    setSpreadsheetRows(prev => prev.filter((_, i) => i !== rowIndex));
  }

  function handleSpreadsheetSubmit() {
    // Filter rows that have at least first name and last name
    const validRows = spreadsheetRows.filter(row => row.firstName?.trim() && row.lastName?.trim());

    if (validRows.length === 0) {
      setImportError("Please enter at least one member with First Name and Last Name.");
      return;
    }

    setImportError(null);

    // Convert spreadsheet rows to format expected by the rest of the flow
    const headers = SPREADSHEET_COLUMNS.map(col => col.key);
    const rows = validRows.map(row => headers.map(h => row[h] || ""));

    setCsvHeaders(headers);
    setCsvPreview(rows);

    // Auto-map columns (they're already in the right format)
    const autoMapping: Record<string, string> = {};
    headers.forEach(h => { autoMapping[h] = h; });

    setColumnMapping(autoMapping);
    setImportStep("preview");
  }

  function closeImportModal() {
    setShowImportModal(false);
    resetImport();
  }

  // --------------------------------------------------
  // Filter & sort rows
  // --------------------------------------------------
  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = members.filter((m) => {
      // status group filter - check if any of the member's statuses match any active filter
      const memberStatuses = (m.status ?? "").includes(",")
        ? (m.status ?? "").split(",").map(s => s.trim().toUpperCase())
        : [(m.status ?? "").toUpperCase()];
      if (
        activeStatusFilters.length > 0 &&
        !memberStatuses.some(s => activeStatusFilters.includes(s))
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
      return { bg: "bg-primary/10", text: "text-primary", border: "border-primary/30" };
    } else if (normalized === "PARENT") {
      return { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" };
    } else if (normalized === "COACH") {
      return { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" };
    } else if (normalized === "BANNED") {
      return { bg: "bg-gray-200", text: "text-gray-900", border: "border-gray-400" };
    } else if (normalized === "CANCELED") {
      return { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" };
    }

    return { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-300" };
  }

  // Priority order for displaying a single status: Coach, Active, Parent, Inactive, Prospect, Banned
  const STATUS_PRIORITY = ["COACH", "ACTIVE", "PARENT", "INACTIVE", "PROSPECT", "BANNED"];

  function getPriorityStatus(statusString: string): string {
    const statuses = statusString.includes(",")
      ? statusString.split(",").map(s => s.trim().toUpperCase())
      : [statusString.toUpperCase()];

    for (const priority of STATUS_PRIORITY) {
      if (statuses.includes(priority)) {
        return priority;
      }
    }
    return statuses[0] || "UNKNOWN";
  }

  function getDisplayStatus(statusString: string): string {
    const memberStatuses = statusString.includes(",")
      ? statusString.split(",").map(s => s.trim().toUpperCase())
      : [statusString.toUpperCase()];

    // If only one filter is active and the member has that status, show that status
    if (activeStatusFilters.length === 1) {
      const activeFilter = activeStatusFilters[0];
      if (memberStatuses.includes(activeFilter)) {
        return activeFilter;
      }
    }

    // If multiple filters are active, show the highest priority status that matches any active filter
    if (activeStatusFilters.length > 0 && activeStatusFilters.length < availableStatuses.length) {
      for (const priority of STATUS_PRIORITY) {
        if (memberStatuses.includes(priority) && activeStatusFilters.includes(priority)) {
          return priority;
        }
      }
    }

    // Default: show priority status
    return getPriorityStatus(statusString);
  }

  function renderStatusBadge(status: string) {
    const displayStatus = getDisplayStatus(status);
    const colors = getStatusColors(displayStatus);

    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
      >
        {displayStatus || "UNKNOWN"}
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
      <div className="space-y-4">
        {/* Header row with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Members</h1>
            <p className="text-sm text-gray-600">
              Full member list with sortable, customizable columns.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open("/api/export/members", "_blank")}
              className="text-xs rounded-md border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
            >
              Import CSV
            </button>
            <Link
              href="/members/new"
              className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
            >
              Add Member
            </Link>
          </div>
        </div>

        {/* Search + column config */}
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
                className="flex items-center gap-1 rounded-md border border-primary bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Customize Columns
              </button>
            </div>
          </div>

          {/* Status filter toggle buttons (excludes comma-separated statuses) */}
          <div className="flex flex-wrap items-center gap-2">
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

          {/* Error */}
          {error && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
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
                            className="text-xs text-primary hover:text-primaryDark font-medium"
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

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-lg flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Import Members from CSV</h2>
              <button
                type="button"
                onClick={closeImportModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {importError && (
                <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {importError}
                </div>
              )}

              {/* Step 1: Upload */}
              {importStep === "upload" && (
                <div className="text-center py-8">
                  <div className="mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Import your member data</h3>
                  <p className="text-sm text-gray-900 mb-4">
                    The first row should contain column headers (e.g., First Name, Last Name, Email).
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Choose CSV File
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                    <span className="text-sm text-gray-500 font-medium">or</span>
                    <button
                      type="button"
                      onClick={() => setImportStep("paste")}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Enter Manually
                    </button>
                  </div>
                  <p className="text-xs text-gray-900 mt-4">
                    Supported fields: First Name, Last Name, Email, Phone, Status, Date of Birth, Address, City, State, Zip Code, Emergency Contact, Parent/Guardian, Notes, Style, Rank, Last Promotion Date
                  </p>
                </div>
              )}

              {/* Step 1b: Enter data in spreadsheet */}
              {importStep === "paste" && (
                <div className="py-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Enter your member data</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Fill in the spreadsheet below. First Name and Last Name are required.
                  </p>

                  {/* Spreadsheet table */}
                  <div className="overflow-x-auto border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                    <table className="text-xs">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-1 py-2 text-center text-gray-500 font-medium w-8">#</th>
                          {SPREADSHEET_COLUMNS.map(col => (
                            <th key={col.key} className={`px-1 py-2 text-left text-gray-700 font-medium ${col.width}`}>
                              {col.label}
                            </th>
                          ))}
                          <th className="px-1 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {spreadsheetRows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-1 py-1 text-center text-gray-400">{rowIndex + 1}</td>
                            {SPREADSHEET_COLUMNS.map((col, colIndex) => (
                              <td key={col.key} className="px-0.5 py-0.5">
                                <input
                                  type="text"
                                  value={row[col.key] || ""}
                                  onChange={(e) => updateSpreadsheetCell(rowIndex, col.key, e.target.value)}
                                  onPaste={(e) => handleSpreadsheetPaste(e, rowIndex, colIndex)}
                                  className={`${col.width} px-1.5 py-1 text-xs border border-gray-200 rounded focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none`}
                                  placeholder={col.key === "status" ? "ACTIVE" : col.key === "dateOfBirth" || col.key === "lastPromotionDate" ? "MM/DD/YYYY" : ""}
                                />
                              </td>
                            ))}
                            <td className="px-1 py-1">
                              <button
                                type="button"
                                onClick={() => removeSpreadsheetRow(rowIndex)}
                                className="text-gray-400 hover:text-primary"
                                title="Remove row"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add row button */}
                  <button
                    type="button"
                    onClick={addSpreadsheetRow}
                    className="mt-2 text-xs text-primary hover:text-primaryDark font-medium flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Row
                  </button>

                  <div className="flex items-center justify-between mt-4">
                    <button
                      type="button"
                      onClick={() => { setImportStep("upload"); setSpreadsheetRows([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]); }}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSpreadsheetSubmit}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Map columns */}
              {importStep === "map" && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Map CSV Columns to Member Fields</h3>
                    <p className="text-xs text-gray-500">
                      We&apos;ve automatically matched some columns. Review and adjust the mappings below.
                      <span className="text-red-600 font-medium"> First Name and Last Name are required.</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                    {csvHeaders.map((header) => (
                      <div key={header} className="flex items-center gap-2">
                        <div className="w-1/2">
                          <div className="text-xs font-medium text-gray-700 truncate" title={header}>
                            {header}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            e.g. {csvPreview[0]?.[csvHeaders.indexOf(header)] || "—"}
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <select
                          value={columnMapping[header] || ""}
                          onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        >
                          {CSV_FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={resetImport}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      &larr; Choose different file
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportStep("preview")}
                      disabled={!columnMapping[Object.keys(columnMapping).find(k => columnMapping[k] === "firstName") || ""] || !columnMapping[Object.keys(columnMapping).find(k => columnMapping[k] === "lastName") || ""]}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Preview Import &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview */}
              {importStep === "preview" && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Preview Import</h3>
                    <p className="text-xs text-gray-500">
                      Review the data below. {getMappedData().length} members will be imported.
                    </p>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">First Name</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Last Name</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Email</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Phone</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {getMappedData().slice(0, 50).map((member, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2">{member.firstName || "—"}</td>
                              <td className="px-3 py-2">{member.lastName || "—"}</td>
                              <td className="px-3 py-2">{member.email || "—"}</td>
                              <td className="px-3 py-2">{member.phone || "—"}</td>
                              <td className="px-3 py-2">{member.status || "PROSPECT"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {getMappedData().length > 50 && (
                      <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 border-t">
                        Showing first 50 of {getMappedData().length} members...
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setImportStep("map")}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      &larr; Back to mapping
                    </button>
                    <button
                      type="button"
                      onClick={handleImport}
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Import {getMappedData().length} Members
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Importing */}
              {importStep === "importing" && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <h3 className="text-lg font-medium text-gray-900">Importing members...</h3>
                  <p className="text-sm text-gray-500">Please wait while we add your members.</p>
                </div>
              )}

              {/* Step 5: Done */}
              {importStep === "done" && importResult && (
                <div className="text-center py-8">
                  <div className="mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Import Complete!</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Successfully imported <span className="font-semibold text-green-600">{importResult.imported}</span> members.
                  </p>
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
