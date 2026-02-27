"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type ReportDateRange = "today" | "week" | "month" | "quarter" | "year" | "custom";

type ReportType = "membership" | "attendance" | "revenue" | "retention" | "custom";

// All possible data fields that can be included in reports
type ReportDataFields = {
  // Membership Stats
  showTotalMembers: boolean;
  showActiveMembers: boolean;
  showProspects: boolean;
  showInactiveMembers: boolean;
  showBannedMembers: boolean;
  showCoaches: boolean;
  showParents: boolean;
  showNewMembers: boolean;
  showCanceledMembers: boolean;
  showStatusDistribution: boolean;
  showMembershipPlanDistribution: boolean;
  showMembershipTypeDistribution: boolean;

  // Member Details
  showMemberNames: boolean;
  showMemberEmails: boolean;
  showMemberPhones: boolean;
  showMemberAddresses: boolean;
  showMemberDOB: boolean;
  showMemberAge: boolean;
  showMemberNumber: boolean;
  showJoinDate: boolean;
  showEmergencyContacts: boolean;
  showMedicalNotes: boolean;
  showWaiverStatus: boolean;

  // Belt Ranks & Styles
  showBeltRanks: boolean;
  showRanksByStyle: boolean;
  showPrimaryStyle: boolean;
  showStyleBreakdown: boolean;
  showRankDistribution: boolean;
  showUpcomingPromotions: boolean;

  // Memberships & Payments
  showMembershipTypes: boolean;
  showMembershipPlans: boolean;
  showMonthlyPayments: boolean;
  showFailedPayments: boolean;
  showPendingPayments: boolean;
  showPaymentHistory: boolean;
  showMembershipExpiring: boolean;
  showTrialMembers: boolean;
  showAutoRenewStatus: boolean;

  // Attendance
  showTotalCheckIns: boolean;
  showAvgDailyCheckIns: boolean;
  showUniqueAttendees: boolean;
  showTopAttendees: boolean;
  showAttendanceByDay: boolean;
  showAttendanceByClass: boolean;
  showAttendanceByStyle: boolean;
  showNoShowMembers: boolean;
  noShowThreshold: "1week" | "1month" | "3months";
  checkInPeriod: "daily" | "weekly" | "monthly" | "yearly" | "total";
  showAttendanceTrends: boolean;

  // Revenue & Sales
  showTotalRevenue: boolean;
  showMembershipRevenue: boolean;
  showPosRevenue: boolean;
  showAvgTransaction: boolean;
  showTransactionCount: boolean;
  showTopProducts: boolean;
  showSalesByCategory: boolean;
  showRefunds: boolean;
  showOutstandingBalance: boolean;

  // Classes & Programs
  showClassSchedule: boolean;
  showClassAttendance: boolean;
  showPopularClasses: boolean;
  showClassCapacity: boolean;
  showProgramEnrollment: boolean;

  // Retention & Growth
  showRetentionRate: boolean;
  showChurnRate: boolean;
  showNetGrowth: boolean;
  showMemberLifetime: boolean;
  showReactivatedMembers: boolean;

  // Attendance Requirements (per member columns)
  showTotalClassCount: boolean;
};

const DEFAULT_FIELDS: ReportDataFields = {
  showTotalMembers: true,
  showActiveMembers: true,
  showProspects: true,
  showInactiveMembers: true,
  showBannedMembers: false,
  showCoaches: false,
  showParents: false,
  showNewMembers: true,
  showCanceledMembers: true,
  showStatusDistribution: true,
  showMembershipPlanDistribution: false,
  showMembershipTypeDistribution: false,
  showMemberNames: false,
  showMemberEmails: false,
  showMemberPhones: false,
  showMemberAddresses: false,
  showMemberDOB: false,
  showMemberAge: false,
  showMemberNumber: false,
  showJoinDate: false,
  showEmergencyContacts: false,
  showMedicalNotes: false,
  showWaiverStatus: false,
  showBeltRanks: false,
  showRanksByStyle: false,
  showPrimaryStyle: false,
  showStyleBreakdown: false,
  showRankDistribution: false,
  showUpcomingPromotions: false,
  showMembershipTypes: false,
  showMembershipPlans: false,
  showMonthlyPayments: false,
  showFailedPayments: false,
  showPendingPayments: false,
  showPaymentHistory: false,
  showMembershipExpiring: false,
  showTrialMembers: false,
  showAutoRenewStatus: false,
  showTotalCheckIns: true,
  showAvgDailyCheckIns: true,
  showUniqueAttendees: true,
  showTopAttendees: true,
  showAttendanceByDay: true,
  showAttendanceByClass: false,
  showAttendanceByStyle: false,
  showNoShowMembers: false,
  noShowThreshold: "1month",
  checkInPeriod: "total",
  showAttendanceTrends: false,
  showTotalRevenue: true,
  showMembershipRevenue: true,
  showPosRevenue: true,
  showAvgTransaction: true,
  showTransactionCount: true,
  showTopProducts: true,
  showSalesByCategory: false,
  showRefunds: false,
  showOutstandingBalance: false,
  showClassSchedule: false,
  showClassAttendance: false,
  showPopularClasses: false,
  showClassCapacity: false,
  showProgramEnrollment: false,
  showRetentionRate: true,
  showChurnRate: false,
  showNetGrowth: true,
  showMemberLifetime: false,
  showReactivatedMembers: false,
  showTotalClassCount: false,
};

// FILTER FIELDS - Control which members appear in the list
const FILTER_FIELDS = [
  {
    name: "Member Status Filter",
    description: "Select which member types to include in the report",
    fields: [
      { key: "showActiveMembers", label: "Active Members" },
      { key: "showProspects", label: "Prospects" },
      { key: "showInactiveMembers", label: "Inactive Members" },
      { key: "showBannedMembers", label: "Banned Members" },
      { key: "showCoaches", label: "Coaches" },
      { key: "showParents", label: "Parents/Guardians" },
    ],
  },
  {
    name: "Style Filter",
    description: "Filter by martial arts style",
    fields: [],
    hasStyleCheckboxes: true,
  },
  {
    name: "Rank Filter",
    description: "Filter by rank",
    fields: [],
    hasRankCheckboxes: true,
  },
  {
    name: "Membership Type Filter",
    description: "Filter by membership type",
    fields: [],
    hasMembershipTypeFilter: true,
  },
  {
    name: "Membership Plan Filter",
    description: "Filter by membership plan",
    fields: [],
    hasMembershipPlanFilter: true,
  },
];

// COLUMN FIELDS - Control what information columns are displayed in the member list
const COLUMN_FIELDS = [
  {
    name: "Member Details",
    fields: [
      { key: "showMemberNames", label: "Member Names" },
      { key: "showMemberNumber", label: "Member Number" },
      { key: "showMemberEmails", label: "Email Address" },
      { key: "showMemberPhones", label: "Phone Numbers" },
      { key: "showMemberAddresses", label: "Addresses" },
      { key: "showMemberDOB", label: "Date of Birth" },
      { key: "showMemberAge", label: "Age" },
      { key: "showJoinDate", label: "Join/Start Date" },
      { key: "showEmergencyContacts", label: "Emergency Contacts" },
      { key: "showMedicalNotes", label: "Medical Notes" },
      { key: "showWaiverStatus", label: "Waiver Status" },
    ],
  },
  {
    name: "Belt Ranks & Styles",
    fields: [
      { key: "showBeltRanks", label: "Belt Rank" },
      { key: "showPrimaryStyle", label: "Primary Style" },
      { key: "showRanksByStyle", label: "Ranks by Style" },
    ],
  },
  {
    name: "Membership Info",
    fields: [
      { key: "showMembershipTypes", label: "Membership Type" },
      { key: "showMembershipPlans", label: "Membership Plan" },
      { key: "showMonthlyPayments", label: "Monthly Payment" },
      { key: "showAutoRenewStatus", label: "Auto-Renew Status" },
      { key: "showMembershipExpiring", label: "Expiration Date" },
    ],
  },
  {
    name: "Attendance Counts",
    fields: [
      { key: "showTotalClassCount", label: "Total Classes" },
    ],
    hasClassTypeSelector: true, // Shows dynamic class type checkboxes
  },
];

// STATISTICS FIELDS - Summary stats and charts (not per-member columns)
const STATISTICS_FIELDS = [
  {
    name: "Membership Statistics",
    fields: [
      { key: "showTotalMembers", label: "Total Members Count" },
      { key: "showNewMembers", label: "New Members (Period)" },
      { key: "showCanceledMembers", label: "Canceled Members" },
      { key: "showStatusDistribution", label: "Status Distribution Chart" },
      { key: "showMembershipPlanDistribution", label: "Membership Plans Breakdown" },
      { key: "showMembershipTypeDistribution", label: "Membership Types Breakdown" },
    ],
  },
  {
    name: "Style & Rank Statistics",
    fields: [
      { key: "showStyleBreakdown", label: "Style Breakdown" },
      { key: "showRankDistribution", label: "Rank Distribution Chart" },
      { key: "showUpcomingPromotions", label: "Upcoming Promotions" },
    ],
  },
  {
    name: "Attendance Statistics",
    fields: [
      { key: "showTotalCheckIns", label: "Check-Ins" },
      { key: "showAvgDailyCheckIns", label: "Avg Daily Check-Ins" },
      { key: "showUniqueAttendees", label: "Unique Attendees" },
      { key: "showTopAttendees", label: "Top Attendees" },
      { key: "showAttendanceByDay", label: "Attendance by Day" },
      { key: "showAttendanceByClass", label: "Attendance by Class" },
      { key: "showAttendanceByStyle", label: "Attendance by Style" },
      { key: "showNoShowMembers", label: "No-Show Members" },
      { key: "showAttendanceTrends", label: "Attendance Trends" },
    ],
  },
  {
    name: "Revenue & Sales",
    fields: [
      { key: "showTotalRevenue", label: "Total Revenue" },
      { key: "showMembershipRevenue", label: "Membership Revenue" },
      { key: "showPosRevenue", label: "POS Revenue" },
      { key: "showAvgTransaction", label: "Avg Transaction Value" },
      { key: "showTransactionCount", label: "Transaction Count" },
      { key: "showTopProducts", label: "Top Products" },
      { key: "showSalesByCategory", label: "Sales by Category" },
      { key: "showRefunds", label: "Refunds" },
      { key: "showOutstandingBalance", label: "Outstanding Balances" },
    ],
  },
  {
    name: "Payments",
    fields: [
      { key: "showMonthlyPayments", label: "Monthly Payments" },
      { key: "showFailedPayments", label: "Failed Payments" },
      { key: "showPendingPayments", label: "Pending Payments" },
      { key: "showPaymentHistory", label: "Payment History" },
      { key: "showTrialMembers", label: "Trial Members" },
    ],
  },
  {
    name: "Classes & Programs",
    fields: [
      { key: "showClassSchedule", label: "Class Schedule" },
      { key: "showClassAttendance", label: "Class Attendance" },
      { key: "showPopularClasses", label: "Popular Classes" },
      { key: "showClassCapacity", label: "Class Capacity" },
      { key: "showProgramEnrollment", label: "Program Enrollment" },
    ],
  },
  {
    name: "Retention & Growth",
    fields: [
      { key: "showRetentionRate", label: "Retention Rate" },
      { key: "showChurnRate", label: "Churn Rate" },
      { key: "showNetGrowth", label: "Net Growth" },
      { key: "showMemberLifetime", label: "Avg Member Lifetime" },
      { key: "showReactivatedMembers", label: "Reactivated Members" },
    ],
  },
];


type MembershipSummary = {
  totalMembers: number;
  activeMembers: number;
  prospects: number;
  inactiveMembers: number;
  bannedMembers: number;
  canceledMembers: number;
  coaches: number;
  parents: number;
  newMembersThisPeriod: number;
  canceledThisPeriod: number;
  membersList: any[];
  styleBreakdown: { style: string; count: number }[];
  rankDistribution: { rank: string; style: string; count: number }[];
  membershipPlanBreakdown: { plan: string; count: number }[];
  membershipTypeBreakdown: { type: string; count: number }[];
};

type AttendanceSummary = {
  totalCheckIns: number;
  dailyCheckIns: number;
  weeklyCheckIns: number;
  monthlyCheckIns: number;
  yearlyCheckIns: number;
  avgDailyCheckIns: number;
  uniqueAttendees: number;
  topAttendees: { name: string; count: number }[];
  attendanceByDay: { day: string; count: number }[];
  attendanceByClass: { className: string; count: number }[];
  attendanceByStyle: { style: string; count: number }[];
  noShowMembers: { name: string; lastAttendance: string }[];
};

type RevenueSummary = {
  totalRevenue: number;
  membershipRevenue: number;
  posRevenue: number;
  avgTransactionValue: number;
  transactionCount: number;
  topProducts: { name: string; revenue: number; quantity: number }[];
  salesByCategory: { category: string; revenue: number }[];
  refunds: number;
  outstandingBalance: number;
  monthlyPosRevenue: Record<string, number>;
  monthlyMembershipRevenue: Record<string, number>;
};

type PaymentSummary = {
  monthlyPayments: number;
  failedPayments: { memberName: string; amount: number; date: string }[];
  pendingPayments: { memberName: string; amount: number; dueDate: string }[];
  expiringMemberships: { memberName: string; expiryDate: string; plan: string }[];
};

// Base column identifiers for the member list table
type BaseColumnId = "firstName" | "lastName" | "status" | "memberNumber" | "email" | "phone" | "style" | "rank" | "joinDate" | "waiver" | "membershipType" | "membershipPlan" | "monthlyPayment" | "autoRenew" | "expirationDate" | "totalClasses";

// Column ID can be a base column or a class type column (prefixed with "classType:")
type ColumnId = BaseColumnId | `classType:${string}` | `styleRank:${string}`;

// Default column order (base columns only - class type columns are appended dynamically)
const DEFAULT_COLUMN_ORDER: BaseColumnId[] = [
  "firstName",
  "lastName",
  "status",
  "memberNumber",
  "email",
  "phone",
  "style",
  "rank",
  "joinDate",
  "waiver",
  "membershipType",
  "membershipPlan",
  "monthlyPayment",
  "autoRenew",
  "expirationDate",
  "totalClasses",
];

// Column display names for base columns
const COLUMN_LABELS: Record<BaseColumnId, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  status: "Status",
  memberNumber: "Member #",
  email: "Email",
  phone: "Phone",
  style: "Style",
  rank: "Rank",
  joinDate: "Joined",
  waiver: "Waiver",
  membershipType: "Membership Type",
  membershipPlan: "Membership Plan",
  monthlyPayment: "Monthly Payment",
  autoRenew: "Auto-Renew",
  expirationDate: "Expiration",
  totalClasses: "Total Classes",
};

// Helper to check if a column is a class type column
function isClassTypeColumn(colId: ColumnId): colId is `classType:${string}` {
  return colId.startsWith("classType:");
}

// Helper to extract class type name from column ID
function getClassTypeName(colId: ColumnId): string {
  return colId.replace("classType:", "");
}

// Helper to check if a column is a style rank column
function isStyleRankColumn(colId: ColumnId): colId is `styleRank:${string}` {
  return colId.startsWith("styleRank:");
}

// Helper to extract style name from style rank column ID
function getStyleRankName(colId: ColumnId): string {
  return colId.replace("styleRank:", "");
}

type ReportConfig = {
  id: string;
  name: string;
  description: string;
  type: ReportType;
  enabled: boolean;
  dateRange: ReportDateRange;
  customStartDate?: string;
  customEndDate?: string;
  fields: ReportDataFields;
  selectedStylesForRank?: string[]; // Styles to show rank columns for in member list
  filterByStyles?: string[]; // Filter members by styles (empty = all styles)
  filterByRanks?: string[]; // Filter members by belt ranks (empty = all ranks)
  filterByMembershipTypes?: string[]; // Filter members by membership types (empty = all)
  filterByMembershipPlans?: string[]; // Filter members by membership plans (empty = all)
  selectedClassTypes?: string[]; // Class types to show as columns (e.g., ["Regular", "Sparring"])
  columnOrder?: ColumnId[]; // Order of columns in the member list table
};

// Base filters: Active, Prospects, Inactive
const BASE_FILTERS = {
  showActiveMembers: true,
  showProspects: true,
  showInactiveMembers: true,
  showBannedMembers: false,
  showCoaches: false,
  showParents: false,
};

const DEFAULT_REPORTS: ReportConfig[] = [
  {
    id: "membership",
    name: "Membership Summary",
    description: "Overview of member counts, status distribution, and growth",
    type: "membership",
    enabled: true,
    dateRange: "month",
    fields: {
      ...DEFAULT_FIELDS,
      ...BASE_FILTERS,
      // Membership-specific stats
      showTotalMembers: true,
      showNewMembers: true,
      showCanceledMembers: true,
      showStatusDistribution: true,
      showMembershipPlanDistribution: true,
      showMembershipTypeDistribution: true,
      // Disable non-membership stats
      showTotalCheckIns: false,
      showAvgDailyCheckIns: false,
      showUniqueAttendees: false,
      showTopAttendees: false,
      showAttendanceByDay: false,
      showTotalRevenue: false,
      showMembershipRevenue: false,
      showPosRevenue: false,
      showAvgTransaction: false,
      showTransactionCount: false,
      showTopProducts: false,
      showRetentionRate: false,
      showNetGrowth: false,
    },
  },
  {
    id: "attendance",
    name: "Attendance Report",
    description: "Check-in statistics, attendance trends, and top attendees",
    type: "attendance",
    enabled: true,
    dateRange: "month",
    fields: {
      ...DEFAULT_FIELDS,
      ...BASE_FILTERS,
      // Attendance-specific stats
      showTotalCheckIns: true,
      showAvgDailyCheckIns: true,
      showUniqueAttendees: true,
      showTopAttendees: true,
      showAttendanceByDay: true,
      showAttendanceByClass: true,
      showAttendanceByStyle: true,
      showNoShowMembers: true,
      // Disable non-attendance stats
      showTotalMembers: false,
      showNewMembers: false,
      showCanceledMembers: false,
      showStatusDistribution: false,
      showTotalRevenue: false,
      showMembershipRevenue: false,
      showPosRevenue: false,
      showAvgTransaction: false,
      showTransactionCount: false,
      showTopProducts: false,
      showRetentionRate: false,
      showNetGrowth: false,
    },
  },
  {
    id: "revenue",
    name: "Revenue Report",
    description: "Financial summary including POS sales and membership fees",
    type: "revenue",
    enabled: true,
    dateRange: "month",
    fields: {
      ...DEFAULT_FIELDS,
      ...BASE_FILTERS,
      // Revenue-specific stats
      showTotalRevenue: true,
      showMembershipRevenue: true,
      showPosRevenue: true,
      showAvgTransaction: true,
      showTransactionCount: true,
      showTopProducts: true,
      showSalesByCategory: true,
      // Disable non-revenue stats
      showTotalMembers: false,
      showNewMembers: false,
      showCanceledMembers: false,
      showStatusDistribution: false,
      showTotalCheckIns: false,
      showAvgDailyCheckIns: false,
      showUniqueAttendees: false,
      showTopAttendees: false,
      showAttendanceByDay: false,
      showRetentionRate: false,
      showNetGrowth: false,
    },
  },
  {
    id: "retention",
    name: "Member Retention",
    description: "New signups, cancellations, and retention rate",
    type: "retention",
    enabled: true,
    dateRange: "quarter",
    fields: {
      ...DEFAULT_FIELDS,
      ...BASE_FILTERS,
      // Retention-specific stats
      showRetentionRate: true,
      showChurnRate: true,
      showNetGrowth: true,
      showNewMembers: true,
      showCanceledMembers: true,
      showReactivatedMembers: true,
      // Disable non-retention stats
      showTotalMembers: false,
      showStatusDistribution: false,
      showTotalCheckIns: false,
      showAvgDailyCheckIns: false,
      showUniqueAttendees: false,
      showTopAttendees: false,
      showAttendanceByDay: false,
      showTotalRevenue: false,
      showMembershipRevenue: false,
      showPosRevenue: false,
      showAvgTransaction: false,
      showTransactionCount: false,
      showTopProducts: false,
    },
  },
];

const STORAGE_KEY = "reports.config";

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reportConfigs, setReportConfigs] = useState<ReportConfig[]>(DEFAULT_REPORTS);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<ReportConfig | null>(null); // Temp state for editing
  const [expandedFilterCategories, setExpandedFilterCategories] = useState<Set<string>>(new Set()); // Track expanded filter categories
  const [showManageModal, setShowManageModal] = useState(false);
  const [initialTabSet, setInitialTabSet] = useState(false);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  const [membershipData, setMembershipData] = useState<MembershipSummary | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueSummary | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentSummary | null>(null);
  const [availableStyles, setAvailableStyles] = useState<{ id: string; name: string }[]>([]);
  const [availableRanks, setAvailableRanks] = useState<{ id: string; name: string; styleId: string; styleName: string; order: number }[]>([]);
  const [availableClassTypes, setAvailableClassTypes] = useState<string[]>([]);
  const [availableMembershipTypes, setAvailableMembershipTypes] = useState<{ id: string; name: string }[]>([]);
  const [availableMembershipPlans, setAvailableMembershipPlans] = useState<{ id: string; name: string }[]>([]);

  // Pagination state
  const [membersPerPage, setMembersPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Sorting state for member list
  const [sortColumn, setSortColumn] = useState<ColumnId | null>(null);
  const [sortAscending, setSortAscending] = useState<boolean>(true);

  function handleColumnSort(colId: ColumnId) {
    if (sortColumn === colId) {
      // Toggle direction
      setSortAscending(!sortAscending);
    } else {
      // New column, start ascending
      setSortColumn(colId);
      setSortAscending(true);
    }
    // Reset to first page when sorting changes
    setCurrentPage(1);
  }

  // Drag and drop state for column reordering
  const [draggingColumn, setDraggingColumn] = useState<ColumnId | null>(null);

  function handleDragStart(colId: ColumnId) {
    setDraggingColumn(colId);
  }

  function handleDrop(targetColId: ColumnId) {
    if (!draggingColumn || draggingColumn === targetColId || !activeTab) return;

    const activeReport = reportConfigs.find((r) => r.id === activeTab);
    if (!activeReport) return;

    // Build the full list of available columns including class type and style rank columns
    const classTypeColumns: ColumnId[] = (activeReport.selectedClassTypes || []).map(
      (ct) => `classType:${ct}` as ColumnId
    );
    const styleRankColumns: ColumnId[] = (activeReport.selectedStylesForRank || []).map(
      (style) => `styleRank:${style}` as ColumnId
    );
    const allBaseColumns: ColumnId[] = [...DEFAULT_COLUMN_ORDER];
    const allColumns: ColumnId[] = [...allBaseColumns, ...styleRankColumns, ...classTypeColumns];

    // Get saved column order, filter to valid columns, then append missing ones
    const savedOrder = activeReport.columnOrder || [];
    const currentOrder: ColumnId[] = [
      ...savedOrder.filter((col) => allColumns.includes(col)),
      ...allColumns.filter((col) => !savedOrder.includes(col))
    ];

    const fromIndex = currentOrder.indexOf(draggingColumn);
    const toIndex = currentOrder.indexOf(targetColId);

    if (fromIndex === -1 || toIndex === -1) return;

    const newOrder = [...currentOrder];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggingColumn);

    // Update the report config with new column order
    setReportConfigs((prev) =>
      prev.map((r) =>
        r.id === activeTab ? { ...r, columnOrder: newOrder } : r
      )
    );

    setDraggingColumn(null);
  }

  // Reset page to 1 when switching reports
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const enabledReports = reportConfigs.filter((r) => r.enabled);

  // Set active tab from URL parameter or default to first enabled report
  useEffect(() => {
    // Always respect URL tab parameter when navigating back to reports page
    if (tabFromUrl && enabledReports.find((r) => r.id === tabFromUrl)) {
      if (activeTab !== tabFromUrl) {
        setActiveTab(tabFromUrl);
      }
      setInitialTabSet(true);
    } else if (!initialTabSet) {
      // Only set default on initial load (no URL param)
      if (activeTab === null && enabledReports.length > 0) {
        setActiveTab(enabledReports[0].id);
        setInitialTabSet(true);
      } else if (activeTab && !enabledReports.find((r) => r.id === activeTab)) {
        setActiveTab(enabledReports[0]?.id || null);
      }
    }
  }, [enabledReports, activeTab, tabFromUrl, initialTabSet]);

  // Load saved configs from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ReportConfig[];
        const withDefaults = parsed.map((r) => ({
          ...r,
          type: r.type || (r.id as ReportType),
          fields: { ...DEFAULT_FIELDS, ...(r.fields || {}) },
        }));
        setReportConfigs(withDefaults);
      }
    } catch (err) {
      console.warn("Failed to load report configs", err);
    }
    // Mark as loaded so we can start saving
    setHasLoadedFromStorage(true);
  }, []);

  // Save configs to localStorage whenever they change (but only after initial load)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoadedFromStorage) return; // Don't save until we've loaded first
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reportConfigs));
    } catch (err) {
      console.warn("Failed to save report configs", err);
    }
  }, [reportConfigs, hasLoadedFromStorage]);

  useEffect(() => {
    async function fetchReportData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch styles for dropdown
        try {
          const stylesRes = await fetch("/api/styles");
          const stylesJson = await stylesRes.json();
          const styles = stylesJson.styles || [];
          setAvailableStyles(styles);

          // Extract all ranks from styles (sorted by order within each style)
          const allRanks: { id: string; name: string; styleId: string; styleName: string; order: number }[] = [];
          styles.forEach((style: any) => {
            if (style.ranks && Array.isArray(style.ranks)) {
              // Sort ranks by order before adding
              const sortedRanks = [...style.ranks].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
              sortedRanks.forEach((rank: any) => {
                allRanks.push({
                  id: rank.id,
                  name: rank.name,
                  styleId: style.id,
                  styleName: style.name,
                  order: rank.order || 0,
                });
              });
            }
          });
          setAvailableRanks(allRanks);
        } catch {
          setAvailableStyles([]);
          setAvailableRanks([]);
        }

        // Fetch class types for dropdown
        try {
          const classTypesRes = await fetch("/api/classes?types=true");
          const classTypesJson = await classTypesRes.json();
          const classTypes = (classTypesJson.classTypes || []).filter((ct: string) => ct && ct !== "Imported");
          setAvailableClassTypes(classTypes);
        } catch {
          setAvailableClassTypes([]);
        }

        // Fetch membership types for filter checkboxes
        try {
          const membershipTypesRes = await fetch("/api/membership-types");
          const membershipTypesJson = await membershipTypesRes.json();
          const membershipTypes = (membershipTypesJson.membershipTypes || []).map((mt: any) => ({
            id: mt.id,
            name: mt.name,
          }));
          setAvailableMembershipTypes(membershipTypes);
        } catch {
          setAvailableMembershipTypes([]);
        }

        // Fetch membership plans for filter checkboxes
        try {
          const membershipPlansRes = await fetch("/api/membership-plans");
          const membershipPlansJson = await membershipPlansRes.json();
          const membershipPlans = (membershipPlansJson.membershipPlans || []).map((mp: any) => ({
            id: mp.id,
            name: mp.name,
          }));
          setAvailableMembershipPlans(membershipPlans);
        } catch {
          setAvailableMembershipPlans([]);
        }

        const membersRes = await fetch("/api/members");
        const membersJson = await membersRes.json();
        const members = membersJson.members || [];

        const membershipConfig = reportConfigs.find((r) => r.type === "membership");
        const dateRange = getDateRange(membershipConfig?.dateRange || "month", membershipConfig?.customStartDate, membershipConfig?.customEndDate);

        const activeMembers = members.filter((m: any) => (m.status || "").toUpperCase().includes("ACTIVE") && !(m.status || "").toUpperCase().includes("INACTIVE")).length;
        const prospects = members.filter((m: any) => (m.status || "").toUpperCase().includes("PROSPECT")).length;
        const inactiveMembers = members.filter((m: any) => (m.status || "").toUpperCase().includes("INACTIVE")).length;
        const bannedMembers = members.filter((m: any) => (m.status || "").toUpperCase().includes("BANNED")).length;
        const coaches = members.filter((m: any) => (m.status || "").toUpperCase().includes("COACH")).length;
        const parents = members.filter((m: any) => (m.status || "").toUpperCase().includes("PARENT")).length;

        const newMembersThisPeriod = members.filter((m: any) => {
          const createdAt = new Date(m.createdAt);
          return createdAt >= dateRange.start && createdAt <= dateRange.end;
        }).length;

        // Count canceled members (status contains CANCELED) - use updatedAt as proxy for when canceled
        const canceledMembers = members.filter((m: any) => (m.status || "").toUpperCase().includes("CANCEL")).length;
        const canceledThisPeriod = members.filter((m: any) => {
          if (!(m.status || "").toUpperCase().includes("CANCEL")) return false;
          const updatedAt = new Date(m.updatedAt);
          return updatedAt >= dateRange.start && updatedAt <= dateRange.end;
        }).length;

        // Style breakdown
        const styleMap: Record<string, number> = {};
        members.forEach((m: any) => {
          const style = m.primaryStyle || "Not Set";
          styleMap[style] = (styleMap[style] || 0) + 1;
        });
        const styleBreakdown = Object.entries(styleMap).map(([style, count]) => ({ style, count })).sort((a, b) => b.count - a.count);

        // Rank distribution
        const rankMap: Record<string, { rank: string; style: string; count: number }> = {};
        members.forEach((m: any) => {
          if (m.rank) {
            const key = `${m.rank}-${m.primaryStyle || "Unknown"}`;
            if (!rankMap[key]) {
              rankMap[key] = { rank: m.rank, style: m.primaryStyle || "Unknown", count: 0 };
            }
            rankMap[key].count++;
          }
        });
        const rankDistribution = Object.values(rankMap).sort((a, b) => b.count - a.count);

        // Membership plan breakdown
        const planMap: Record<string, number> = {};
        members.forEach((m: any) => {
          const plan = m.membershipPlanName || "No Membership";
          planMap[plan] = (planMap[plan] || 0) + 1;
        });
        const membershipPlanBreakdown = Object.entries(planMap)
          .map(([plan, count]) => ({ plan, count }))
          .sort((a, b) => b.count - a.count);

        // Membership type breakdown
        const typeMap: Record<string, number> = {};
        members.forEach((m: any) => {
          const type = m.membershipTypeName || "No Membership";
          typeMap[type] = (typeMap[type] || 0) + 1;
        });
        const membershipTypeBreakdown = Object.entries(typeMap)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        setMembershipData({
          totalMembers: members.length,
          activeMembers,
          prospects,
          inactiveMembers,
          bannedMembers,
          coaches,
          parents,
          newMembersThisPeriod,
          canceledThisPeriod,
          canceledMembers,
          membersList: members,
          styleBreakdown,
          rankDistribution,
          membershipPlanBreakdown,
          membershipTypeBreakdown,
        });

        // Fetch attendance
        try {
          const attendanceConfig = reportConfigs.find((r) => r.type === "attendance");
          const attDateRange = getDateRange(attendanceConfig?.dateRange || "month", attendanceConfig?.customStartDate, attendanceConfig?.customEndDate);

          const attendanceRes = await fetch(
            `/api/reports/attendance?startDate=${attDateRange.start.toISOString()}&endDate=${attDateRange.end.toISOString()}`
          );
          const attendanceJson = await attendanceRes.json();
          const attendances = attendanceJson.attendances || [];

          const daysInRange = Math.max(1, Math.ceil((attDateRange.end.getTime() - attDateRange.start.getTime()) / (1000 * 60 * 60 * 24)));
          const uniqueMembers = new Set(attendances.map((a: any) => a.memberId));

          const attendeeMap: Record<string, { name: string; count: number }> = {};
          attendances.forEach((a: any) => {
            const key = a.memberId;
            if (!attendeeMap[key]) {
              attendeeMap[key] = { name: a.member?.firstName ? `${a.member.firstName} ${a.member.lastName || ""}`.trim() : "Unknown", count: 0 };
            }
            attendeeMap[key].count++;
          });
          const topAttendees = Object.values(attendeeMap).sort((a, b) => b.count - a.count).slice(0, 10);

          const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const dayMap: Record<string, number> = {};
          dayNames.forEach((d) => (dayMap[d] = 0));
          attendances.forEach((a: any) => {
            const date = new Date(a.attendanceDate);
            dayMap[dayNames[date.getDay()]]++;
          });
          const attendanceByDay = dayNames.map((day) => ({ day, count: dayMap[day] }));

          // Attendance by class
          const classMap: Record<string, number> = {};
          attendances.forEach((a: any) => {
            const className = a.classSession?.name || "Unknown Class";
            classMap[className] = (classMap[className] || 0) + 1;
          });
          const attendanceByClass = Object.entries(classMap).map(([className, count]) => ({ className, count })).sort((a, b) => b.count - a.count).slice(0, 10);

          // Attendance by style
          const styleAttMap: Record<string, number> = {};
          attendances.forEach((a: any) => {
            const style = a.classSession?.styleName || "Unknown";
            styleAttMap[style] = (styleAttMap[style] || 0) + 1;
          });
          const attendanceByStyle = Object.entries(styleAttMap).map(([style, count]) => ({ style, count })).sort((a, b) => b.count - a.count);

          // For per-member columns and no-show calculation, we need ALL attendance (not date-filtered)
          // Fetch all attendance for accurate totals
          const allAttendanceRes = await fetch("/api/reports/attendance?allTime=true");
          const allAttendanceJson = await allAttendanceRes.json();
          const allAttendances = allAttendanceJson.attendances || [];

          // No-show members (members who haven't attended within the threshold period)
          // Get the threshold from the attendance config
          const noShowThreshold = attendanceConfig?.fields?.noShowThreshold || "1month";
          const now = new Date();
          let thresholdDate = new Date();

          switch (noShowThreshold) {
            case "1week":
              thresholdDate.setDate(now.getDate() - 7);
              break;
            case "1month":
              thresholdDate.setMonth(now.getMonth() - 1);
              break;
            case "3months":
              thresholdDate.setMonth(now.getMonth() - 3);
              break;
            default:
              thresholdDate.setMonth(now.getMonth() - 1);
          }

          // Build a map of memberId to their last attendance date from ALL attendances
          const memberLastAttendance: Record<string, Date> = {};
          allAttendances.forEach((a: any) => {
            const attDate = new Date(a.attendanceDate);
            if (!memberLastAttendance[a.memberId] || attDate > memberLastAttendance[a.memberId]) {
              memberLastAttendance[a.memberId] = attDate;
            }
          });

          // Filter active members whose last attendance is before the threshold (or never attended)
          const noShowMembers = members
            .filter((m: any) => {
              if ((m.status || "").toUpperCase() !== "ACTIVE") return false;
              const lastAtt = memberLastAttendance[m.id];
              // Include if never attended OR last attendance is before threshold
              return !lastAtt || lastAtt < thresholdDate;
            })
            .map((m: any) => {
              const lastAtt = memberLastAttendance[m.id];
              return {
                name: `${m.firstName} ${m.lastName}`,
                lastAttendance: lastAtt ? lastAtt.toLocaleDateString() : "Never"
              };
            })
            .sort((a: { name: string; lastAttendance: string }, b: { name: string; lastAttendance: string }) => {
              // Sort by last attendance - "Never" first, then oldest to newest
              if (a.lastAttendance === "Never") return -1;
              if (b.lastAttendance === "Never") return 1;
              return new Date(a.lastAttendance).getTime() - new Date(b.lastAttendance).getTime();
            });

          // Build per-member attendance counts by class type (ALL TIME)
          // Only count attendance that matches the member's primary style OR is imported (source === "IMPORTED")
          // This matches how the member profile calculates style requirements

          // First, build a map of member ID to primary style
          const memberStyleMap: Record<string, string> = {};
          members.forEach((m: any) => {
            memberStyleMap[m.id] = m.primaryStyle || "";
          });

          const memberAttendanceCounts: Record<string, { total: number; [key: string]: number }> = {};
          allAttendances.forEach((a: any) => {
            const memberId = a.memberId;
            const memberPrimaryStyle = memberStyleMap[memberId] || "";
            const classStyleName = a.classSession?.styleName || "";
            const classStyleNames = a.classSession?.styleNames ? JSON.parse(a.classSession.styleNames) : [];
            const isImported = a.source === "IMPORTED";

            // Check if this attendance matches the member's primary style
            // Match if: styleName matches, OR styleNames array contains the style, OR it's imported
            const matchesStyle =
              isImported ||
              (memberPrimaryStyle && (
                classStyleName === memberPrimaryStyle ||
                classStyleNames.includes(memberPrimaryStyle)
              ));

            if (!matchesStyle) return; // Skip if doesn't match member's style

            if (!memberAttendanceCounts[memberId]) {
              memberAttendanceCounts[memberId] = { total: 0 };
            }
            memberAttendanceCounts[memberId].total++;
            const classType = a.classSession?.classType || "Other";
            if (memberAttendanceCounts[memberId][classType] !== undefined) {
              memberAttendanceCounts[memberId][classType]++;
            } else {
              memberAttendanceCounts[memberId][classType] = 1;
            }
          });

          // Enrich members with attendance counts
          members.forEach((m: any) => {
            const counts = memberAttendanceCounts[m.id] || { total: 0 };
            m.attendanceCounts = counts;
          });

          // Calculate check-ins for different periods
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday

          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

          const startOfYear = new Date(today.getFullYear(), 0, 1);

          const dailyCheckIns = allAttendances.filter((a: any) => {
            const d = new Date(a.attendanceDate);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
          }).length;

          const weeklyCheckIns = allAttendances.filter((a: any) => {
            const d = new Date(a.attendanceDate);
            return d >= startOfWeek && d <= now;
          }).length;

          const monthlyCheckIns = allAttendances.filter((a: any) => {
            const d = new Date(a.attendanceDate);
            return d >= startOfMonth && d <= now;
          }).length;

          const yearlyCheckIns = allAttendances.filter((a: any) => {
            const d = new Date(a.attendanceDate);
            return d >= startOfYear && d <= now;
          }).length;

          setAttendanceData({
            totalCheckIns: allAttendances.length,
            dailyCheckIns,
            weeklyCheckIns,
            monthlyCheckIns,
            yearlyCheckIns,
            avgDailyCheckIns: Math.round((attendances.length / daysInRange) * 10) / 10,
            uniqueAttendees: uniqueMembers.size,
            topAttendees,
            attendanceByDay,
            attendanceByClass,
            attendanceByStyle,
            noShowMembers,
          });
        } catch {
          setAttendanceData({
            totalCheckIns: 0,
            dailyCheckIns: 0,
            weeklyCheckIns: 0,
            monthlyCheckIns: 0,
            yearlyCheckIns: 0,
            avgDailyCheckIns: 0,
            uniqueAttendees: 0,
            topAttendees: [],
            attendanceByDay: [],
            attendanceByClass: [],
            attendanceByStyle: [],
            noShowMembers: [],
          });
        }

        // Fetch POS transactions
        try {
          const posRes = await fetch("/api/pos/transactions");
          const posJson = await posRes.json();
          const transactions = posJson.transactions || [];

          const revenueConfig = reportConfigs.find((r) => r.type === "revenue");
          const revDateRange = getDateRange(revenueConfig?.dateRange || "month", revenueConfig?.customStartDate, revenueConfig?.customEndDate);

          const filteredTransactions = transactions.filter((t: any) => {
            const date = new Date(t.createdAt);
            return date >= revDateRange.start && date <= revDateRange.end && t.status === "COMPLETED";
          });

          const totalRevenue = filteredTransactions.reduce((sum: number, t: any) => sum + (t.totalCents || 0), 0);
          const avgTransactionValue = filteredTransactions.length > 0 ? totalRevenue / filteredTransactions.length : 0;

          const productMap: Record<string, { name: string; revenue: number; quantity: number }> = {};
          const categoryMap: Record<string, number> = {};

          filteredTransactions.forEach((t: any) => {
            (t.POSLineItem || []).forEach((item: any) => {
              const key = item.itemName || "Unknown";
              if (!productMap[key]) {
                productMap[key] = { name: key, revenue: 0, quantity: 0 };
              }
              productMap[key].revenue += item.subtotalCents || 0;
              productMap[key].quantity += item.quantity || 0;

              const category = item.type || "product";
              categoryMap[category] = (categoryMap[category] || 0) + (item.subtotalCents || 0);
            });
          });

          const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
          const salesByCategory = Object.entries(categoryMap).map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue);

          // Bucket POS by month
          const posByMonth: Record<string, number> = {};
          filteredTransactions.forEach((t: any) => {
            const d = new Date(t.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            posByMonth[key] = (posByMonth[key] || 0) + (t.totalCents || 0);
          });

          // Fetch paid invoices for membership revenue
          let membershipRevenueCents = 0;
          const invByMonth: Record<string, number> = {};
          try {
            const invRes = await fetch("/api/invoices?status=PAID");
            const invJson = await invRes.json();
            const allInvoices = invJson.invoices || [];
            const filteredInvoices = allInvoices.filter((inv: any) => {
              const date = new Date(inv.paidAt || inv.createdAt);
              return date >= revDateRange.start && date <= revDateRange.end;
            });
            membershipRevenueCents = filteredInvoices.reduce(
              (sum: number, inv: any) => sum + (inv.amountCents || 0), 0
            );
            filteredInvoices.forEach((inv: any) => {
              const d = new Date(inv.paidAt || inv.createdAt);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              invByMonth[key] = (invByMonth[key] || 0) + (inv.amountCents || 0);
            });
          } catch { /* invoices optional */ }

          setRevenueData({
            totalRevenue: totalRevenue + membershipRevenueCents,
            membershipRevenue: membershipRevenueCents,
            posRevenue: totalRevenue,
            avgTransactionValue,
            transactionCount: filteredTransactions.length,
            topProducts,
            salesByCategory,
            refunds: 0,
            outstandingBalance: 0,
            monthlyPosRevenue: posByMonth,
            monthlyMembershipRevenue: invByMonth,
          });
        } catch {
          setRevenueData({
            totalRevenue: 0,
            membershipRevenue: 0,
            posRevenue: 0,
            avgTransactionValue: 0,
            transactionCount: 0,
            topProducts: [],
            salesByCategory: [],
            refunds: 0,
            outstandingBalance: 0,
            monthlyPosRevenue: {},
            monthlyMembershipRevenue: {},
          });
        }

        // Payment data - calculate from actual membership data (keep in cents for formatCurrency)
        const totalMonthlyPayments = members.reduce((sum: number, m: any) => sum + (m.monthlyPaymentCents || 0), 0);

        // Find expiring memberships (next 30 days)
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringMemberships = members
          .filter((m: any) => m.membershipEndDate && new Date(m.membershipEndDate) <= thirtyDaysFromNow && new Date(m.membershipEndDate) >= now)
          .map((m: any) => ({
            memberName: `${m.firstName} ${m.lastName}`,
            expiryDate: new Date(m.membershipEndDate).toLocaleDateString(),
            plan: m.membershipPlanName || "Unknown",
          }));

        setPaymentData({
          monthlyPayments: totalMonthlyPayments,
          failedPayments: [],
          pendingPayments: [],
          expiringMemberships,
        });

      } catch (err: any) {
        console.error("Error fetching report data:", err);
        setError(err.message || "Failed to load report data");
      } finally {
        setLoading(false);
      }
    }

    fetchReportData();
  }, [reportConfigs]);

  function getDateRange(range: ReportDateRange, customStart?: string, customEnd?: string): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    let start = new Date(now);
    start.setHours(0, 0, 0, 0);

    switch (range) {
      case "today":
        break;
      case "week":
        start.setDate(start.getDate() - 7);
        break;
      case "month":
        start.setMonth(start.getMonth() - 1);
        break;
      case "quarter":
        start.setMonth(start.getMonth() - 3);
        break;
      case "year":
        start.setFullYear(start.getFullYear() - 1);
        break;
      case "custom":
        if (customStart) start = new Date(customStart);
        if (customEnd) {
          const customEndDate = new Date(customEnd);
          customEndDate.setHours(23, 59, 59, 999);
          return { start, end: customEndDate };
        }
        break;
    }

    return { start, end };
  }

  function formatCurrency(cents: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  }

  function getDateRangeLabel(range: ReportDateRange, customStart?: string, customEnd?: string): string {
    switch (range) {
      case "today":
        return "Today";
      case "week":
        return "Last 7 Days";
      case "month":
        return "Last 30 Days";
      case "quarter":
        return "Last 3 Months";
      case "year":
        return "Last 12 Months";
      case "custom":
        if (customStart && customEnd) {
          return `${new Date(customStart).toLocaleDateString()} - ${new Date(customEnd).toLocaleDateString()}`;
        }
        return "Custom Range";
      default:
        return "";
    }
  }

  function updateReportConfig(id: string, updates: Partial<ReportConfig>) {
    setReportConfigs((current) =>
      current.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  }

  function deleteReport(id: string) {
    setReportConfigs((current) => current.filter((r) => r.id !== id));
    if (activeTab === id) {
      const remaining = reportConfigs.filter((r) => r.id !== id && r.enabled);
      setActiveTab(remaining[0]?.id || null);
    }
  }

  // Opens the edit modal and preserves existing config values
  function openEditModal(id: string) {
    const existingConfig = reportConfigs.find((r) => r.id === id);
    if (!existingConfig) return;

    // Preserve the existing config as-is (including fields, selectedClassTypes, filters, etc.)
    setEditingConfig({ ...existingConfig });
    setEditingReport(id);
  }

  // Update temporary editing config (not the actual reportConfigs)
  function updateEditingConfig(updates: Partial<ReportConfig>) {
    if (!editingConfig) return;
    setEditingConfig({ ...editingConfig, ...updates });
  }

  // Update a field in the temporary editing config
  function updateEditingField(fieldKey: keyof ReportDataFields, value: boolean) {
    if (!editingConfig) return;
    setEditingConfig({
      ...editingConfig,
      fields: { ...editingConfig.fields, [fieldKey]: value },
    });
  }

  // Toggle all fields in a category for the temp editing config
  function toggleEditingCategoryFields(categoryFields: { key: string; label: string }[], enable: boolean) {
    if (!editingConfig) return;
    const updatedFields = { ...editingConfig.fields };
    categoryFields.forEach((f) => {
      (updatedFields as any)[f.key] = enable;
    });
    setEditingConfig({ ...editingConfig, fields: updatedFields });
  }

  // Save the temporary editing config to reportConfigs
  function saveEditingConfig() {
    if (!editingConfig || !editingReport) return;

    // Check if this is a new report (not yet in reportConfigs)
    const existingIndex = reportConfigs.findIndex((r) => r.id === editingConfig.id);

    if (existingIndex >= 0) {
      // Update existing report
      setReportConfigs((current) =>
        current.map((r) => (r.id === editingConfig.id ? editingConfig : r))
      );
    } else {
      // Add new report
      setReportConfigs((current) => [...current, editingConfig]);
    }

    setEditingConfig(null);
    setEditingReport(null);
  }

  // Cancel editing and discard changes
  function cancelEditing() {
    // If this was a new report that wasn't saved, we need to handle it
    if (editingConfig && editingReport) {
      const existsInConfigs = reportConfigs.some((r) => r.id === editingConfig.id);
      if (!existsInConfigs) {
        // This was a new report that wasn't saved, reset activeTab if needed
        if (activeTab === editingConfig.id) {
          setActiveTab(reportConfigs[0]?.id || null);
        }
      }
    }
    setEditingConfig(null);
    setEditingReport(null);
  }

  function addReport() {
    const newId = `custom-${Date.now()}`;
    // These fields should default to TRUE for new reports
    const defaultTrueFields = [
      "showMemberNames", "showMemberAddresses", "showMemberNumber",
      "showMemberEmails", "showMemberDOB", "showMemberPhones", "showMemberAge"
    ];

    // Create all-false fields, then set specific ones to true
    const newFields: ReportDataFields = Object.keys(DEFAULT_FIELDS).reduce((acc, key) => {
      (acc as any)[key] = false;
      return acc;
    }, {} as ReportDataFields);

    defaultTrueFields.forEach((key) => {
      (newFields as any)[key] = true;
    });

    const newReport: ReportConfig = {
      id: newId,
      name: "New Report",
      description: "Custom report",
      type: "custom",
      enabled: true,
      dateRange: "month",
      fields: newFields,
    };

    // Don't add to reportConfigs yet - just set as editing config
    // It will be added when Save Changes is clicked
    setEditingConfig(newReport);
    setActiveTab(newId);
    setEditingReport(newId);
  }

  function resetToDefaults() {
    setReportConfigs(DEFAULT_REPORTS);
    setActiveTab(DEFAULT_REPORTS[0].id);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function getReportConfig(id: string): ReportConfig | undefined {
    return reportConfigs.find((r) => r.id === id);
  }

  const activeReport = activeTab ? getReportConfig(activeTab) : null;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-sm text-gray-600">
              Membership analytics, attendance tracking, and revenue summaries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
            >
              Manage Reports
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
            >
              Print / Export
            </button>
            <button
              type="button"
              onClick={() => {
                const reportType = enabledReports.find(r => r.id === activeTab)?.type || "members";
                const typeMap: Record<string, string> = {
                  membership: "memberships",
                  attendance: "attendance",
                  revenue: "revenue",
                  retention: "members",
                  custom: "members",
                };
                const endpoint = typeMap[reportType] || "members";
                window.open(`/api/export/${endpoint}`, "_blank");
              }}
              className="text-xs rounded-md border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download CSV
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex items-center gap-1 overflow-x-auto">
            {enabledReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setActiveTab(report.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === report.id
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {report.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addReport()}
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
              title="Add Report"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
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
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-gray-500">Loading report data...</div>
          </div>
        ) : activeReport ? (
          <div className="space-y-4">
            <ReportSection
              title={activeReport.name}
              dateRangeLabel={getDateRangeLabel(activeReport.dateRange, activeReport.customStartDate, activeReport.customEndDate)}
              onEdit={() => openEditModal(activeReport.id)}
              onDelete={() => { if (confirm(`Delete "${activeReport.name}"?`)) deleteReport(activeReport.id); }}
            >
              {/* Membership Stats */}
              {(activeReport.fields.showTotalMembers || activeReport.fields.showActiveMembers || activeReport.fields.showProspects ||
                activeReport.fields.showInactiveMembers || activeReport.fields.showBannedMembers || activeReport.fields.showCoaches ||
                activeReport.fields.showParents || activeReport.fields.showNewMembers || activeReport.fields.showCanceledMembers) && membershipData && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Membership Statistics</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {activeReport.fields.showTotalMembers && <StatCard label="Total Members" value={membershipData.totalMembers} />}
                    {activeReport.fields.showActiveMembers && <StatCard label="Active" value={membershipData.activeMembers} color="green" />}
                    {activeReport.fields.showProspects && <StatCard label="Prospects" value={membershipData.prospects} color="yellow" />}
                    {activeReport.fields.showInactiveMembers && <StatCard label="Inactive" value={membershipData.inactiveMembers} color="gray" />}
                    {activeReport.fields.showBannedMembers && <StatCard label="Banned" value={membershipData.bannedMembers} color="red" />}
                    {activeReport.fields.showCoaches && <StatCard label="Coaches" value={membershipData.coaches} color="blue" />}
                    {activeReport.fields.showParents && <StatCard label="Parents" value={membershipData.parents} />}
                    {activeReport.fields.showNewMembers && <StatCard label="New This Period" value={membershipData.newMembersThisPeriod} color="green" />}
                    {activeReport.fields.showCanceledMembers && <StatCard label="Canceled but Active" value={membershipData.canceledMembers} color="red" />}
                  </div>
                </div>
              )}

              {/* Status Distribution */}
              {activeReport.fields.showStatusDistribution && membershipData && membershipData.totalMembers > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Status Distribution</h4>
                  <div className="flex gap-1 h-8 rounded-md overflow-hidden">
                    {membershipData.activeMembers > 0 && (
                      <div
                        className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                        style={{ width: `${(membershipData.activeMembers / membershipData.totalMembers) * 100}%` }}
                        title={`Active: ${membershipData.activeMembers}`}
                      >
                        {Math.round((membershipData.activeMembers / membershipData.totalMembers) * 100)}%
                      </div>
                    )}
                    {membershipData.prospects > 0 && (
                      <div
                        className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                        style={{ width: `${(membershipData.prospects / membershipData.totalMembers) * 100}%` }}
                        title={`Prospects: ${membershipData.prospects}`}
                      >
                        {Math.round((membershipData.prospects / membershipData.totalMembers) * 100)}%
                      </div>
                    )}
                    {membershipData.inactiveMembers > 0 && (
                      <div
                        className="bg-gray-400 flex items-center justify-center text-white text-xs font-medium"
                        style={{ width: `${(membershipData.inactiveMembers / membershipData.totalMembers) * 100}%` }}
                        title={`Inactive: ${membershipData.inactiveMembers}`}
                      >
                        {Math.round((membershipData.inactiveMembers / membershipData.totalMembers) * 100)}%
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> Active</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> Prospects</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-400 rounded"></span> Inactive</span>
                  </div>
                </div>
              )}

              {/* Membership Plans Breakdown */}
              {activeReport.fields.showMembershipPlanDistribution && membershipData && membershipData.membershipPlanBreakdown.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Members by Membership Plan</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {membershipData.membershipPlanBreakdown.map((item, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-sm font-medium text-gray-900">{item.plan}</p>
                        <p className="text-xl font-bold text-primary">{item.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Membership Types Breakdown */}
              {activeReport.fields.showMembershipTypeDistribution && membershipData && membershipData.membershipTypeBreakdown.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Members by Membership Type</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {membershipData.membershipTypeBreakdown.map((item, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-sm font-medium text-gray-900">{item.type}</p>
                        <p className="text-xl font-bold text-primary">{item.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Style Breakdown */}
              {activeReport.fields.showStyleBreakdown && membershipData && membershipData.styleBreakdown.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Members by Style</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {membershipData.styleBreakdown.map((item, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-sm font-medium text-gray-900">{item.style}</p>
                        <p className="text-xl font-bold text-primary">{item.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rank Distribution */}
              {activeReport.fields.showRankDistribution && membershipData && membershipData.rankDistribution.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Rank Distribution</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase">
                          <th className="pb-2 font-medium">Rank</th>
                          <th className="pb-2 font-medium">Style</th>
                          <th className="pb-2 font-medium text-right">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {membershipData.rankDistribution.slice(0, 15).map((item, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2 text-gray-900 font-medium">{item.rank}</td>
                            <td className="py-2 text-gray-600">{item.style}</td>
                            <td className="py-2 text-right font-medium text-gray-900">{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Member List */}
              {activeReport.fields.showMemberNames && membershipData && (
                <div className="mb-6">
                  {(() => {
                    // Filter members based on selected status checkboxes, styles, ranks, and memberships
                    const filteredMembers = membershipData.membersList.filter((m: any) => {
                      // Filter by styles if specified (multiple selection)
                      if (activeReport.filterByStyles && activeReport.filterByStyles.length > 0) {
                        let memberHasSelectedStyle = false;

                        // Normalize filter styles to lowercase for case-insensitive comparison
                        const filterStylesLower = activeReport.filterByStyles.map(s => s.toLowerCase());

                        // Check primaryStyle (case-insensitive)
                        if (m.primaryStyle && filterStylesLower.includes(m.primaryStyle.toLowerCase())) {
                          memberHasSelectedStyle = true;
                        }

                        // Check stylesNotes for any of the selected styles (case-insensitive)
                        if (!memberHasSelectedStyle && m.stylesNotes) {
                          try {
                            const stylesArray = JSON.parse(m.stylesNotes);
                            if (Array.isArray(stylesArray)) {
                              memberHasSelectedStyle = stylesArray.some((s: any) =>
                                s.name && filterStylesLower.includes(s.name.toLowerCase())
                              );
                            }
                          } catch {}
                        }

                        if (!memberHasSelectedStyle) return false;
                      }

                      // Filter by ranks if specified (multiple selection)
                      // Format is "styleName:rankName" to allow filtering by specific style+rank combinations
                      if (activeReport.filterByRanks && activeReport.filterByRanks.length > 0) {
                        let memberHasSelectedRank = false;

                        // Normalize filter ranks to lowercase for case-insensitive comparison
                        const filterRanksLower = activeReport.filterByRanks.map(r => r.toLowerCase());

                        // Check primary style + rank combination (case-insensitive)
                        if (m.primaryStyle && m.rank) {
                          const primaryKey = `${m.primaryStyle}:${m.rank}`.toLowerCase();
                          if (filterRanksLower.includes(primaryKey)) {
                            memberHasSelectedRank = true;
                          }
                        }

                        // Check ranks in stylesNotes (case-insensitive)
                        if (!memberHasSelectedRank && m.stylesNotes) {
                          try {
                            const stylesArray = JSON.parse(m.stylesNotes);
                            if (Array.isArray(stylesArray)) {
                              memberHasSelectedRank = stylesArray.some((s: any) => {
                                if (s.name && s.rank) {
                                  const styleRankKey = `${s.name}:${s.rank}`.toLowerCase();
                                  return filterRanksLower.includes(styleRankKey);
                                }
                                return false;
                              });
                            }
                          } catch {}
                        }

                        if (!memberHasSelectedRank) return false;
                      }

                      // Filter by membership types if specified
                      if (activeReport.filterByMembershipTypes && activeReport.filterByMembershipTypes.length > 0) {
                        const memberMembershipType = m.membershipTypeName || "No Membership";
                        if (!activeReport.filterByMembershipTypes.includes(memberMembershipType)) {
                          return false;
                        }
                      }

                      // Filter by membership plans if specified
                      if (activeReport.filterByMembershipPlans && activeReport.filterByMembershipPlans.length > 0) {
                        const memberMembershipPlan = m.membershipPlanName || "No Plan";
                        if (!activeReport.filterByMembershipPlans.includes(memberMembershipPlan)) {
                          return false;
                        }
                      }

                      const status = (m.status || "").toUpperCase();
                      const statusFilters: boolean[] = [];

                      // Check which status filters are enabled
                      if (activeReport.fields.showActiveMembers) {
                        statusFilters.push(status.includes("ACTIVE") && !status.includes("INACTIVE"));
                      }
                      if (activeReport.fields.showProspects) {
                        statusFilters.push(status.includes("PROSPECT"));
                      }
                      if (activeReport.fields.showInactiveMembers) {
                        statusFilters.push(status.includes("INACTIVE"));
                      }
                      if (activeReport.fields.showBannedMembers) {
                        statusFilters.push(status.includes("BANNED"));
                      }
                      if (activeReport.fields.showCoaches) {
                        statusFilters.push(status.includes("COACH"));
                      }
                      if (activeReport.fields.showParents) {
                        statusFilters.push(status.includes("PARENT"));
                      }

                      // If no status filters are selected, show all members
                      if (!activeReport.fields.showActiveMembers &&
                          !activeReport.fields.showProspects &&
                          !activeReport.fields.showInactiveMembers &&
                          !activeReport.fields.showBannedMembers &&
                          !activeReport.fields.showCoaches &&
                          !activeReport.fields.showParents) {
                        return true;
                      }

                      // Member matches if any of the enabled filters match
                      if (activeReport.fields.showActiveMembers && status.includes("ACTIVE") && !status.includes("INACTIVE")) return true;
                      if (activeReport.fields.showProspects && status.includes("PROSPECT")) return true;
                      if (activeReport.fields.showInactiveMembers && status.includes("INACTIVE")) return true;
                      if (activeReport.fields.showBannedMembers && status.includes("BANNED")) return true;
                      if (activeReport.fields.showCoaches && status.includes("COACH")) return true;
                      if (activeReport.fields.showParents && status.includes("PARENT")) return true;

                      // Include members with blank/unrecognized status when "Active" is checked
                      // This catches members whose status doesn't match any known category
                      if (activeReport.fields.showActiveMembers) {
                        const hasKnownStatus = status.includes("ACTIVE") || status.includes("INACTIVE") ||
                          status.includes("PROSPECT") || status.includes("BANNED") ||
                          status.includes("COACH") || status.includes("PARENT") ||
                          status.includes("CANCEL");
                        if (!hasKnownStatus) return true;
                      }

                      return false;
                    });

                    // Build filter description
                    const activeFilters: string[] = [];
                    if (activeReport.filterByStyles && activeReport.filterByStyles.length > 0) {
                      activeFilters.push(`Styles: ${activeReport.filterByStyles.join(", ")}`);
                    }
                    if (activeReport.filterByRanks && activeReport.filterByRanks.length > 0) {
                      // Group ranks by style for display
                      const ranksByStyle: Record<string, string[]> = {};
                      activeReport.filterByRanks.forEach(rankKey => {
                        const [styleName, rankName] = rankKey.split(":");
                        if (!ranksByStyle[styleName]) ranksByStyle[styleName] = [];
                        ranksByStyle[styleName].push(rankName);
                      });
                      const rankDisplay = Object.entries(ranksByStyle)
                        .map(([style, ranks]) => `${style}: ${ranks.join(", ")}`)
                        .join(" | ");
                      activeFilters.push(`Ranks: ${rankDisplay}`);
                    }
                    if (activeReport.fields.showActiveMembers) activeFilters.push("Active");
                    if (activeReport.fields.showProspects) activeFilters.push("Prospects");
                    if (activeReport.fields.showInactiveMembers) activeFilters.push("Inactive");
                    if (activeReport.fields.showBannedMembers) activeFilters.push("Banned");
                    if (activeReport.fields.showCoaches) activeFilters.push("Coaches");
                    if (activeReport.fields.showParents) activeFilters.push("Parents");
                    if (activeReport.filterByMembershipTypes && activeReport.filterByMembershipTypes.length > 0) {
                      activeFilters.push(`Types: ${activeReport.filterByMembershipTypes.join(", ")}`);
                    }
                    if (activeReport.filterByMembershipPlans && activeReport.filterByMembershipPlans.length > 0) {
                      activeFilters.push(`Plans: ${activeReport.filterByMembershipPlans.join(", ")}`);
                    }

                    // Sort members if a sort column is selected
                    const sortedMembers = sortColumn ? [...filteredMembers].sort((a: any, b: any) => {
                      let aVal: any;
                      let bVal: any;

                      // Get values based on column type
                      if (isClassTypeColumn(sortColumn)) {
                        const classTypeName = getClassTypeName(sortColumn);
                        aVal = a.attendanceCounts?.[classTypeName] || 0;
                        bVal = b.attendanceCounts?.[classTypeName] || 0;
                      } else if (isStyleRankColumn(sortColumn)) {
                        const styleName = getStyleRankName(sortColumn);
                        // Get rank for the style
                        const getRankForStyle = (member: any) => {
                          if (member.primaryStyle === styleName) return (member.rank || "").toLowerCase();
                          if (member.stylesNotes) {
                            try {
                              const stylesArray = JSON.parse(member.stylesNotes);
                              if (Array.isArray(stylesArray)) {
                                const styleEntry = stylesArray.find((s: any) => s.name === styleName);
                                if (styleEntry?.rank) return styleEntry.rank.toLowerCase();
                              }
                            } catch {}
                          }
                          return "";
                        };
                        aVal = getRankForStyle(a);
                        bVal = getRankForStyle(b);
                      } else {
                        switch (sortColumn) {
                          case "firstName":
                            aVal = (a.firstName || "").toLowerCase();
                            bVal = (b.firstName || "").toLowerCase();
                            break;
                          case "lastName":
                            aVal = (a.lastName || "").toLowerCase();
                            bVal = (b.lastName || "").toLowerCase();
                            break;
                          case "status":
                            aVal = (a.status || "").toLowerCase();
                            bVal = (b.status || "").toLowerCase();
                            break;
                          case "memberNumber":
                            aVal = a.memberNumber || "";
                            bVal = b.memberNumber || "";
                            break;
                          case "email":
                            aVal = (a.email || "").toLowerCase();
                            bVal = (b.email || "").toLowerCase();
                            break;
                          case "phone":
                            aVal = a.phone || "";
                            bVal = b.phone || "";
                            break;
                          case "style":
                            aVal = (a.primaryStyle || "").toLowerCase();
                            bVal = (b.primaryStyle || "").toLowerCase();
                            break;
                          case "rank":
                            aVal = (a.rank || "").toLowerCase();
                            bVal = (b.rank || "").toLowerCase();
                            break;
                          case "joinDate":
                            aVal = a.startDate ? new Date(a.startDate).getTime() : 0;
                            bVal = b.startDate ? new Date(b.startDate).getTime() : 0;
                            break;
                          case "waiver":
                            aVal = a.waiverSigned ? 1 : 0;
                            bVal = b.waiverSigned ? 1 : 0;
                            break;
                          case "totalClasses":
                            aVal = a.attendanceCounts?.total || 0;
                            bVal = b.attendanceCounts?.total || 0;
                            break;
                          default:
                            aVal = "";
                            bVal = "";
                        }
                      }

                      // Compare values
                      if (typeof aVal === "number" && typeof bVal === "number") {
                        return sortAscending ? aVal - bVal : bVal - aVal;
                      }
                      const comparison = String(aVal).localeCompare(String(bVal));
                      return sortAscending ? comparison : -comparison;
                    }) : filteredMembers;

                    // Pagination calculations
                    const totalMembers = sortedMembers.length;
                    const totalPages = Math.ceil(totalMembers / membersPerPage);
                    const startIndex = (currentPage - 1) * membersPerPage;
                    const endIndex = Math.min(startIndex + membersPerPage, totalMembers);
                    const paginatedMembers = sortedMembers.slice(startIndex, endIndex);

                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <h4 className="text-xs font-medium text-gray-500 uppercase">
                            Member List ({filteredMembers.length})
                            {activeFilters.length > 0 && (
                              <span className="ml-2 text-gray-400 font-normal normal-case">
                                — {activeFilters.join(", ")}
                              </span>
                            )}
                            {activeReport.selectedStylesForRank && activeReport.selectedStylesForRank.length > 0 && (
                              <span className="ml-2 text-primary font-normal">
                                (Showing {activeReport.selectedStylesForRank.join(", ")} Ranks)
                              </span>
                            )}
                          </h4>
                          <div className="flex items-center gap-2 text-sm">
                            <label className="text-gray-500">Show:</label>
                            <select
                              value={membersPerPage}
                              onChange={(e) => {
                                setMembersPerPage(Number(e.target.value));
                                setCurrentPage(1);
                              }}
                              className="border border-gray-300 rounded px-2 py-1 text-sm"
                            >
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                            <span className="text-gray-500">per page</span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          {(() => {
                            // Build the full list of available columns including class type and style rank columns
                            const classTypeColumns: ColumnId[] = (activeReport.selectedClassTypes || []).map(
                              (ct) => `classType:${ct}` as ColumnId
                            );
                            const styleRankColumns: ColumnId[] = (activeReport.selectedStylesForRank || []).map(
                              (style) => `styleRank:${style}` as ColumnId
                            );

                            // Get saved column order, or use default + dynamic columns
                            const savedOrder = activeReport.columnOrder || [];

                            // Build column order: start with saved order, then add any missing columns
                            const allBaseColumns: ColumnId[] = [...DEFAULT_COLUMN_ORDER];
                            const allColumns: ColumnId[] = [...allBaseColumns, ...styleRankColumns, ...classTypeColumns];

                            // Filter saved order to only include valid columns, then append any missing ones
                            const columnOrder: ColumnId[] = [
                              ...savedOrder.filter((col) => allColumns.includes(col)),
                              ...allColumns.filter((col) => !savedOrder.includes(col))
                            ];

                            const enabledColumns = columnOrder.filter((colId) => {
                              // Handle class type columns
                              if (isClassTypeColumn(colId)) {
                                const classTypeName = getClassTypeName(colId);
                                return (activeReport.selectedClassTypes || []).includes(classTypeName);
                              }
                              // Handle style rank columns
                              if (isStyleRankColumn(colId)) {
                                const styleName = getStyleRankName(colId);
                                return (activeReport.selectedStylesForRank || []).includes(styleName);
                              }
                              // Handle base columns
                              switch (colId) {
                                case "firstName":
                                case "lastName":
                                case "status":
                                  return true;
                                case "memberNumber":
                                  return activeReport.fields.showMemberNumber;
                                case "email":
                                  return activeReport.fields.showMemberEmails;
                                case "phone":
                                  return activeReport.fields.showMemberPhones;
                                case "style":
                                  return activeReport.fields.showPrimaryStyle;
                                case "rank":
                                  return activeReport.fields.showBeltRanks;
                                case "joinDate":
                                  return activeReport.fields.showJoinDate;
                                case "waiver":
                                  return activeReport.fields.showWaiverStatus;
                                case "membershipType":
                                  return activeReport.fields.showMembershipTypes;
                                case "membershipPlan":
                                  return activeReport.fields.showMembershipPlans;
                                case "monthlyPayment":
                                  return activeReport.fields.showMonthlyPayments;
                                case "autoRenew":
                                  return activeReport.fields.showAutoRenewStatus;
                                case "expirationDate":
                                  return activeReport.fields.showMembershipExpiring;
                                case "totalClasses":
                                  return activeReport.fields.showTotalClassCount;
                                default:
                                  return false;
                              }
                            });

                            // Helper to render header for a column
                            const renderHeader = (colId: ColumnId) => {
                              // Handle class type columns
                              if (isClassTypeColumn(colId)) {
                                return getClassTypeName(colId);
                              }
                              // Handle style rank columns
                              if (isStyleRankColumn(colId)) {
                                return `${getStyleRankName(colId)} Rank`;
                              }
                              // Handle base columns
                              switch (colId) {
                                case "rank":
                                  return "Primary Rank";
                                case "totalClasses":
                                  return "Total Classes";
                                default:
                                  return COLUMN_LABELS[colId as BaseColumnId];
                              }
                            };

                            return (
                              <table className="min-w-full text-sm">
                                <thead className="bg-white">
                                  <tr className="text-left text-xs text-gray-500 uppercase">
                                    {enabledColumns.map((colId) => (
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
                                        onClick={() => handleColumnSort(colId)}
                                        className={`pb-2 font-medium cursor-pointer select-none hover:text-primary ${
                                          colId === "totalClasses" || isClassTypeColumn(colId) ? "text-center" : ""
                                        } ${
                                          draggingColumn === colId ? "bg-gray-100" : ""
                                        } ${
                                          sortColumn === colId ? "text-primary" : ""
                                        }`}
                                      >
                                        {renderHeader(colId)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedMembers.map((m: any) => {
                                    // Get primary rank for the "rank" column
                                    const displayRank = m.rank || "—";
                                    // Determine which status to display based on active filters
                                    let displayStatus = m.status || "—";
                                    const memberStatus = (m.status || "").toUpperCase();

                                    const activeStatusFilters: string[] = [];
                                    if (activeReport.fields.showActiveMembers && memberStatus.includes("ACTIVE") && !memberStatus.includes("INACTIVE")) {
                                      activeStatusFilters.push("ACTIVE");
                                    }
                                    if (activeReport.fields.showProspects && memberStatus.includes("PROSPECT")) {
                                      activeStatusFilters.push("PROSPECT");
                                    }
                                    if (activeReport.fields.showInactiveMembers && memberStatus.includes("INACTIVE")) {
                                      activeStatusFilters.push("INACTIVE");
                                    }
                                    if (activeReport.fields.showBannedMembers && memberStatus.includes("BANNED")) {
                                      activeStatusFilters.push("BANNED");
                                    }
                                    if (activeReport.fields.showCoaches && memberStatus.includes("COACH")) {
                                      activeStatusFilters.push("COACH");
                                    }
                                    if (activeReport.fields.showParents && memberStatus.includes("PARENT")) {
                                      activeStatusFilters.push("PARENT");
                                    }

                                    if (activeStatusFilters.length === 1) {
                                      displayStatus = activeStatusFilters[0];
                                    }

                                    // Helper to render cell content for a column
                                    const renderCell = (colId: ColumnId) => {
                                      // Handle class type columns
                                      if (isClassTypeColumn(colId)) {
                                        const classTypeName = getClassTypeName(colId);
                                        return m.attendanceCounts?.[classTypeName] || 0;
                                      }
                                      // Handle style rank columns
                                      if (isStyleRankColumn(colId)) {
                                        const styleName = getStyleRankName(colId);
                                        // Check if member's primary style matches
                                        if (m.primaryStyle === styleName) {
                                          return m.rank || "—";
                                        }
                                        // Check stylesNotes for the rank
                                        if (m.stylesNotes) {
                                          try {
                                            const stylesArray = JSON.parse(m.stylesNotes);
                                            if (Array.isArray(stylesArray)) {
                                              const styleEntry = stylesArray.find((s: any) => s.name === styleName);
                                              if (styleEntry?.rank) {
                                                return styleEntry.rank;
                                              }
                                            }
                                          } catch {}
                                        }
                                        return "—";
                                      }
                                      // Handle base columns
                                      switch (colId) {
                                        case "firstName":
                                          return (
                                            <Link
                                              href={`/members/${m.id}?fromReport=${activeReport.id}`}
                                              className="text-primary hover:text-primaryDark hover:underline font-medium"
                                            >
                                              {m.firstName}
                                            </Link>
                                          );
                                        case "lastName":
                                          return (
                                            <Link
                                              href={`/members/${m.id}?fromReport=${activeReport.id}`}
                                              className="text-primary hover:text-primaryDark hover:underline font-medium"
                                            >
                                              {m.lastName}
                                            </Link>
                                          );
                                        case "status":
                                          return displayStatus;
                                        case "memberNumber":
                                          return m.memberNumber || "—";
                                        case "email":
                                          return m.email || "—";
                                        case "phone":
                                          return m.phone || "—";
                                        case "style":
                                          return m.primaryStyle || "—";
                                        case "rank":
                                          return displayRank;
                                        case "joinDate":
                                          return m.startDate ? new Date(m.startDate).toLocaleDateString() : "—";
                                        case "waiver":
                                          return m.waiverSigned ? "Signed" : "Not Signed";
                                        case "membershipType":
                                          return m.membershipTypeName || "—";
                                        case "membershipPlan":
                                          return m.membershipPlanName || "—";
                                        case "monthlyPayment":
                                          return m.monthlyPaymentCents ? `$${(m.monthlyPaymentCents / 100).toFixed(2)}` : "—";
                                        case "autoRenew":
                                          return m.autoRenew === true ? "Yes" : m.autoRenew === false ? "No" : "—";
                                        case "expirationDate":
                                          return m.membershipEndDate ? new Date(m.membershipEndDate).toLocaleDateString() : "—";
                                        case "totalClasses":
                                          return m.attendanceCounts?.total || 0;
                                        default:
                                          return "—";
                                      }
                                    };

                                    return (
                                      <tr key={m.id} className="border-t border-gray-100">
                                        {enabledColumns.map((colId) => (
                                          <td
                                            key={colId}
                                            className={`py-2 ${colId === "firstName" || colId === "lastName" ? "" : "text-gray-600"} ${colId === "totalClasses" || isClassTypeColumn(colId) ? "text-center" : ""}`}
                                          >
                                            {renderCell(colId)}
                                          </td>
                                        ))}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            );
                          })()}
                        </div>
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                            <div className="text-sm text-gray-500">
                              Showing {startIndex + 1} to {endIndex} of {totalMembers} members
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                First
                              </button>
                              <button
                                onClick={() => setCurrentPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Previous
                              </button>
                              <span className="px-3 py-1 text-xs">
                                Page {currentPage} of {totalPages}
                              </span>
                              <button
                                onClick={() => setCurrentPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                              <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Last
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Attendance Stats */}
              {(activeReport.fields.showTotalCheckIns || activeReport.fields.showAvgDailyCheckIns || activeReport.fields.showUniqueAttendees) && attendanceData && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Attendance Statistics</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {activeReport.fields.showTotalCheckIns && (
                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">Check-Ins</span>
                          <select
                            value={activeReport.fields.checkInPeriod || "total"}
                            onChange={(e) => updateReportConfig(activeReport.id, {
                              fields: { ...activeReport.fields, checkInPeriod: e.target.value as "daily" | "weekly" | "monthly" | "yearly" | "total" }
                            })}
                            className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                            <option value="total">Total</option>
                          </select>
                        </div>
                        <p className="text-xl font-bold text-gray-900">
                          {activeReport.fields.checkInPeriod === "daily" ? attendanceData.dailyCheckIns :
                           activeReport.fields.checkInPeriod === "weekly" ? attendanceData.weeklyCheckIns :
                           activeReport.fields.checkInPeriod === "monthly" ? attendanceData.monthlyCheckIns :
                           activeReport.fields.checkInPeriod === "yearly" ? attendanceData.yearlyCheckIns :
                           attendanceData.totalCheckIns}
                        </p>
                      </div>
                    )}
                    {activeReport.fields.showAvgDailyCheckIns && <StatCard label="Avg Daily Check-Ins" value={attendanceData.avgDailyCheckIns} />}
                    {activeReport.fields.showUniqueAttendees && <StatCard label="Unique Attendees" value={attendanceData.uniqueAttendees} />}
                  </div>
                </div>
              )}

              {/* Attendance Detail Boxes - 3 column grid */}
              {attendanceData && (activeReport.fields.showTopAttendees || activeReport.fields.showAttendanceByDay ||
                activeReport.fields.showAttendanceByClass || activeReport.fields.showAttendanceByStyle ||
                activeReport.fields.showNoShowMembers) && (
                <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Top Attendees */}
                  {activeReport.fields.showTopAttendees && attendanceData.topAttendees.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Top Attendees</h4>
                      <div className="space-y-2">
                        {attendanceData.topAttendees.map((attendee, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">
                              <span className="text-gray-400 mr-2">{i + 1}.</span>
                              {attendee.name}
                            </span>
                            <span className="font-medium text-gray-900">{attendee.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attendance by Day */}
                  {activeReport.fields.showAttendanceByDay && attendanceData.attendanceByDay.some(d => d.count > 0) && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Attendance by Day</h4>
                      <div className="space-y-2">
                        {attendanceData.attendanceByDay.map((day) => {
                          const maxCount = Math.max(...attendanceData.attendanceByDay.map((d) => d.count), 1);
                          const width = (day.count / maxCount) * 100;
                          return (
                            <div key={day.day} className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-12">{day.day.slice(0, 3)}</span>
                              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }}></div>
                              </div>
                              <span className="text-xs font-medium text-gray-700 w-6 text-right">{day.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Attendance by Class */}
                  {activeReport.fields.showAttendanceByClass && attendanceData.attendanceByClass.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Attendance by Class</h4>
                      <div className="space-y-2">
                        {attendanceData.attendanceByClass.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 truncate mr-2">{item.className}</span>
                            <span className="font-medium text-gray-900 shrink-0">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attendance by Style */}
                  {activeReport.fields.showAttendanceByStyle && attendanceData.attendanceByStyle.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Attendance by Style</h4>
                      <div className="space-y-2">
                        {attendanceData.attendanceByStyle.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{item.style}</span>
                            <span className="font-medium text-primary">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No-Show Members */}
                  {activeReport.fields.showNoShowMembers && attendanceData.noShowMembers.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-medium text-gray-500 uppercase">No-Shows</h4>
                        <select
                          value={activeReport.fields.noShowThreshold || "1month"}
                          onChange={(e) => updateReportConfig(activeReport.id, {
                            fields: { ...activeReport.fields, noShowThreshold: e.target.value as "1week" | "1month" | "3months" }
                          })}
                          className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="1week">1+ Week</option>
                          <option value="1month">1+ Month</option>
                          <option value="3months">3+ Months</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        {attendanceData.noShowMembers.map((member, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-700 truncate mr-2">{member.name}</span>
                            <span className="text-gray-400 text-xs shrink-0">{member.lastAttendance}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Revenue Stats */}
              {(activeReport.fields.showTotalRevenue || activeReport.fields.showMembershipRevenue || activeReport.fields.showPosRevenue ||
                activeReport.fields.showAvgTransaction || activeReport.fields.showTransactionCount) && revenueData && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Revenue Statistics</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {activeReport.fields.showTotalRevenue && <StatCard label="Total Revenue" value={formatCurrency(revenueData.totalRevenue)} large />}
                    {activeReport.fields.showMembershipRevenue && <StatCard label="Membership Revenue" value={formatCurrency(revenueData.membershipRevenue)} />}
                    {activeReport.fields.showPosRevenue && <StatCard label="POS Revenue" value={formatCurrency(revenueData.posRevenue)} />}
                    {activeReport.fields.showAvgTransaction && <StatCard label="Avg Transaction" value={formatCurrency(revenueData.avgTransactionValue)} />}
                    {activeReport.fields.showTransactionCount && <StatCard label="Transactions" value={revenueData.transactionCount} />}
                  </div>
                </div>
              )}

              {/* Revenue Trend Chart */}
              {revenueData && (Object.keys(revenueData.monthlyPosRevenue).length > 0 || Object.keys(revenueData.monthlyMembershipRevenue).length > 0) && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Revenue Trend</h4>
                  <div className="rounded-lg border border-gray-100 p-3 bg-white">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={(() => {
                        const allMonths = new Set([
                          ...Object.keys(revenueData.monthlyPosRevenue),
                          ...Object.keys(revenueData.monthlyMembershipRevenue),
                        ]);
                        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        return [...allMonths].sort().map((month) => {
                          const [, m] = month.split("-");
                          return {
                            month: monthNames[parseInt(m, 10) - 1] || m,
                            "POS Sales": (revenueData.monthlyPosRevenue[month] || 0) / 100,
                            "Membership": (revenueData.monthlyMembershipRevenue[month] || 0) / 100,
                          };
                        });
                      })()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `$${v}`} />
                        <Tooltip formatter={(value: any) => [`$${Number(value).toFixed(0)}`, undefined]} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="POS Sales" fill="#c41111" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Membership" fill="#2563eb" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Revenue by Category Pie Chart */}
              {activeReport.fields.showSalesByCategory && revenueData && revenueData.salesByCategory.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Revenue by Category</h4>
                  <div className="rounded-lg border border-gray-100 p-3 bg-white">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={revenueData.salesByCategory.map((s) => ({
                            name: s.category,
                            value: s.revenue / 100,
                          }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }: any) =>
                            `${name || ""} ${((percent || 0) * 100).toFixed(0)}%`
                          }
                          labelLine={false}
                          style={{ fontSize: 10 }}
                        >
                          {revenueData.salesByCategory.map((_, i) => (
                            <Cell
                              key={i}
                              fill={["#c41111","#2563eb","#16a34a","#f59e0b","#8b5cf6","#ec4899","#6b7280"][i % 7]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => [`$${Number(value).toFixed(0)}`, undefined]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Products Bar Chart */}
              {activeReport.fields.showTopProducts && revenueData && revenueData.topProducts.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Top Products by Revenue</h4>
                  <div className="rounded-lg border border-gray-100 p-3 bg-white">
                    <ResponsiveContainer width="100%" height={Math.max(200, revenueData.topProducts.length * 35)}>
                      <BarChart
                        data={revenueData.topProducts.map((p) => ({
                          name: p.name.length > 20 ? p.name.slice(0, 20) + "..." : p.name,
                          Revenue: p.revenue / 100,
                        }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => `$${v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                        <Tooltip formatter={(value: any) => [`$${Number(value).toFixed(0)}`, undefined]} />
                        <Bar dataKey="Revenue" fill="#c41111" radius={[0, 2, 2, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Products Table */}
              {activeReport.fields.showTopProducts && revenueData && revenueData.topProducts.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Top Products / Services</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase">
                          <th className="pb-2 font-medium">Product</th>
                          <th className="pb-2 font-medium text-right">Qty Sold</th>
                          <th className="pb-2 font-medium text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueData.topProducts.map((product, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2 text-gray-700">{product.name}</td>
                            <td className="py-2 text-right text-gray-600">{product.quantity}</td>
                            <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(product.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sales by Category */}
              {activeReport.fields.showSalesByCategory && revenueData && revenueData.salesByCategory.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Sales by Category</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {revenueData.salesByCategory.map((item, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-sm font-medium text-gray-900 capitalize">{item.category}</p>
                        <p className="text-xl font-bold text-primary">{formatCurrency(item.revenue)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Retention Stats */}
              {(activeReport.fields.showRetentionRate || activeReport.fields.showNetGrowth || activeReport.fields.showChurnRate) && membershipData && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Retention & Growth</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {activeReport.fields.showNewMembers && <StatCard label="New Members" value={membershipData.newMembersThisPeriod} color="green" />}
                    {activeReport.fields.showCanceledMembers && <StatCard label="Canceled but Active" value={membershipData.canceledMembers} color="red" />}
                    {activeReport.fields.showNetGrowth && (
                      <StatCard
                        label="Net Growth (Period)"
                        value={membershipData.newMembersThisPeriod - membershipData.canceledThisPeriod}
                        color={membershipData.newMembersThisPeriod >= membershipData.canceledThisPeriod ? "green" : "red"}
                      />
                    )}
                    {activeReport.fields.showRetentionRate && (
                      <StatCard
                        label="Retention Rate"
                        value={membershipData.totalMembers > 0 ? `${Math.round(((membershipData.totalMembers - membershipData.canceledMembers) / membershipData.totalMembers) * 100)}%` : "N/A"}
                        color="blue"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Payment Info */}
              {activeReport.fields.showMonthlyPayments && paymentData && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Payment Information</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard label="Monthly Payments" value={formatCurrency(paymentData.monthlyPayments)} />
                  </div>
                </div>
              )}

              {/* Failed Payments */}
              {activeReport.fields.showFailedPayments && paymentData && paymentData.failedPayments.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Failed Payments</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase">
                          <th className="pb-2 font-medium">Member</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                          <th className="pb-2 font-medium text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentData.failedPayments.map((payment, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2 text-gray-700">{payment.memberName}</td>
                            <td className="py-2 text-right text-red-600 font-medium">{formatCurrency(payment.amount)}</td>
                            <td className="py-2 text-right text-gray-600">{payment.date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expiring Memberships */}
              {activeReport.fields.showMembershipExpiring && paymentData && paymentData.expiringMemberships.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-3">Expiring Memberships</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase">
                          <th className="pb-2 font-medium">Member</th>
                          <th className="pb-2 font-medium">Plan</th>
                          <th className="pb-2 font-medium text-right">Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentData.expiringMemberships.map((item, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-2 text-gray-700">{item.memberName}</td>
                            <td className="py-2 text-gray-600">{item.plan}</td>
                            <td className="py-2 text-right text-orange-600 font-medium">{item.expiryDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ReportSection>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-3">No reports enabled</p>
              <button
                type="button"
                onClick={() => addReport()}
                className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
              >
                Add a Report
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Report Modal */}
      {editingReport && editingConfig && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-lg flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Edit Report Settings</h2>
              <button
                type="button"
                onClick={cancelEditing}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {/* Basic Settings */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Report Name</label>
                    <input
                      type="text"
                      value={editingConfig.name}
                      onChange={(e) => updateEditingConfig({ name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date Range</label>
                    <select
                      value={editingConfig.dateRange}
                      onChange={(e) => updateEditingConfig({ dateRange: e.target.value as ReportDateRange })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="today">Today</option>
                      <option value="week">Last 7 Days</option>
                      <option value="month">Last 30 Days</option>
                      <option value="quarter">Last 3 Months</option>
                      <option value="year">Last 12 Months</option>
                      <option value="custom">Custom Range</option>
                    </select>
                  </div>
                </div>

                {editingConfig.dateRange === "custom" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                      <input
                        type="date"
                        value={editingConfig.customStartDate || ""}
                        onChange={(e) => updateEditingConfig({ customStartDate: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                      <input
                        type="date"
                        value={editingConfig.customEndDate || ""}
                        onChange={(e) => updateEditingConfig({ customEndDate: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editingConfig.description}
                    onChange={(e) => updateEditingConfig({ description: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                {/* SECTION 1: Filter - Which members to include */}
                <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50/30">
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">1. Filter: Which Members to Include</h3>
                  <p className="text-xs text-blue-700 mb-4">Select which member types should appear in the report list</p>

                  <div className="space-y-2">
                    {FILTER_FIELDS.map((category) => {
                      const isExpanded = expandedFilterCategories.has(category.name);
                      const toggleExpand = () => {
                        setExpandedFilterCategories(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(category.name)) {
                            newSet.delete(category.name);
                          } else {
                            newSet.add(category.name);
                          }
                          return newSet;
                        });
                      };

                      // Calculate summary for collapsed view
                      let filterSummary = "";
                      if (category.fields.length > 0) {
                        const activeCount = category.fields.filter(f => (editingConfig.fields as any)[f.key]).length;
                        filterSummary = activeCount > 0 ? `${activeCount} selected` : "None";
                      } else if ((category as any).hasStyleCheckboxes) {
                        const count = (editingConfig.filterByStyles || []).length;
                        filterSummary = count > 0 ? `${count} selected` : "All";
                      } else if ((category as any).hasRankCheckboxes) {
                        const count = (editingConfig.filterByRanks || []).length;
                        filterSummary = count > 0 ? `${count} selected` : "All";
                      } else if ((category as any).hasMembershipTypeFilter) {
                        const count = (editingConfig.filterByMembershipTypes || []).length;
                        filterSummary = count > 0 ? `${count} selected` : "All";
                      } else if ((category as any).hasMembershipPlanFilter) {
                        const count = (editingConfig.filterByMembershipPlans || []).length;
                        filterSummary = count > 0 ? `${count} selected` : "All";
                      }

                      return (
                        <div key={category.name} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                          {/* Collapsible Header */}
                          <button
                            type="button"
                            onClick={toggleExpand}
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <h4 className="text-xs font-semibold text-gray-700 uppercase">{category.name}</h4>
                            </div>
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              {filterSummary}
                            </span>
                          </button>

                          {/* Expandable Content */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                              {/* Select All / Clear buttons for checkbox fields */}
                              {category.fields.length > 0 && (
                                <div className="flex justify-end gap-2 mb-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleEditingCategoryFields(category.fields, true)}
                                    className="text-[10px] text-primary hover:text-primaryDark"
                                  >
                                    Select All
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleEditingCategoryFields(category.fields, false)}
                                    className="text-[10px] text-gray-500 hover:text-gray-700"
                                  >
                                    Clear All
                                  </button>
                                </div>
                              )}

                              {/* Regular checkbox fields */}
                              {category.fields.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {category.fields.map((field) => (
                                    <label key={field.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                      <input
                                        type="checkbox"
                                        checked={(editingConfig.fields as any)[field.key] || false}
                                        onChange={(e) => updateEditingField(field.key as keyof ReportDataFields, e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                      />
                                      <span className="text-xs">{field.label}</span>
                                    </label>
                                  ))}
                                </div>
                              )}

                              {/* Style Filter Checkboxes */}
                              {(category as any).hasStyleCheckboxes && availableStyles.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                      Styles
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByStyles: availableStyles.map(s => s.name) })}
                                        className="text-[10px] text-primary hover:text-primaryDark"
                                      >
                                        Select All
                                      </button>
                                      <span className="text-gray-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByStyles: [] })}
                                        className="text-[10px] text-gray-500 hover:text-gray-700"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {availableStyles.map((style) => (
                                      <label key={style.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                        <input
                                          type="checkbox"
                                          checked={(editingConfig.filterByStyles || []).includes(style.name)}
                                          onChange={(e) => {
                                            const current = editingConfig.filterByStyles || [];
                                            if (e.target.checked) {
                                              updateEditingConfig({ filterByStyles: [...current, style.name] });
                                            } else {
                                              updateEditingConfig({ filterByStyles: current.filter((s) => s !== style.name) });
                                            }
                                          }}
                                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-xs">{style.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    {(editingConfig.filterByStyles || []).length === 0
                                      ? "No filter - showing all styles"
                                      : `Showing ${(editingConfig.filterByStyles || []).length} style(s)`}
                                  </p>
                                </div>
                              )}

                              {/* Rank Filter Checkboxes - Grouped by Style */}
                              {(category as any).hasRankCheckboxes && availableRanks.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                      Ranks (by Style)
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByRanks: availableRanks.map(r => `${r.styleName}:${r.name}`) })}
                                        className="text-[10px] text-primary hover:text-primaryDark"
                                      >
                                        Select All
                                      </button>
                                      <span className="text-gray-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByRanks: [] })}
                                        className="text-[10px] text-gray-500 hover:text-gray-700"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                  {/* Group ranks by style */}
                                  <div className="space-y-3">
                                    {availableStyles
                                      .filter(style => availableRanks.some(r => r.styleId === style.id))
                                      .map((style) => {
                                        const styleRanks = availableRanks
                                          .filter(r => r.styleId === style.id)
                                          .sort((a, b) => a.order - b.order);
                                        const allStyleRanksSelected = styleRanks.every(r =>
                                          (editingConfig.filterByRanks || []).includes(`${r.styleName}:${r.name}`)
                                        );
                                        return (
                                          <div key={style.id} className="border border-gray-200 rounded-md p-2">
                                            <div className="flex items-center justify-between mb-1">
                                              <span className="text-xs font-medium text-gray-600">{style.name}</span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const current = editingConfig.filterByRanks || [];
                                                  const styleRankKeys = styleRanks.map(r => `${r.styleName}:${r.name}`);
                                                  if (allStyleRanksSelected) {
                                                    // Deselect all ranks for this style
                                                    updateEditingConfig({ filterByRanks: current.filter(r => !styleRankKeys.includes(r)) });
                                                  } else {
                                                    // Select all ranks for this style
                                                    const newRanks = [...new Set([...current, ...styleRankKeys])];
                                                    updateEditingConfig({ filterByRanks: newRanks });
                                                  }
                                                }}
                                                className="text-[10px] text-primary hover:text-primaryDark"
                                              >
                                                {allStyleRanksSelected ? "Clear" : "Select All"}
                                              </button>
                                            </div>
                                            <div className="columns-2 sm:columns-3 gap-2">
                                              {styleRanks.map((rank) => {
                                                const rankKey = `${rank.styleName}:${rank.name}`;
                                                return (
                                                  <label key={rank.id} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer hover:text-gray-900 break-inside-avoid mb-1">
                                                    <input
                                                      type="checkbox"
                                                      checked={(editingConfig.filterByRanks || []).includes(rankKey)}
                                                      onChange={(e) => {
                                                        const current = editingConfig.filterByRanks || [];
                                                        if (e.target.checked) {
                                                          updateEditingConfig({ filterByRanks: [...current, rankKey] });
                                                        } else {
                                                          updateEditingConfig({ filterByRanks: current.filter((r) => r !== rankKey) });
                                                        }
                                                      }}
                                                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                                    />
                                                    <span className="text-[11px]">{rank.name}</span>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-2">
                                    {(editingConfig.filterByRanks || []).length === 0
                                      ? "No filter - showing all ranks"
                                      : `Showing ${(editingConfig.filterByRanks || []).length} rank(s)`}
                                  </p>
                                </div>
                              )}

                              {/* Membership Type Filter Checkboxes */}
                              {(category as any).hasMembershipTypeFilter && availableMembershipTypes.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                      Membership Types
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByMembershipTypes: availableMembershipTypes.map(mt => mt.name) })}
                                        className="text-[10px] text-primary hover:text-primaryDark"
                                      >
                                        Select All
                                      </button>
                                      <span className="text-gray-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByMembershipTypes: [] })}
                                        className="text-[10px] text-gray-500 hover:text-gray-700"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {availableMembershipTypes.map((mt) => (
                                      <label key={mt.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                        <input
                                          type="checkbox"
                                          checked={(editingConfig.filterByMembershipTypes || []).includes(mt.name)}
                                          onChange={(e) => {
                                            const current = editingConfig.filterByMembershipTypes || [];
                                            if (e.target.checked) {
                                              updateEditingConfig({ filterByMembershipTypes: [...current, mt.name] });
                                            } else {
                                              updateEditingConfig({ filterByMembershipTypes: current.filter((t) => t !== mt.name) });
                                            }
                                          }}
                                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-xs">{mt.name}</span>
                                      </label>
                                    ))}
                                    {/* Option for members with no membership */}
                                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                      <input
                                        type="checkbox"
                                        checked={(editingConfig.filterByMembershipTypes || []).includes("No Membership")}
                                        onChange={(e) => {
                                          const current = editingConfig.filterByMembershipTypes || [];
                                          if (e.target.checked) {
                                            updateEditingConfig({ filterByMembershipTypes: [...current, "No Membership"] });
                                          } else {
                                            updateEditingConfig({ filterByMembershipTypes: current.filter((t) => t !== "No Membership") });
                                          }
                                        }}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                      />
                                      <span className="text-xs text-gray-500 italic">No Membership</span>
                                    </label>
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    {(editingConfig.filterByMembershipTypes || []).length === 0
                                      ? "No filter - showing all membership types"
                                      : `Showing ${(editingConfig.filterByMembershipTypes || []).length} membership type(s)`}
                                  </p>
                                </div>
                              )}

                              {/* Membership Plan Filter Checkboxes */}
                              {(category as any).hasMembershipPlanFilter && availableMembershipPlans.length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                      Membership Plans
                                    </label>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByMembershipPlans: availableMembershipPlans.map(mp => mp.name) })}
                                        className="text-[10px] text-primary hover:text-primaryDark"
                                      >
                                        Select All
                                      </button>
                                      <span className="text-gray-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => updateEditingConfig({ filterByMembershipPlans: [] })}
                                        className="text-[10px] text-gray-500 hover:text-gray-700"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {availableMembershipPlans.map((mp) => (
                                      <label key={mp.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                        <input
                                          type="checkbox"
                                          checked={(editingConfig.filterByMembershipPlans || []).includes(mp.name)}
                                          onChange={(e) => {
                                            const current = editingConfig.filterByMembershipPlans || [];
                                            if (e.target.checked) {
                                              updateEditingConfig({ filterByMembershipPlans: [...current, mp.name] });
                                            } else {
                                              updateEditingConfig({ filterByMembershipPlans: current.filter((p) => p !== mp.name) });
                                            }
                                          }}
                                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-xs">{mp.name}</span>
                                      </label>
                                    ))}
                                    {/* Option for members with no plan */}
                                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                      <input
                                        type="checkbox"
                                        checked={(editingConfig.filterByMembershipPlans || []).includes("No Plan")}
                                        onChange={(e) => {
                                          const current = editingConfig.filterByMembershipPlans || [];
                                          if (e.target.checked) {
                                            updateEditingConfig({ filterByMembershipPlans: [...current, "No Plan"] });
                                          } else {
                                            updateEditingConfig({ filterByMembershipPlans: current.filter((p) => p !== "No Plan") });
                                          }
                                        }}
                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                      />
                                      <span className="text-xs text-gray-500 italic">No Plan</span>
                                    </label>
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    {(editingConfig.filterByMembershipPlans || []).length === 0
                                      ? "No filter - showing all membership plans"
                                      : `Showing ${(editingConfig.filterByMembershipPlans || []).length} membership plan(s)`}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 2: Columns - What info to display */}
                <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50/30">
                  <h3 className="text-sm font-semibold text-green-900 mb-1">2. Columns: What Info to Display</h3>
                  <p className="text-xs text-green-700 mb-4">Select which columns of information to show for each member</p>

                  <div className="space-y-3">
                    {COLUMN_FIELDS.map((category) => (
                      <div key={category.name} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-gray-700 uppercase">{category.name}</h4>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => toggleEditingCategoryFields(category.fields, true)}
                              className="text-[10px] text-primary hover:text-primaryDark"
                            >
                              Select All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() => toggleEditingCategoryFields(category.fields, false)}
                              className="text-[10px] text-gray-500 hover:text-gray-700"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {category.fields.map((field) => (
                            <label key={field.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                              <input
                                type="checkbox"
                                checked={(editingConfig.fields as any)[field.key] || false}
                                onChange={(e) => updateEditingField(field.key as keyof ReportDataFields, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-xs">{field.label}</span>
                            </label>
                          ))}
                        </div>
                        {/* Style checkboxes for Belt Ranks & Styles */}
                        {category.name === "Belt Ranks & Styles" && availableStyles.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-xs font-medium text-gray-700">
                                Show Rank Columns for Styles
                              </label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateEditingConfig({ selectedStylesForRank: availableStyles.map(s => s.name) })}
                                  className="text-[10px] text-primary hover:text-primaryDark"
                                >
                                  Select All
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => updateEditingConfig({ selectedStylesForRank: [] })}
                                  className="text-[10px] text-gray-500 hover:text-gray-700"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {availableStyles.map((style) => (
                                <label key={style.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                  <input
                                    type="checkbox"
                                    checked={(editingConfig.selectedStylesForRank || []).includes(style.name)}
                                    onChange={(e) => {
                                      const current = editingConfig.selectedStylesForRank || [];
                                      if (e.target.checked) {
                                        updateEditingConfig({ selectedStylesForRank: [...current, style.name] });
                                      } else {
                                        updateEditingConfig({ selectedStylesForRank: current.filter(s => s !== style.name) });
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                  <span className="text-xs">{style.name}</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {(editingConfig.selectedStylesForRank || []).length === 0
                                ? "No style rank columns selected"
                                : `Showing rank columns for ${(editingConfig.selectedStylesForRank || []).length} style(s)`}
                            </p>
                          </div>
                        )}
                        {/* Dynamic Class Type Selector */}
                        {(category as any).hasClassTypeSelector && availableClassTypes.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Class Types to Show (each as separate column)
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {availableClassTypes.map((classType) => (
                                <label key={classType} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                  <input
                                    type="checkbox"
                                    checked={(editingConfig.selectedClassTypes || []).includes(classType)}
                                    onChange={(e) => {
                                      const current = editingConfig.selectedClassTypes || [];
                                      if (e.target.checked) {
                                        updateEditingConfig({ selectedClassTypes: [...current, classType] });
                                      } else {
                                        updateEditingConfig({ selectedClassTypes: current.filter((ct) => ct !== classType) });
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                  <span className="text-xs">{classType}</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">
                              Each selected class type will appear as a separate column showing the count for each member.
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 3: Statistics - Summary data */}
                <div className="border-2 border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">3. Statistics & Charts (Optional)</h3>
                  <p className="text-xs text-gray-500 mb-4">Additional summary statistics and charts to include</p>

                  <div className="space-y-3">
                    {STATISTICS_FIELDS.map((category) => (
                      <div key={category.name} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-gray-700 uppercase">{category.name}</h4>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => toggleEditingCategoryFields(category.fields, true)}
                              className="text-[10px] text-primary hover:text-primaryDark"
                            >
                              Select All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() => toggleEditingCategoryFields(category.fields, false)}
                              className="text-[10px] text-gray-500 hover:text-gray-700"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {category.fields.map((field) => (
                            <label key={field.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                              <input
                                type="checkbox"
                                checked={(editingConfig.fields as any)[field.key] || false}
                                onChange={(e) => updateEditingField(field.key as keyof ReportDataFields, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <span className="text-xs">{field.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={saveEditingConfig}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Reports Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Manage Reports</h2>
              <button type="button" onClick={() => setShowManageModal(false)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <p className="text-xs text-gray-500 mb-4">Enable, disable, edit, or delete reports. Changes are saved automatically.</p>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {reportConfigs.map((config) => (
                <div key={config.id} className="flex items-center justify-between p-3 rounded-md border border-gray-200 hover:border-gray-300">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => updateReportConfig(config.id, { enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{config.name}</p>
                      <p className="text-xs text-gray-500">{config.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowManageModal(false); openEditModal(config.id); }}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Delete "${config.name}"?`)) deleteReport(config.id); }}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { if (confirm("Reset all reports to defaults?")) resetToDefaults(); }}
                className="text-xs text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
              >
                Reset to defaults
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowManageModal(false); addReport(); }}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Add Report
                </button>
                <button
                  type="button"
                  onClick={() => setShowManageModal(false)}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}

function StatCard({ label, value, color, large }: { label: string; value: string | number; color?: "green" | "yellow" | "red" | "blue" | "gray"; large?: boolean }) {
  const colorClasses = { green: "text-green-600", yellow: "text-yellow-600", red: "text-red-600", blue: "text-blue-600", gray: "text-gray-600" };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500 uppercase font-medium mb-1">{label}</p>
      <p className={`${large ? "text-2xl" : "text-xl"} font-bold ${color ? colorClasses[color] : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function ReportSection({ title, dateRangeLabel, onEdit, onDelete, children }: { title: string; dateRangeLabel: string; onEdit: () => void; onDelete: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{dateRangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onEdit} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Edit</button>
          <button type="button" onClick={onDelete} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">Delete</button>
        </div>
      </div>
      {children}
    </section>
  );
}
