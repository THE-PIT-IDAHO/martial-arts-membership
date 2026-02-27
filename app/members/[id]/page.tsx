"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { formatPaymentMethod } from "@/lib/payment-utils";
import { getTodayString } from "@/lib/dates";

// Belt rendering helpers (mirrored from portal/styles)
function TintedLayer({ src, color }: { src: string; color: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat" as const,
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

function BeltImage({ layers }: { layers: Record<string, any> }) {
  const stripeKeys = [
    "stripe10", "stripe9", "stripe8", "stripe7", "stripe6",
    "stripe5", "stripe4", "stripe3", "stripe2", "stripe1",
  ];
  return (
    <div className="relative w-full h-16 overflow-hidden rounded-md bg-gray-50">
      {layers.fabric && layers.fabricColor && (
        <TintedLayer src="/belts/fabric.png" color={layers.fabricColor as string} />
      )}
      {layers.twotone && layers.twotoneColor && (
        <TintedLayer src="/belts/twotone.png" color={layers.twotoneColor as string} />
      )}
      {layers.camo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/belts/camo.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      )}
      {layers.linear && layers.linearColor && (
        <TintedLayer src="/belts/linear.png" color={layers.linearColor as string} />
      )}
      {layers.patch2 && layers.patch2Color && (
        <TintedLayer src="/belts/patch2.png" color={layers.patch2Color as string} />
      )}
      {layers.patch && layers.patchColor && (
        <TintedLayer src="/belts/patch.png" color={layers.patchColor as string} />
      )}
      {stripeKeys.map((key) => {
        if (!layers[key]) return null;
        const color = (layers[`${key}Color`] as string) || "#ffffff";
        return <TintedLayer key={key} src={`/belts/${key}.png`} color={color} />;
      })}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/belts/outline.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
    </div>
  );
}

function getBeltLayersForRank(beltConfig: string | null | undefined, rankName: string | undefined): Record<string, any> | null {
  if (!beltConfig || !rankName) return null;
  try {
    const config = JSON.parse(beltConfig);
    const defaultLayers = config.layers || {};
    const rankData = config.ranks?.find((r: { name: string }) => r.name.toLowerCase() === rankName.toLowerCase());
    if (!rankData) return null;
    return { ...defaultLayers, ...(rankData.layers || {}), fabric: true };
  } catch {
    return null;
  }
}

// Format phone number as user types: (123) 456-7890
function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");

  // Format based on length
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;

  memberNumber?: number | null;

  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  parentGuardianName?: string | null;
  minorCommsMode?: string | null;
  notes?: string | null;

  // Global training info (mirrored from primary style)
  startDate?: string | null;
  rank?: string | null;
  uniformSize?: string | null;
  medicalNotes?: string | null;
  waiverSigned?: boolean;
  waiverSignedAt?: string | null;
  emailOptIn?: boolean;

  membershipType?: string | null;

  photoUrl?: string | null;
  primaryStyle?: string | null;
  stylesNotes?: string | null; // JSON array of style entries
  styleDocuments?: string | null; // JSON array of document entries
  paymentNotes?: string | null;
  accessRole?: string | null;
  leadSource?: string | null;
  referredByMemberId?: string | null;
  accountCreditCents?: number;

  // Attendance data
  attendances?: Array<{
    id: string;
    checkedInAt: string;
    attendanceDate: string;
    source: string;
    classSession: {
      id: string;
      name: string;
      classType: string | null;
      classTypes: string | null;
      styleName: string | null;
      styleNames: string | null;
      program: string | null;
    } | null;
  }>;

  // Memberships
  memberships?: MembershipRecord[];
};

type StyleEntry = {
  name: string;
  rank?: string;
  beltSize?: string;
  uniformSize?: string;
  startDate?: string;
  lastPromotionDate?: string;  // Date of last rank promotion (for attendance window calculation)
  active?: boolean;  // Whether this style is currently active for the member
  attendanceResetDate?: string;  // Date when attendance was reset (e.g., after membership cancellation)
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
  uploadedAt: string;
};

type AvailableStyle = {
  id: string;
  name: string;
  beltConfig?: string | null;
  ranks: { id: string; name: string; order: number; classRequirement?: number | null; thumbnail?: string | null }[];
};

type CurriculumItem = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  required: boolean;
  sortOrder: number;
  reps?: number | null;
  sets?: number | null;
  duration?: string | null;
  distance?: string | null;
  timeLimit?: string | null;
  timeLimitOperator?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
};

type CurriculumCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  items: CurriculumItem[];
};

type CurriculumRankTest = {
  id: string;
  name: string;
  description?: string | null;
  rank: { id: string; name: string; order: number };
  categories: CurriculumCategory[];
};

type ActivityItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type TestResult = {
  id: string;
  testingForRank: string | null;
  currentRank: string | null;
  status: string;
  score: number | null;
  resultPdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
  testingEvent: {
    id: string;
    name: string;
    date: string;
    styleName: string | null;
  };
};

type Transaction = {
  id: string;
  transactionNumber: string | null;
  totalCents: number;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
};

type InvoiceRecord = {
  id: string;
  invoiceNumber: string | null;
  amountCents: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  paymentMethod: string | null;
  membershipId: string;
  membership: {
    membershipPlan: { name: string };
  };
};

type RelationshipRecord = {
  id: string;
  relationship: string;
  fromMemberId: string;
  toMemberId: string;
  fromMember: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string | null;
  };
  toMember: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string | null;
  };
};

type MemberSummary = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
};

type MembershipRecord = {
  id: string;
  memberId: string;
  membershipPlanId: string;
  startDate: string;
  endDate: string | null;
  status: string;
  customPriceCents: number | null;
  firstMonthDiscountOnly: boolean;
  lastPaymentDate: string | null;
  nextPaymentDate: string | null;
  pauseEndDate: string | null;
  contractEndDate: string | null;
  cancellationRequestDate: string | null;
  cancellationEffectiveDate: string | null;
  cancellationReason: string | null;
  membershipPlan: {
    id: string;
    name: string;
    membershipId: string | null;
    priceCents: number | null;
    billingCycle: string;
    allowedStyles: string | null;
    color: string | null;
    cancellationFeeCents?: number | null;
    cancellationNoticeDays?: number | null;
    contractLengthMonths?: number | null;
  };
};

// Priority order for displaying statuses: Coach, Active, Parent, Canceled, Inactive, Prospect, Banned
const STATUS_PRIORITY = ["COACH", "ACTIVE", "PARENT", "CANCELED", "INACTIVE", "PROSPECT", "BANNED"];

function sortStatusesByPriority(statuses: string[]): string[] {
  return [...statuses].sort((a, b) => {
    const aIndex = STATUS_PRIORITY.indexOf(a.toUpperCase());
    const bIndex = STATUS_PRIORITY.indexOf(b.toUpperCase());
    const aPriority = aIndex === -1 ? STATUS_PRIORITY.length : aIndex;
    const bPriority = bIndex === -1 ? STATUS_PRIORITY.length : bIndex;
    return aPriority - bPriority;
  });
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800 border-green-300";
    case "PROSPECT":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "INACTIVE":
      return "bg-primary/10 text-primary border-primary/30";
    case "CANCELED":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "PARENT":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "COACH":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "BANNED":
      return "bg-gray-200 text-gray-900 border-gray-400";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

// Relationship types
const RELATIONSHIP_OPTIONS = [
  { value: "PARENT", label: "Parent of" },
  { value: "CHILD", label: "Child of" },
  { value: "GUARDIAN", label: "Guardian of" },
  { value: "SPOUSE", label: "Spouse of" },
  { value: "SIGNIFICANT_OTHER", label: "Significant other of" },
  { value: "SIBLING", label: "Sibling of" },
  { value: "PAYS_FOR", label: "Pays for" },
  { value: "PAID_FOR_BY", label: "Paid for by" }
] as const;

function calculateAgeFromDateString(dateString?: string | null): number | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > d.getMonth() ||
    (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age >= 0 ? age : null;
}

// Small helper component: renders relationship sentence with linked names
function RelationshipLabel({
  rel,
  currentMemberId
}: {
  rel: RelationshipRecord;
  currentMemberId: string;
}) {
  const isFrom = rel.fromMemberId === currentMemberId;
  const other = isFrom ? rel.toMember : rel.fromMember;
  const otherName = `${other.firstName} ${other.lastName}`;
  const type = rel.relationship;

  const linkedName = (
    <Link
      href={`/members/${other.id}`}
      className="text-xs text-primary hover:text-primaryDark font-medium"
    >
      {otherName}
    </Link>
  );

  if (type === "PARENT") {
    return (
      <>
        {isFrom ? "Parent of " : "Child of "}
        {linkedName}
      </>
    );
  }
  if (type === "CHILD") {
    return (
      <>
        {isFrom ? "Child of " : "Parent of "}
        {linkedName}
      </>
    );
  }
  if (type === "GUARDIAN") {
    return (
      <>
        {isFrom ? "Guardian of " : "Guarded by "}
        {linkedName}
      </>
    );
  }
  if (type === "SPOUSE") {
    return <>Spouse of {linkedName}</>;
  }
  if (type === "SIGNIFICANT_OTHER") {
    return <>Significant other of {linkedName}</>;
  }
  if (type === "SIBLING") {
    return <>Sibling of {linkedName}</>;
  }
  if (type === "PAYS_FOR") {
    return (
      <>
        {isFrom ? "Pays for " : "Paid for by "}
        {linkedName}
      </>
    );
  }
  if (type === "PAID_FOR_BY") {
    return (
      <>
        {isFrom ? "Paid for by " : "Pays for "}
        {linkedName}
      </>
    );
  }

  // fallback
  return (
    <>
      {type} – {linkedName}
    </>
  );
}

type EditableSection =
  | "personal"
  | "style"
  | "membership"
  | "payments"
  | "photo"
  | "waiver"
  | "relationships";

export default function MemberProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const memberId = params?.id as string;
  const fromReport = searchParams.get("fromReport");

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<EditableSection | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [serviceCredits, setServiceCredits] = useState<Array<{
    id: string;
    creditsTotal: number;
    creditsRemaining: number;
    status: string;
    purchasedAt: string;
    expiresAt: string | null;
    servicePackage: {
      name: string;
      sessionsIncluded: number;
      appointmentId: string | null;
      appointment: { id: string; title: string; duration: number } | null;
    };
  }>>([]);

  // Credit scheduling modal state
  const [showCreditBooking, setShowCreditBooking] = useState(false);
  const [bookingCredit, setBookingCredit] = useState<typeof serviceCredits[0] | null>(null);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingSlots, setBookingSlots] = useState<{
    coachId: string; coachName: string; startTime: string; endTime: string;
    locationId: string | null; spaceId: string | null;
  }[]>([]);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [bookingSelectedSlot, setBookingSelectedSlot] = useState<number | null>(null);
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);

  // unified personal info state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["PROSPECT"]);
  const [memberNumber, setMemberNumber] = useState<string>("");

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [emergencyContactNameState, setEmergencyContactNameState] =
    useState("");
  const [emergencyContactPhoneState, setEmergencyContactPhoneState] =
    useState("");
  const [parentGuardianName, setParentGuardianName] = useState("");
  const [minorCommsMode, setMinorCommsMode] = useState("both");
  const [emailOptIn, setEmailOptIn] = useState(true);
  const [notes, setNotes] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [referredByMemberId, setReferredByMemberId] = useState("");

  const [medicalNotes, setMedicalNotes] = useState("");
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [waiverSignedAt, setWaiverSignedAt] = useState("");

  // styles: array of { name, rank, beltSize, uniformSize, startDate }
  const [styles, setStyles] = useState<StyleEntry[]>([]);
  const [availableStyles, setAvailableStyles] = useState<AvailableStyle[]>([]);
  const [stylesTab, setStylesTab] = useState<"active" | "inactive">("active");
  const [membershipsTab, setMembershipsTab] = useState<"active" | "inactive">("active");
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [membershipEditForm, setMembershipEditForm] = useState<{
    startDate: string;
    endDate: string;
    customPriceCents: string;
  }>({ startDate: "", endDate: "", customPriceCents: "" });

  // style documents
  const [styleDocuments, setStyleDocuments] = useState<StyleDocument[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  // curriculum
  const [memberCurricula, setMemberCurricula] = useState<Record<string, CurriculumRankTest[]>>({});
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [expandedCurriculumStyles, setExpandedCurriculumStyles] = useState<Set<string>>(new Set());
  const [expandedCurriculumRanks, setExpandedCurriculumRanks] = useState<Set<string>>(new Set());

  // test results for progress section
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  // attendance
  const [recentClasses, setRecentClasses] = useState<Array<{
    id: string;
    name: string;
    startsAt: string;
    styleName: string | null;
    styleNames: string | null;
    classType: string | null;
  }>>([]);
  const [bulkAttendanceDate, setBulkAttendanceDate] = useState(getTodayString());
  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState<string>("");
  const [addingAttendance, setAddingAttendance] = useState(false);
  const [availableClassTypes, setAvailableClassTypes] = useState<string[]>([]);
  const [filterByClassType, setFilterByClassType] = useState<string>("");

  // Bulk attendance import (for transferring members with existing attendance)
  const [bulkImportClassType, setBulkImportClassType] = useState<string>("");
  const [bulkImportCount, setBulkImportCount] = useState<number>(0);
  const [bulkImporting, setBulkImporting] = useState(false);

  // membership
  const [membershipType, setMembershipType] = useState("");

  // photo + payments
  const [photoUrl, setPhotoUrl] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // edit flags
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingStyleIndex, setEditingStyleIndex] = useState<number | null>(null);
  const [editingPayments, setEditingPayments] = useState(false);

  // saved cards (Stripe)
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; brand: string; last4: string; expMonth?: number; expYear?: number }[]>([]);
  const [defaultPaymentId, setDefaultPaymentId] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);
  const [settingDefaultCardId, setSettingDefaultCardId] = useState<string | null>(null);
  const [cardSetupSuccess, setCardSetupSuccess] = useState(false);

  // pause modal
  const [pauseModalMembershipId, setPauseModalMembershipId] = useState<string | null>(null);
  const [pauseDuration, setPauseDuration] = useState<number>(1);
  const [pauseUnit, setPauseUnit] = useState<"day" | "week" | "month" | "indefinite">("week");
  const [pauseSubmitting, setPauseSubmitting] = useState(false);

  // cancel modal
  const [cancelModalMembershipId, setCancelModalMembershipId] = useState<string | null>(null);
  const [cancelEffectiveDate, setCancelEffectiveDate] = useState<string>("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("");

  // change plan modal
  const [changePlanModalMembershipId, setChangePlanModalMembershipId] = useState<string | null>(null);
  const [changePlanSelectedPlanId, setChangePlanSelectedPlanId] = useState<string>("");
  const [changePlanSubmitting, setChangePlanSubmitting] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<Array<{ id: string; name: string; priceCents: number | null; billingCycle: string }>>([]);
  const [changePlanPriceDollars, setChangePlanPriceDollars] = useState<string>("0.00");
  const [changePlanRecurringDollars, setChangePlanRecurringDollars] = useState<string>("0.00");
  const [changePlanShowConfirm, setChangePlanShowConfirm] = useState(false);

  // activity
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityStartDate, setActivityStartDate] = useState<string>("");
  const [activityEndDate, setActivityEndDate] = useState<string>("");
  const [showAllActivityModal, setShowAllActivityModal] = useState(false);

  // relationships
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState(false);

  const [newRelationshipType, setNewRelationshipType] =
    useState<string>("PARENT");
  const [newRelationshipMemberId, setNewRelationshipMemberId] = useState("");
  const [allMembers, setAllMembers] = useState<MemberSummary[]>([]);
  const [relationshipError, setRelationshipError] = useState<string | null>(
    null
  );

  // photo upload refs
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch member data - extracted as useCallback so it can be called from anywhere
  const fetchMember = useCallback(async () => {
    if (!memberId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/members/${memberId}`);
      if (!res.ok) {
        throw new Error("Failed to load member profile");
      }
      const data = await res.json();
      const m: Member = data.member;
      const testResultsData: TestResult[] = data.testResults || [];
      const transactions: Transaction[] = data.transactions || [];
      setInvoices(data.invoices || []);
      setMember(m);
      setTestResults(testResultsData);
      hydrateFormFromMember(m);
      seedActivityFromMember(m, testResultsData, transactions);

      // Fetch appointment credits
      fetch(`/api/members/${memberId}/service-credits`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.credits) setServiceCredits(d.credits); })
        .catch(() => {});
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load member profile");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // load member on mount and poll for updates (e.g. kiosk check-ins)
  useEffect(() => {
    fetchMember();
    const interval = setInterval(() => {
      // Silent refresh without loading spinner
      if (!memberId) return;
      fetch(`/api/members/${memberId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.member) {
            setMember(data.member);
          }
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchMember, memberId]);

  // load saved payment methods (Stripe)
  const loadPaymentMethods = useCallback(async () => {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/members/${memberId}/payment-methods`);
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.paymentMethods || []);
        setDefaultPaymentId(data.defaultId || null);
      }
    } catch { /* Stripe may not be configured */ }
  }, [memberId]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  // detect ?setup=success after adding a card
  useEffect(() => {
    if (searchParams.get("setup") === "success") {
      setCardSetupSuccess(true);
      loadPaymentMethods();
      window.history.replaceState({}, "", `/members/${memberId}`);
      const timer = setTimeout(() => setCardSetupSuccess(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, memberId, loadPaymentMethods]);

  const handleAddCard = async () => {
    if (!memberId) return;
    setAddingCard(true);
    try {
      const res = await fetch(`/api/members/${memberId}/payment-methods`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setAddingCard(false);
      }
    } catch {
      setAddingCard(false);
    }
  };

  const handleRemoveCard = async (pmId: string) => {
    if (!memberId) return;
    setRemovingCardId(pmId);
    try {
      const res = await fetch(`/api/members/${memberId}/payment-methods/${pmId}`, { method: "DELETE" });
      if (res.ok) {
        setPaymentMethods((prev) => prev.filter((pm) => pm.id !== pmId));
        if (defaultPaymentId === pmId) setDefaultPaymentId(null);
      }
    } catch { /* ignore */ }
    setRemovingCardId(null);
  };

  const handleSetDefaultCard = async (pmId: string) => {
    if (!memberId) return;
    setSettingDefaultCardId(pmId);
    try {
      const res = await fetch(`/api/members/${memberId}/payment-methods/${pmId}/default`, { method: "PUT" });
      if (res.ok) {
        setDefaultPaymentId(pmId);
      }
    } catch { /* ignore */ }
    setSettingDefaultCardId(null);
  };

  // load all members for relationship dropdown
  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch("/api/members");
        if (!res.ok) return;
        const data = await res.json();
        const list: MemberSummary[] = (data.members || []).map((m: any) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          status: m.status
        }));
        setAllMembers(list);
      } catch (e) {
        console.error("Failed to load member list:", e);
      }
    }
    fetchMembers();
  }, []);

  // load available styles
  useEffect(() => {
    async function fetchStyles() {
      try {
        const res = await fetch("/api/styles");
        if (!res.ok) return;
        const data = await res.json();
        const stylesList: AvailableStyle[] = (data.styles || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          beltConfig: s.beltConfig,
          ranks: s.ranks || []
        }));
        setAvailableStyles(stylesList);
      } catch (e) {
        console.error("Failed to load styles:", e);
      }
    }
    fetchStyles();
  }, []);

  // load recent classes for attendance
  useEffect(() => {
    async function fetchClasses() {
      try {
        const res = await fetch("/api/classes");
        if (!res.ok) return;
        const data = await res.json();
        // Sort by date descending and take recent ones
        const sortedClasses = (data.classes || [])
          .sort((a: { startsAt: string }, b: { startsAt: string }) =>
            new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
          )
          .slice(0, 100) // Keep last 100 classes for dropdown
          .map((c: { id: string; name: string; startsAt: string; styleName: string | null; styleNames: string | null; classType: string | null }) => ({
            id: c.id,
            name: c.name,
            startsAt: c.startsAt,
            styleName: c.styleName,
            styleNames: c.styleNames,
            classType: c.classType,
          }));
        setRecentClasses(sortedClasses);
      } catch (e) {
        console.error("Failed to load classes:", e);
      }
    }
    fetchClasses();
  }, []);

  // load available class types for filtering
  useEffect(() => {
    async function fetchClassTypes() {
      try {
        const res = await fetch("/api/classes?types=true");
        if (!res.ok) return;
        const data = await res.json();
        setAvailableClassTypes(data.classTypes || []);
      } catch (e) {
        console.error("Failed to load class types:", e);
      }
    }
    fetchClassTypes();
  }, []);

  // load relationships
  useEffect(() => {
    if (!memberId) return;
    fetchRelationships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function fetchRelationships() {
    try {
      setRelationshipsLoading(true);
      const res = await fetch(`/api/members/${memberId}/relationships`);
      if (!res.ok) {
        throw new Error("Failed to load relationships");
      }
      const data = await res.json();
      setRelationships(data.relationships || []);
      setRelationshipError(null);
    } catch (err: any) {
      console.error(err);
      setRelationshipError(err.message || "Failed to load relationships");
    } finally {
      setRelationshipsLoading(false);
    }
  }

  // localStorage key for member activity
  const getActivityStorageKey = (id: string) => `member-activity-${id}`;

  // Load activities from localStorage
  function loadStoredActivities(memberId: string): ActivityItem[] {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(getActivityStorageKey(memberId));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load stored activities:", e);
    }
    return [];
  }

  // Save activities to localStorage
  function saveActivities(memberId: string, activities: ActivityItem[]) {
    if (typeof window === "undefined") return;
    try {
      // Keep only the last 100 activities to prevent localStorage from getting too large
      const toStore = activities.slice(0, 100);
      localStorage.setItem(getActivityStorageKey(memberId), JSON.stringify(toStore));
    } catch (e) {
      console.error("Failed to save activities:", e);
    }
  }

  // Credit scheduling functions
  function openCreditBooking(credit: typeof serviceCredits[0]) {
    setBookingCredit(credit);
    setBookingDate("");
    setBookingSlots([]);
    setBookingSelectedSlot(null);
    setBookingNotes("");
    setShowCreditBooking(true);
  }

  async function fetchAvailableSlots(dateStr: string) {
    if (!dateStr || !bookingCredit) return;
    setBookingSlotsLoading(true);
    setBookingSelectedSlot(null);
    try {
      const apptId = bookingCredit.servicePackage.appointmentId || bookingCredit.servicePackage.appointment?.id || "";
      const duration = bookingCredit.servicePackage.appointment?.duration || 60;
      const params = new URLSearchParams({ date: dateStr, duration: String(duration) });
      if (apptId) params.set("appointmentId", apptId);
      const res = await fetch(`/api/coach-availability/slots?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBookingSlots(data.slots || []);
      } else {
        setBookingSlots([]);
      }
    } catch {
      setBookingSlots([]);
    } finally {
      setBookingSlotsLoading(false);
    }
  }

  async function handleCreditBookSubmit() {
    if (!bookingCredit || bookingSelectedSlot === null || !bookingDate) return;
    const slot = bookingSlots[bookingSelectedSlot];
    if (!slot) return;

    setBookingSaving(true);
    try {
      const apptId = bookingCredit.servicePackage.appointmentId || bookingCredit.servicePackage.appointment?.id;
      if (!apptId) {
        alert("No appointment type linked to this credit");
        return;
      }

      const res = await fetch("/api/scheduled-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: apptId,
          scheduledDate: bookingDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          memberId: memberId,
          memberName: `${firstName} ${lastName}`,
          coachId: slot.coachId,
          coachName: slot.coachName,
          notes: bookingNotes || null,
          memberServiceCreditId: bookingCredit.id,
          spaceId: slot.spaceId || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        alert(text || "Failed to schedule appointment");
        return;
      }

      // Refresh credits
      const creditsRes = await fetch(`/api/members/${memberId}/service-credits`);
      if (creditsRes.ok) {
        const data = await creditsRes.json();
        setServiceCredits(data.credits || []);
      }

      setShowCreditBooking(false);
      alert(`Appointment scheduled for ${new Date(bookingDate).toLocaleDateString()} at ${slot.startTime} with ${slot.coachName}`);
    } catch (err) {
      console.error("Error booking appointment:", err);
      alert("Failed to schedule appointment");
    } finally {
      setBookingSaving(false);
    }
  }

  function seedActivityFromMember(m: Member, testResults: TestResult[] = [], transactions: Transaction[] = []) {
    // Base activities from member data (these are always generated fresh)
    const base: ActivityItem[] = [
      {
        id: "created",
        type: "SYSTEM",
        message: "Member profile created",
        createdAt: m.createdAt
      }
    ];
    if (m.startDate) {
      base.push({
        id: "start",
        type: "TRAINING",
        message: "Training start date recorded",
        createdAt: m.startDate
      });
    }
    if (m.waiverSigned && m.waiverSignedAt) {
      base.push({
        id: "waiver",
        type: "ADMIN",
        message: "Waiver signed",
        createdAt: m.waiverSignedAt
      });
    }

    // Add attendance records as activities (most recent 20)
    if (m.attendances && m.attendances.length > 0) {
      const sortedAttendances = [...m.attendances].sort(
        (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()
      ).slice(0, 20);

      sortedAttendances.forEach(att => {
        const className = att.classSession?.name || "class";
        base.push({
          id: `attendance-${att.id}`,
          type: "ATTENDANCE",
          message: `Checked into ${className}`,
          createdAt: att.checkedInAt
        });
      });
    }

    // Add membership events as activities
    if (m.memberships && m.memberships.length > 0) {
      m.memberships.forEach(membership => {
        // Membership started (use startDate)
        if (membership.startDate) {
          base.push({
            id: `membership-started-${membership.id}`,
            type: "MEMBERSHIP",
            message: `Membership started: ${membership.membershipPlan.name}`,
            createdAt: membership.startDate
          });
        }
        // Membership canceled
        if (membership.status === "CANCELED" || membership.status === "CANCELLED") {
          base.push({
            id: `membership-canceled-${membership.id}`,
            type: "MEMBERSHIP",
            message: `Membership canceled: ${membership.membershipPlan.name}`,
            createdAt: membership.endDate || membership.startDate
          });
        }
        // Membership paused (use pauseEndDate as indicator)
        if (membership.status === "PAUSED" || membership.pauseEndDate) {
          base.push({
            id: `membership-paused-${membership.id}`,
            type: "MEMBERSHIP",
            message: `Membership paused: ${membership.membershipPlan.name}`,
            createdAt: membership.pauseEndDate || membership.startDate
          });
        }
      });
    }

    // Add test results as activities
    if (testResults && testResults.length > 0) {
      testResults.forEach(result => {
        const eventName = result.testingEvent?.name || "Belt Test";
        const styleName = result.testingEvent?.styleName || "";
        const rankInfo = result.testingForRank ? ` for ${result.testingForRank}` : "";

        // Test registration
        base.push({
          id: `test-registered-${result.id}`,
          type: "TEST",
          message: `Registered for ${eventName}${styleName ? ` (${styleName})` : ""}${rankInfo}`,
          createdAt: result.createdAt
        });

        // Test result (if graded)
        if (result.status === "PASSED" || result.status === "FAILED") {
          const passed = result.status === "PASSED";
          const scoreInfo = result.score !== null ? ` (${result.score}%)` : "";
          base.push({
            id: `test-result-${result.id}`,
            type: "TEST",
            message: `${passed ? "Passed" : "Failed"} ${eventName}${rankInfo}${scoreInfo}`,
            createdAt: result.updatedAt || result.createdAt
          });
        }
      });
    }

    // Add transactions as activities
    if (transactions && transactions.length > 0) {
      transactions.forEach(tx => {
        const amount = (tx.totalCents / 100).toFixed(2);
        const method = tx.paymentMethod ? formatPaymentMethod(tx.paymentMethod).toLowerCase() : "payment";
        base.push({
          id: `payment-${tx.id}`,
          type: "PAYMENT",
          message: `Payment: $${amount} via ${method}${tx.notes ? ` - ${tx.notes}` : ""}`,
          createdAt: tx.createdAt
        });
      });
    }

    // Load stored activities from localStorage
    const stored = loadStoredActivities(m.id);

    // Merge: stored activities + base activities, deduplicate by ID
    const allById = new Map<string, ActivityItem>();

    // Add base activities first
    base.forEach(a => allById.set(a.id, a));

    // Add stored activities (these may override base if IDs match)
    stored.forEach(a => allById.set(a.id, a));

    // Convert to array and sort by date (newest first)
    const merged = Array.from(allById.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    setActivity(merged);
  }

  function parseStylesFromMember(m: Member): StyleEntry[] {
    if (m.stylesNotes) {
      try {
        const parsed = JSON.parse(m.stylesNotes);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => {
              if (typeof item === "string") {
                return { name: item.trim() } as StyleEntry;
              }
              if (item && typeof item === "object") {
                const obj = item as any;
                const name = String(obj.name ?? "").trim();
                if (!name) return null;
                const entry: StyleEntry = {
                  name,
                  rank:
                    obj.rank !== undefined && obj.rank !== null
                      ? String(obj.rank)
                      : undefined,
                  beltSize:
                    obj.beltSize !== undefined && obj.beltSize !== null
                      ? String(obj.beltSize)
                      : undefined,
                  uniformSize:
                    obj.uniformSize !== undefined && obj.uniformSize !== null
                      ? String(obj.uniformSize)
                      : undefined,
                  startDate:
                    obj.startDate !== undefined && obj.startDate !== null
                      ? String(obj.startDate)
                      : undefined,
                  lastPromotionDate:
                    obj.lastPromotionDate !== undefined && obj.lastPromotionDate !== null
                      ? String(obj.lastPromotionDate)
                      : undefined,
                  active:
                    obj.active !== undefined
                      ? Boolean(obj.active)
                      : undefined
                };
                return entry;
              }
              return null;
            })
            .filter((s): s is StyleEntry => !!s && s.name.trim() !== "");
        }
      } catch {
        // ignore invalid JSON
      }
    }

    // fallback: primaryStyle + rank/uniform/startDate
    const baseName = m.primaryStyle;
    if (baseName) {
      const entry: StyleEntry = {
        name: baseName,
        rank: m.rank || undefined,
        uniformSize: m.uniformSize || undefined,
        startDate: m.startDate
          ? new Date(m.startDate).toISOString().slice(0, 10)
          : undefined
      };
      return [entry];
    }

    return [];
  }

  function hydrateFormFromMember(m: Member) {
    setFirstName(m.firstName);
    setLastName(m.lastName);
    setEmail(m.email || "");
    setPhone(formatPhoneNumber(m.phone || ""));
    // Parse status - can be comma-separated or single value
    const statusValue = m.status || "PROSPECT";
    const statusArray = statusValue.includes(",")
      ? statusValue.split(",").map(s => s.trim()).filter(s => s)
      : [statusValue];
    setStatuses(statusArray);
    setMemberNumber(
      m.memberNumber != null ? String(m.memberNumber) : ""
    );

    setDateOfBirth(
      m.dateOfBirth ? new Date(m.dateOfBirth).toISOString().slice(0, 10) : ""
    );
    setAddress(m.address || "");
    setCity(m.city || "");
    setStateValue(m.state || "");
    setZipCode(m.zipCode || "");
    setEmergencyContactNameState(m.emergencyContactName || "");
    setEmergencyContactPhoneState(formatPhoneNumber(m.emergencyContactPhone || ""));
    setParentGuardianName(m.parentGuardianName || "");
    setMinorCommsMode(m.minorCommsMode || "both");
    setEmailOptIn(m.emailOptIn !== false);
    setNotes(m.notes || "");
    setLeadSource(m.leadSource || "");
    setReferredByMemberId(m.referredByMemberId || "");

    setMedicalNotes(m.medicalNotes || "");
    setWaiverSigned(!!m.waiverSigned);
    setWaiverSignedAt(
      m.waiverSignedAt
        ? new Date(m.waiverSignedAt).toISOString().slice(0, 10)
        : ""
    );

    const parsedStyles = parseStylesFromMember(m);
    setStyles(parsedStyles);

    // Parse style documents
    let docs: StyleDocument[] = [];
    if (m.styleDocuments) {
      try {
        docs = JSON.parse(m.styleDocuments);
      } catch {
        docs = [];
      }
    }
    setStyleDocuments(docs);

    setMembershipType(m.membershipType || "");
    setPhotoUrl(m.photoUrl || "");
    setPaymentNotes(m.paymentNotes || "");
  }

  function cancelSection(section: EditableSection) {
    if (!member) return;
    hydrateFormFromMember(member);

    if (section === "personal") setEditingPersonal(false);
    if (section === "style") setEditingStyleIndex(null);
    if (section === "membership") setEditingMembershipId(null);
    if (section === "payments") setEditingPayments(false);
    if (section === "photo") setEditingPhoto(false);
    if (section === "relationships") {
      setAddingRelationship(false);
      setNewRelationshipMemberId("");
      setNewRelationshipType("PARENT");
    }

    setError(null);
    setRelationshipError(null);
  }

  // Activity types: SYSTEM, TRAINING, ADMIN, PROFILE, STYLE, MEMBERSHIP, STATUS, NOTES, PAYMENT, ATTENDANCE, TEST
  function addActivity(message: string, type: string = "PROFILE") {
    if (!memberId) return;

    const newActivity: ActivityItem = {
      id: `${type.toLowerCase()}-${Date.now()}`,
      type,
      message,
      createdAt: new Date().toISOString()
    };

    setActivity((prev) => {
      const updated = [newActivity, ...prev];
      // Save to localStorage
      saveActivities(memberId, updated);
      return updated;
    });
  }

  // Backward compatibility wrapper
  function addActivityFromUpdate(message: string) {
    addActivity(message, "PROFILE");
  }

  // Load curriculum for member's active styles (progressive access up to current rank)
  const loadMemberCurriculum = useCallback(async (memberStyles: StyleEntry[], stylesData: AvailableStyle[]) => {
    setLoadingCurriculum(true);
    const curricula: Record<string, CurriculumRankTest[]> = {};

    try {
      for (const memberStyle of memberStyles) {
        if (memberStyle.active === false || !memberStyle.rank || !memberStyle.name) continue;

        const styleData = stylesData.find(
          s => s.name.toLowerCase() === memberStyle.name.toLowerCase()
        );
        if (!styleData || !styleData.ranks || styleData.ranks.length === 0) continue;

        const currentRank = styleData.ranks.find(r => r.name === memberStyle.rank);
        if (!currentRank) continue;

        const ranksToShow = styleData.ranks
          .filter(r => r.order <= currentRank.order)
          .sort((a, b) => a.order - b.order);

        const styleCurricula: CurriculumRankTest[] = [];

        for (const rank of ranksToShow) {
          try {
            const res = await fetch(`/api/rank-tests?rankId=${rank.id}&styleId=${styleData.id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.rankTests && data.rankTests.length > 0) {
                styleCurricula.push(...data.rankTests);
              }
            }
          } catch {
            // Skip failed ranks
          }
        }

        if (styleCurricula.length > 0) {
          curricula[memberStyle.name] = styleCurricula;
        }
      }

      setMemberCurricula(curricula);
    } catch (err) {
      console.error("Failed to load member curriculum:", err);
    } finally {
      setLoadingCurriculum(false);
    }
  }, []);

  // Load curriculum when styles and available styles are ready
  useEffect(() => {
    if (styles.length > 0 && availableStyles.length > 0) {
      loadMemberCurriculum(styles, availableStyles);
    }
  }, [styles, availableStyles, loadMemberCurriculum]);

  async function copyRankPDFsToStyleDocuments(styles: StyleEntry[], memberData: Member) {
    if (!memberId) return;

    try {
      // Parse current style documents from the fresh member data
      let currentDocs: StyleDocument[] = [];
      if (memberData.styleDocuments) {
        try {
          currentDocs = JSON.parse(memberData.styleDocuments);
        } catch {
          currentDocs = [];
        }
      }

      let updatedDocs = [...currentDocs];
      let hasChanges = false;

      // Helper function to get all PDF names from a style's beltConfig
      const getPdfNamesFromStyle = (styleName: string): string[] => {
        const styleData = availableStyles.find(s => s.name.toLowerCase() === styleName.toLowerCase());
        if (!styleData?.beltConfig) return [];

        try {
          const beltConfig = typeof styleData.beltConfig === 'string'
            ? JSON.parse(styleData.beltConfig)
            : styleData.beltConfig;

          if (!beltConfig.ranks || !Array.isArray(beltConfig.ranks)) return [];

          const pdfNames: string[] = [];
          for (const rank of beltConfig.ranks) {
            if (rank.pdfDocuments && Array.isArray(rank.pdfDocuments)) {
              for (const pdf of rank.pdfDocuments) {
                if (pdf.name) pdfNames.push(pdf.name);
              }
            }
          }
          return pdfNames;
        } catch {
          return [];
        }
      };

      // Helper function to get PDF names for ranks ABOVE a target rank (for downgrade removal)
      const getPdfNamesAboveRank = (styleName: string, targetRankName: string): string[] => {
        const styleData = availableStyles.find(s => s.name.toLowerCase() === styleName.toLowerCase());
        if (!styleData?.beltConfig) return [];

        try {
          const beltConfig = typeof styleData.beltConfig === 'string'
            ? JSON.parse(styleData.beltConfig)
            : styleData.beltConfig;

          if (!beltConfig.ranks || !Array.isArray(beltConfig.ranks)) return [];

          // Find the target rank
          const targetRank = beltConfig.ranks.find((r: any) => r.name === targetRankName);
          if (!targetRank) return [];

          // Get ranks ABOVE the target rank (higher order number)
          const ranksAbove = beltConfig.ranks.filter((r: any) => r.order > targetRank.order);

          const pdfNames: string[] = [];
          for (const rank of ranksAbove) {
            if (rank.pdfDocuments && Array.isArray(rank.pdfDocuments)) {
              for (const pdf of rank.pdfDocuments) {
                if (pdf.name) pdfNames.push(pdf.name);
              }
            }
          }
          return pdfNames;
        } catch {
          return [];
        }
      };

      // First, remove PDFs from inactive styles
      for (const style of styles) {
        if (style.active === false && style.name) {
          const pdfNamesToRemove = getPdfNamesFromStyle(style.name);
          if (pdfNamesToRemove.length > 0) {
            const beforeCount = updatedDocs.length;
            updatedDocs = updatedDocs.filter(doc => !pdfNamesToRemove.includes(doc.name));
            if (updatedDocs.length < beforeCount) {
              hasChanges = true;
            }
          }
        }
      }

      // Handle active styles - remove docs for ranks above current, add docs for ranks up to current
      for (const style of styles) {
        // Skip inactive styles or styles without rank/name
        if (style.active === false || !style.rank || !style.name) continue;

        // Find the style in availableStyles
        const styleData = availableStyles.find(s => s.name.toLowerCase() === style.name.toLowerCase());
        if (!styleData || !styleData.beltConfig) continue;

        // Parse the beltConfig to get rank PDFs
        let beltConfig: any;
        try {
          beltConfig = typeof styleData.beltConfig === 'string'
            ? JSON.parse(styleData.beltConfig)
            : styleData.beltConfig;
        } catch {
          continue;
        }

        if (!beltConfig.ranks || !Array.isArray(beltConfig.ranks)) continue;

        // Find the current rank in beltConfig
        const currentRank = beltConfig.ranks.find((r: any) => r.name === style.rank);
        if (!currentRank) continue;

        // Get the current rank's order number
        const currentOrder = currentRank.order;

        // FIRST: Remove PDFs for ranks ABOVE the current rank (handles downgrades)
        const pdfNamesToRemove = getPdfNamesAboveRank(style.name, style.rank);
        if (pdfNamesToRemove.length > 0) {
          const beforeCount = updatedDocs.length;
          updatedDocs = updatedDocs.filter(doc => !pdfNamesToRemove.includes(doc.name));
          if (updatedDocs.length < beforeCount) {
            hasChanges = true;
          }
        }

        // THEN: Get all ranks up to and including the current rank (by order number)
        const ranksToInclude = beltConfig.ranks.filter((r: any) => r.order <= currentOrder);

        // Add PDFs from all these ranks
        for (const rank of ranksToInclude) {
          if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

          // Add each PDF to style documents if not already there
          for (const rankPdf of rank.pdfDocuments) {
            // Check if this PDF already exists (by name)
            const exists = updatedDocs.some(doc => doc.name === rankPdf.name);
            if (!exists) {
              const newDoc: StyleDocument = {
                id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: rankPdf.name,
                url: rankPdf.url,
                uploadedAt: new Date().toISOString()
              };
              updatedDocs.push(newDoc);
              hasChanges = true;
              // Small delay to ensure unique IDs
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          }
        }
      }

      // If we made any changes, save them
      if (hasChanges) {
        setStyleDocuments(updatedDocs);

        const res = await fetch(`/api/members/${memberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            styleDocuments: JSON.stringify(updatedDocs)
          })
        });

        if (res.ok) {
          const updated = await res.json();
          setMember(updated.member);
          addActivityFromUpdate("Rank documents updated automatically");
        }
      }
    } catch (err: any) {
      console.error("Failed to copy rank PDFs:", err);
      // Don't throw error - this is a supplementary feature
    }
  }

  async function saveSection(section: EditableSection) {
    if (!memberId) return;
    setError(null);

    if (section === "personal") {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First and last name are required.");
        return;
      }
    }

    const normalizedStyles: StyleEntry[] = styles
      .map((s) => ({
        name: s.name.trim(),
        rank: s.rank?.trim() || undefined,
        beltSize: s.beltSize?.trim() || undefined,
        uniformSize: s.uniformSize?.trim() || undefined,
        startDate: s.startDate || undefined,
        lastPromotionDate: s.lastPromotionDate || undefined,
        active: s.active,
        attendanceResetDate: s.attendanceResetDate || undefined
      }))
      .filter((s) => s.name !== "");

    const primary = normalizedStyles[0];

    const memberNumberValue =
      memberNumber.trim() === "" ? null : Number(memberNumber.trim());

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      status: statuses.join(","),
      memberNumber:
        memberNumberValue != null && !Number.isNaN(memberNumberValue)
          ? memberNumberValue
          : null,

      dateOfBirth: dateOfBirth || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state: stateValue.trim() || null,
      zipCode: zipCode.trim() || null,
      emergencyContactName: emergencyContactNameState.trim() || null,
      emergencyContactPhone: emergencyContactPhoneState.trim() || null,
      parentGuardianName: parentGuardianName.trim() || null,
      minorCommsMode,
      emailOptIn,
      notes: notes.trim() || null,

      medicalNotes: medicalNotes.trim() || null,
      waiverSigned,
      waiverSignedAt: waiverSignedAt || null,

      primaryStyle: primary ? primary.name : null,
      stylesNotes:
        normalizedStyles.length > 0 ? JSON.stringify(normalizedStyles) : null,

      rank: primary && primary.rank ? primary.rank : null,
      startDate: primary && primary.startDate ? primary.startDate : null,
      uniformSize:
        primary && primary.uniformSize ? primary.uniformSize : null,

      membershipType: membershipType.trim() || null,

      photoUrl: photoUrl.trim() || null,
      paymentNotes: paymentNotes.trim() || null,
      leadSource: leadSource.trim() || null,
      referredByMemberId: referredByMemberId || null,
    };

    try {
      setSavingSection(section);
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update member");
      }

      const data = await res.json();
      const updated: Member = data.member;
      setMember(updated);
      hydrateFormFromMember(updated);

      // If saving styles section and there are ranks, automatically add rank PDFs to style documents
      if (section === "style" && normalizedStyles.length > 0) {
        await copyRankPDFsToStyleDocuments(normalizedStyles, updated);
      }

      if (section === "personal") setEditingPersonal(false);
      if (section === "style") setEditingStyleIndex(null);
      if (section === "membership") setEditingMembershipId(null);
      if (section === "payments") setEditingPayments(false);
      if (section === "photo") setEditingPhoto(false);

      // Generate more specific activity messages
      if (section === "style") {
        // Compare old and new styles to detect specific changes
        const oldStyles = parseStylesFromMember(member!);
        const changes: string[] = [];

        // Check for rank changes
        normalizedStyles.forEach(newStyle => {
          const oldStyle = oldStyles.find(os => os.name === newStyle.name);
          if (oldStyle) {
            if (newStyle.rank && newStyle.rank !== oldStyle.rank) {
              if (!oldStyle.rank) {
                changes.push(`Rank set to ${newStyle.rank} in ${newStyle.name}`);
              } else {
                changes.push(`Promoted to ${newStyle.rank} in ${newStyle.name}`);
              }
            }
          } else if (newStyle.name) {
            changes.push(`Added style: ${newStyle.name}${newStyle.rank ? ` (${newStyle.rank})` : ""}`);
          }
        });

        // Log each change as a separate activity
        if (changes.length > 0) {
          changes.forEach(change => addActivity(change, "STYLE"));
        } else {
          addActivity("Styles updated", "STYLE");
        }
      } else if (section === "personal") {
        // Check for status changes
        const oldStatuses = (member?.status || "").split(",").map(s => s.trim()).filter(Boolean);
        const newStatuses = statuses;
        const addedStatuses = newStatuses.filter(s => !oldStatuses.includes(s));
        const removedStatuses = oldStatuses.filter(s => !newStatuses.includes(s));

        if (addedStatuses.length > 0 || removedStatuses.length > 0) {
          if (addedStatuses.length > 0) {
            addActivity(`Status added: ${addedStatuses.join(", ")}`, "STATUS");
          }
          if (removedStatuses.length > 0) {
            addActivity(`Status removed: ${removedStatuses.join(", ")}`, "STATUS");
          }
        }

        // Check for notes changes
        const oldNotes = member?.notes || "";
        const newNotes = notes.trim();
        if (newNotes !== oldNotes) {
          if (!oldNotes && newNotes) {
            addActivity("Notes added", "NOTES");
          } else if (oldNotes && newNotes) {
            addActivity("Notes updated", "NOTES");
          }
        }

        addActivity("Personal info updated", "PROFILE");
      } else if (section === "payments") {
        addActivity("Payment notes updated", "PAYMENT");
      } else {
        addActivityFromUpdate(
          section === "membership"
            ? "Membership info updated"
            : section === "waiver"
            ? "Waiver info updated"
            : "Photo updated"
        );
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update member");
    } finally {
      setSavingSection(null);
    }
  }

  async function handleAddRelationship() {
    if (!memberId) return;
    setRelationshipError(null);

    if (!newRelationshipMemberId || !newRelationshipType) {
      setRelationshipError("Please select a member and relationship type.");
      return;
    }

    try {
      const res = await fetch(`/api/members/${memberId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMemberId: newRelationshipMemberId,
          relationship: newRelationshipType
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add relationship");
      }

      await fetchRelationships();
      setNewRelationshipMemberId("");
      setNewRelationshipType("PARENT");
      setAddingRelationship(false);

      addActivityFromUpdate("Relationships updated");
    } catch (err: any) {
      console.error(err);
      setRelationshipError(err.message || "Failed to add relationship");
    }
  }

  async function handleRemoveRelationship(id: string) {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/members/${memberId}/relationships`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove relationship");
      }

      setRelationships((prev) => prev.filter((r) => r.id !== id));
      addActivityFromUpdate("Relationships updated");
    } catch (err: any) {
      console.error(err);
      setRelationshipError(err.message || "Failed to remove relationship");
    }
  }

  function goBackToList() {
    router.push("/members");
  }

  async function handleDeleteMember() {
    if (!member) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${member.firstName} ${member.lastName}? This action cannot be undone.`
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

      // Redirect to members list after successful deletion
      router.push("/members");
    } catch (err: any) {
      console.error("Error deleting member:", err);
      setError(err.message || "Failed to delete member");
    }
  }

  const [sendingReset, setSendingReset] = useState(false);

  async function handleSendPasswordReset() {
    if (!member?.email) {
      setError("This member does not have an email address.");
      return;
    }

    setSendingReset(true);
    setError("");

    try {
      const res = await fetch(`/api/members/${memberId}/send-password-reset`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send reset email");
      }

      if (data.devResetUrl) {
        // Dev mode: open the reset page directly
        window.open(data.devResetUrl, "_blank");
      } else {
        alert(`Password reset email sent to ${member.email}`);
      }
    } catch (err: any) {
      console.error("Error sending password reset:", err);
      setError(err.message || "Failed to send password reset email");
    } finally {
      setSendingReset(false);
    }
  }

  const initials =
    firstName && lastName
      ? `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
      : "M";

  function addStyle() {
    setStyles((prev) => [
      ...prev,
      { name: "", rank: "", beltSize: "", uniformSize: "", startDate: "" }
    ]);
  }

  function updateStyle(
    index: number,
    field: keyof StyleEntry,
    value: string | boolean
  ) {
    setStyles((prev) => {
      const copy = [...prev];
      const current =
        copy[index] ?? {
          name: "",
          rank: "",
          beltSize: "",
          uniformSize: "",
          startDate: "",
          lastPromotionDate: ""
        };

      // If rank is changing to a different value, update lastPromotionDate
      if (field === "rank" && value !== current.rank && value !== "") {
        const today = getTodayString();
        copy[index] = { ...current, [field]: value, lastPromotionDate: today } as StyleEntry;
      } else {
        copy[index] = { ...current, [field]: value } as StyleEntry;
      }
      return copy;
    });
  }

  async function removeStyle(index: number) {
    if (!memberId) return;

    // Get the style being removed to find its rank documents
    const styleToRemove = styles[index];
    const updatedStyles = styles.filter((_, i) => i !== index);
    setStyles(updatedStyles);

    // Auto-save the removal to the database
    try {
      const normalizedStyles = updatedStyles
        .map((s) => ({
          name: s.name.trim(),
          rank: s.rank?.trim() || undefined,
          beltSize: s.beltSize?.trim() || undefined,
          uniformSize: s.uniformSize?.trim() || undefined,
          startDate: s.startDate || undefined,
          lastPromotionDate: s.lastPromotionDate || undefined,
          active: s.active,
          attendanceResetDate: s.attendanceResetDate || undefined
        }))
        .filter((s) => s.name !== "");

      const primary = normalizedStyles[0];

      // Find rank document names to remove from this style
      const pdfNamesToRemove: string[] = [];
      if (styleToRemove?.name) {
        const styleData = availableStyles.find(s => s.name.toLowerCase() === styleToRemove.name.toLowerCase());
        if (styleData?.beltConfig) {
          try {
            const beltConfig = typeof styleData.beltConfig === 'string'
              ? JSON.parse(styleData.beltConfig)
              : styleData.beltConfig;

            if (beltConfig.ranks && Array.isArray(beltConfig.ranks)) {
              for (const rank of beltConfig.ranks) {
                if (rank.pdfDocuments && Array.isArray(rank.pdfDocuments)) {
                  for (const pdf of rank.pdfDocuments) {
                    if (pdf.name) {
                      pdfNamesToRemove.push(pdf.name);
                    }
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Remove rank documents associated with this style
      let updatedStyleDocuments = styleDocuments;
      if (pdfNamesToRemove.length > 0) {
        updatedStyleDocuments = styleDocuments.filter(doc => !pdfNamesToRemove.includes(doc.name));
        setStyleDocuments(updatedStyleDocuments);
      }

      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryStyle: primary ? primary.name : null,
          stylesNotes: normalizedStyles.length > 0 ? JSON.stringify(normalizedStyles) : null,
          rank: primary && primary.rank ? primary.rank : null,
          styleDocuments: JSON.stringify(updatedStyleDocuments),
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMember(data.member);
        addActivityFromUpdate("Style removed");
      }
    } catch (err) {
      console.error("Failed to save style removal:", err);
    }
  }

  const availableMembersForRelationships = allMembers.filter(
    (m) => m.id !== memberId
  );

  const ageFromState = calculateAgeFromDateString(dateOfBirth);
  const ageFromMember = calculateAgeFromDateString(member?.dateOfBirth);

  function handlePhotoFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setPhotoUrl(result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setUploadingDocument(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const result = reader.result;
        if (typeof result === "string") {
          // Create new document entry
          // Remove .pdf extension from the name
          const fileName = file.name.replace(/\.pdf$/i, '');
          const newDoc: StyleDocument = {
            id: `doc-${Date.now()}`,
            name: fileName,
            url: result, // base64 data URL
            uploadedAt: new Date().toISOString()
          };

          const updatedDocs = [...styleDocuments, newDoc];
          setStyleDocuments(updatedDocs);

          // Save to server
          const res = await fetch(`/api/members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              styleDocuments: JSON.stringify(updatedDocs)
            })
          });

          if (!res.ok) {
            throw new Error("Failed to upload document");
          }

          const updated = await res.json();
          setMember(updated.member);
          addActivityFromUpdate(`Uploaded document: ${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || "Failed to upload document");
      // Revert on error
      if (member) {
        hydrateFormFromMember(member);
      }
    } finally {
      setUploadingDocument(false);
      // Reset file input
      e.target.value = "";
    }
  }

  async function handleRemoveDocument(docId: string) {
    const doc = styleDocuments.find((d) => d.id === docId);
    if (!doc) return;

    if (!window.confirm(`Are you sure you want to remove "${doc.name}"?`)) {
      return;
    }

    try {
      const updatedDocs = styleDocuments.filter((d) => d.id !== docId);
      setStyleDocuments(updatedDocs);

      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleDocuments: JSON.stringify(updatedDocs)
        })
      });

      if (!res.ok) {
        throw new Error("Failed to remove document");
      }

      const updated = await res.json();
      setMember(updated.member);
      addActivityFromUpdate(`Removed document: ${doc.name}`);
    } catch (err: any) {
      setError(err.message || "Failed to remove document");
      // Revert on error
      if (member) {
        hydrateFormFromMember(member);
      }
    }
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Page title with back button */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Member Profile</h1>
            <p className="text-sm text-gray-600">
              View and edit member details, styles, attendance, and memberships.
            </p>
          </div>
          {/* Back to Report button - shown when coming from a report */}
          {fromReport && (
            <Link
              href={`/reports?tab=${fromReport}`}
              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primaryDark"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Report
            </Link>
          )}
        </div>

        {/* Header + photo */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Photo column */}
            <div className="flex flex-col items-center gap-2">
              {photoUrl ? (
                <div className="relative group">
                  <img
                    src={photoUrl}
                    alt={`${firstName} ${lastName}`}
                    className="h-16 w-16 rounded-full object-cover border border-gray-200 cursor-pointer"
                  />
                  {/* Full-size photo popup on hover */}
                  <div className="absolute left-20 top-0 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
                    <div className="w-96 h-96 rounded-lg shadow-2xl border-4 border-white bg-white overflow-hidden">
                      <img
                        src={photoUrl}
                        alt={`${firstName} ${lastName}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-lg font-semibold text-gray-700 border border-gray-300">
                  {initials}
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoFileChange}
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoFileChange}
              />

              {/* Edit/Save button under photo */}
              {!editingPhoto ? (
                <button
                  type="button"
                  onClick={() => setEditingPhoto(true)}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  disabled={savingSection === "photo"}
                  onClick={() => saveSection("photo")}
                  className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingSection === "photo" ? "Saving..." : "Save"}
                </button>
              )}
            </div>

            {/* Name and info column */}
            <div>
              <h1 className="text-2xl font-bold">
                {member
                  ? `${member.firstName} ${member.lastName}`
                  : "Member Profile"}
              </h1>
              <p className="text-sm text-gray-600">
                Personal info, relationships, styles, payments, and activity.
              </p>

              {/* Account balance badges */}
              {member && member.accountCreditCents !== undefined && member.accountCreditCents !== 0 && (
                <div className="mt-2">
                  {member.accountCreditCents < 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      Balance Due: ${(Math.abs(member.accountCreditCents) / 100).toFixed(2)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      Account Credit: ${(member.accountCreditCents / 100).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {/* Photo edit buttons - only show when editing */}
              {editingPhoto && (
                <div className="flex items-center gap-2" style={{ marginTop: '18px' }}>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="text-xs rounded-md bg-primary px-2 py-1 font-semibold text-white hover:bg-primaryDark"
                  >
                    Use Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="text-xs rounded-md bg-primary px-2 py-1 font-semibold text-white hover:bg-primaryDark"
                  >
                    Upload from Device
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelSection("photo")}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Back to Members button */}
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={goBackToList}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Back to Members
            </button>
            <button
              type="button"
              onClick={handleDeleteMember}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Delete Member
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading profile…</p>}

        {(error || relationshipError) && (
          <div className="space-y-1">
            {error && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                {error}
              </div>
            )}
            {relationshipError && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                {relationshipError}
              </div>
            )}
          </div>
        )}

        {!loading && member && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* LEFT: Personal + Relationships + Styles + Membership */}
            <div className="space-y-4 xl:col-span-2">
              {/* PERSONAL INFO */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Personal Info</h2>
                  {!editingPersonal ? (
                    <div className="flex items-center gap-2">
                      {member?.email && (
                        <button
                          type="button"
                          onClick={handleSendPasswordReset}
                          disabled={sendingReset}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                        >
                          {sendingReset ? "Sending..." : "Reset Password"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingPersonal(true)}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingSection === "personal"}
                        onClick={() => saveSection("personal")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "personal" ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelSection("personal")}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {!editingPersonal ? (
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">Name</dt>
                      <dd className="text-gray-900">
                        {member.firstName} {member.lastName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Member #
                      </dt>
                      <dd className="text-gray-900 flex items-center gap-2">
                        {member.memberNumber != null ? (
                          member.memberNumber
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        <button
                          onClick={() => {
                            const w = window.open("", "_blank", "width=350,height=400");
                            if (w) {
                              w.document.write(`<html><head><title>QR - ${member.firstName} ${member.lastName}</title></head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif"><img src="/api/members/${member.id}/qrcode" width="250" height="250" /><p style="margin-top:12px;font-size:14px;color:#333">${member.firstName} ${member.lastName}</p></body></html>`);
                            }
                          }}
                          className="text-xs text-primary hover:text-primaryDark font-medium"
                          title="Show QR Code"
                        >
                          QR
                        </button>
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Email
                      </dt>
                      <dd className="text-gray-900">
                        {member.email || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Phone
                      </dt>
                      <dd className="text-gray-900">
                        {member.phone || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Date of Birth
                      </dt>
                      <dd className="text-gray-900">
                        {member.dateOfBirth ? (
                          <>
                            {new Date(
                              member.dateOfBirth
                            ).toLocaleDateString()}
                            {ageFromMember !== null && (
                              <span className="text-xs text-gray-500">
                                {" "}
                                ({ageFromMember} yrs)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Address
                      </dt>
                      <dd className="text-gray-900">
                        {member.address ? (
                          <>
                            {member.address}
                            {member.city && `, ${member.city}`}
                            {member.state && `, ${member.state}`}
                            {member.zipCode && ` ${member.zipCode}`}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Emergency Contact
                      </dt>
                      <dd className="text-gray-900">
                        {member.emergencyContactName ? (
                          <>
                            {member.emergencyContactName}
                            {member.emergencyContactPhone &&
                              ` ${member.emergencyContactPhone}`}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Status
                      </dt>
                      <dd className="flex flex-wrap gap-1">
                        {sortStatusesByPriority(
                          member.status.includes(",")
                            ? member.status.split(",").map(s => s.trim())
                            : [member.status]
                        ).map((s) => (
                          <span
                            key={s}
                            className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClasses(s)}`}
                          >
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </span>
                        ))}
                      </dd>
                    </div>

                    {member.accessRole && (
                      <div>
                        <dt className="text-gray-500 text-xs uppercase">
                          Access Role
                        </dt>
                        <dd>
                          <span className="inline-flex items-center justify-center rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-medium">
                            {member.accessRole === "FRONT_DESK" ? "Front Desk" : member.accessRole.charAt(0) + member.accessRole.slice(1).toLowerCase()}
                          </span>
                        </dd>
                      </div>
                    )}

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Parent / Guardian
                      </dt>
                      <dd className="text-gray-900">
                        {member.parentGuardianName || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    {(() => {
                      const memberAge = calculateAgeFromDateString(member.dateOfBirth);
                      const isMinor = memberAge !== null && memberAge < 18;
                      const isParentOfMinor = relationships.some(rel => {
                        const isParentOrGuardian = (rel.relationship === "PARENT" || rel.relationship === "GUARDIAN") && rel.fromMemberId === member.id;
                        if (!isParentOrGuardian) return false;
                        const child = rel.toMember;
                        const childAge = calculateAgeFromDateString(child.dateOfBirth);
                        return childAge !== null && childAge < 18;
                      });
                      if (!isMinor && !isParentOfMinor) return null;
                      return (
                        <div>
                          <dt className="text-gray-500 text-xs uppercase">
                            Communication
                          </dt>
                          <dd className="text-gray-900">
                            {member.minorCommsMode === "parent_only" ? "Parent Only" : "Member & Parent"}
                          </dd>
                        </div>
                      );
                    })()}
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Created
                      </dt>
                      <dd className="text-gray-900 text-xs">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </dd>
                    </div>

                    {/* RELATIONSHIPS SECTION */}
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Relationships
                      </dt>
                      <dd className="text-gray-900">
                        {relationshipsLoading ? (
                          <span className="text-xs text-gray-500">
                            Loading relationships…
                          </span>
                        ) : relationships.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="space-y-1">
                            {relationships.map((rel) => (
                              <div key={rel.id} className="text-sm">
                                <RelationshipLabel
                                  rel={rel}
                                  currentMemberId={memberId}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </dd>
                    </div>

                    {/* WAIVER SECTION */}
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Waiver
                      </dt>
                      <dd className="text-gray-900">
                        <div className="space-y-0.5 text-sm">
                          <div>
                            Signed: <span>{member.waiverSigned ? "Yes" : "No"}</span>
                          </div>
                          {member.waiverSignedAt && (
                            <div>
                              Date: <span>{new Date(member.waiverSignedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              fetch(`/api/waivers/signed/${member.id}`)
                                .then(r => r.json())
                                .then(data => {
                                  if (data.waivers?.length) {
                                    const list = data.waivers.map((w: { templateName: string; signedAt: string }) =>
                                      `${w.templateName} — ${new Date(w.signedAt).toLocaleDateString()}`
                                    ).join("\n");
                                    alert("Signed Waivers:\n\n" + list);
                                  } else {
                                    alert("No signed waivers on file.");
                                  }
                                });
                            }}
                            className="text-xs text-primary hover:text-primaryDark font-medium"
                          >
                            View Signed Waivers
                          </button>
                        </div>
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Medical Notes
                      </dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">
                        {member.medicalNotes || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Notes
                      </dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">
                        {member.notes || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Lead Source
                      </dt>
                      <dd className="text-gray-900">
                        {member.leadSource || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    {member.leadSource === "Referral" && member.referredByMemberId && (
                      <div>
                        <dt className="text-gray-500 text-xs uppercase">
                          Referred By
                        </dt>
                        <dd className="text-gray-900">
                          {(() => {
                            const referrer = allMembers.find(m => m.id === member.referredByMemberId);
                            return referrer ? (
                              <Link href={`/members/${referrer.id}`} className="text-primary hover:text-primaryDark">
                                {referrer.firstName} {referrer.lastName}
                              </Link>
                            ) : <span className="text-gray-400">Unknown member</span>;
                          })()}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("personal");
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-sm"
                  >
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        First Name *
                      </label>
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Last Name *
                      </label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Member #
                      </label>
                      <input
                        value={memberNumber}
                        onChange={(e) => setMemberNumber(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="e.g. 10000001"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Status
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Coach */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("COACH")) {
                              setStatuses((prev) => prev.filter((s) => s !== "COACH"));
                            } else {
                              // Adding Coach clears Banned
                              setStatuses((prev) => [...prev.filter((s) => s !== "COACH" && s !== "BANNED"), "COACH"]);
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("COACH")
                              ? "bg-purple-100 text-purple-800 border-purple-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Coach
                        </button>
                        {/* Active */}
                        <button
                          type="button"
                          onClick={() => {
                            // Prospect/Active/Inactive are mutually exclusive, clears Banned
                            setStatuses((prev) => {
                              const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                              return [...others, "ACTIVE"];
                            });
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("ACTIVE")
                              ? "bg-green-100 text-green-800 border-green-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Active
                        </button>
                        {/* Parent */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("PARENT")) {
                              setStatuses((prev) => prev.filter((s) => s !== "PARENT"));
                            } else {
                              // Adding Parent clears Banned
                              setStatuses((prev) => [...prev.filter((s) => s !== "PARENT" && s !== "BANNED"), "PARENT"]);
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("PARENT")
                              ? "bg-blue-100 text-blue-800 border-blue-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Parent
                        </button>
                        {/* Canceled */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("CANCELED")) {
                              setStatuses((prev) => prev.filter((s) => s !== "CANCELED"));
                            } else {
                              // Adding Canceled clears Banned
                              setStatuses((prev) => [...prev.filter((s) => s !== "CANCELED" && s !== "BANNED"), "CANCELED"]);
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("CANCELED")
                              ? "bg-orange-100 text-orange-800 border-orange-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Canceled
                        </button>
                        {/* Inactive */}
                        <button
                          type="button"
                          onClick={() => {
                            // Prospect/Active/Inactive are mutually exclusive, clears Banned
                            setStatuses((prev) => {
                              const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                              return [...others, "INACTIVE"];
                            });
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("INACTIVE")
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Inactive
                        </button>
                        {/* Prospect */}
                        <button
                          type="button"
                          onClick={() => {
                            // Prospect/Active/Inactive are mutually exclusive, clears Banned
                            setStatuses((prev) => {
                              const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                              return [...others, "PROSPECT"];
                            });
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("PROSPECT")
                              ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Prospect
                        </button>
                        {/* Banned */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("BANNED")) {
                              // Removing Banned - confirm first
                              if (window.confirm("Are you sure you want to remove the banned status from this member?")) {
                                setStatuses((prev) => prev.filter((s) => s !== "BANNED"));
                              }
                            } else {
                              // Adding Banned clears ALL other statuses - confirm first
                              if (window.confirm("Are you sure you want to ban this member? This will clear all other statuses.")) {
                                setStatuses(["BANNED"]);
                              }
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("BANNED")
                              ? "bg-gray-200 text-gray-900 border-gray-400"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Banned
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          id="emailOptIn"
                          checked={emailOptIn}
                          onChange={(e) => setEmailOptIn(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="emailOptIn" className="text-[11px] text-gray-500">
                          Opted in to email notifications
                        </label>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                        placeholder="(123) 456-7890"
                        maxLength={14}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                      {dateOfBirth && ageFromState !== null && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Age: {ageFromState} years
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Address
                      </label>
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        City
                      </label>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        State
                      </label>
                      <input
                        value={stateValue}
                        onChange={(e) => setStateValue(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Zip Code
                      </label>
                      <input
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Parent/Guardian Name (for minors)
                      </label>
                      <input
                        value={parentGuardianName}
                        onChange={(e) =>
                          setParentGuardianName(e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    {(() => {
                      const editAge = calculateAgeFromDateString(dateOfBirth);
                      const editIsMinor = editAge !== null && editAge < 18;
                      const editIsParentOfMinor = relationships.some(rel => {
                        const isParentOrGuardian = (rel.relationship === "PARENT" || rel.relationship === "GUARDIAN") && rel.fromMemberId === member?.id;
                        if (!isParentOrGuardian) return false;
                        const child = rel.toMember;
                        const childAge = calculateAgeFromDateString(child.dateOfBirth);
                        return childAge !== null && childAge < 18;
                      });
                      if (!editIsMinor && !editIsParentOfMinor) return null;
                      return (
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">
                            Communication Preference
                          </label>
                          <select
                            value={minorCommsMode}
                            onChange={(e) => setMinorCommsMode(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          >
                            <option value="both">Both Member & Parent</option>
                            <option value="parent_only">Parent Only</option>
                          </select>
                        </div>
                      );
                    })()}

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Emergency Contact Name
                      </label>
                      <input
                        value={emergencyContactNameState}
                        onChange={(e) =>
                          setEmergencyContactNameState(e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Emergency Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={emergencyContactPhoneState}
                        onChange={(e) =>
                          setEmergencyContactPhoneState(formatPhoneNumber(e.target.value))
                        }
                        placeholder="(123) 456-7890"
                        maxLength={14}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    {/* RELATIONSHIPS AND WAIVER SECTION - SIDE BY SIDE */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-gray-700">
                          Relationships
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingRelationship(true);
                            setRelationshipError(null);
                          }}
                          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          Add Relationship
                        </button>
                      </div>
                      <div className="space-y-2 text-sm">
                        {relationshipsLoading ? (
                          <p className="text-xs text-gray-500">
                            Loading relationships…
                          </p>
                        ) : relationships.length === 0 ? (
                          <p className="text-xs text-gray-400">
                            No relationships linked yet.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {relationships.map((rel) => (
                              <div
                                key={rel.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="text-xs text-gray-900">
                                  <RelationshipLabel
                                    rel={rel}
                                    currentMemberId={memberId}
                                  />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRelationship(rel.id)}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {addingRelationship && (
                          <div className="mt-2 rounded-md border border-gray-200 p-2 space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="block text-xs font-medium text-gray-700">
                                  Relationship Type
                                </label>
                                <select
                                  value={newRelationshipType}
                                  onChange={(e) =>
                                    setNewRelationshipType(e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                >
                                  {RELATIONSHIP_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-medium text-gray-700">
                                  Linked Member
                                </label>
                                <select
                                  value={newRelationshipMemberId}
                                  onChange={(e) =>
                                    setNewRelationshipMemberId(e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                >
                                  <option value="">Select member…</option>
                                  {availableMembersForRelationships.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.firstName} {m.lastName} (
                                      {m.status.toLowerCase()})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleAddRelationship}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingRelationship(false);
                                  setNewRelationshipType("PARENT");
                                  setNewRelationshipMemberId("");
                                  setRelationshipError(null);
                                }}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                            {relationshipError && (
                              <p className="text-xs text-primary">
                                {relationshipError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* WAIVER SECTION */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-gray-700">
                        Waiver
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={waiverSigned}
                            onChange={(e) =>
                              setWaiverSigned(e.target.checked)
                            }
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          Signed
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">
                            Date:
                          </label>
                          <input
                            type="date"
                            value={waiverSignedAt}
                            onChange={(e) => setWaiverSignedAt(e.target.value)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            style={{ width: '150px' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Medical Notes
                      </label>
                      <textarea
                        value={medicalNotes}
                        onChange={(e) => setMedicalNotes(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Lead Source
                      </label>
                      <select
                        value={leadSource}
                        onChange={(e) => setLeadSource(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      >
                        <option value="">— Not set —</option>
                        <option value="Website">Website</option>
                        <option value="Walk-in">Walk-in</option>
                        <option value="Referral">Referral</option>
                        <option value="Social Media">Social Media</option>
                        <option value="Event">Event</option>
                        <option value="Google">Google</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {leadSource === "Referral" && (
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">
                          Referred By
                        </label>
                        <select
                          value={referredByMemberId}
                          onChange={(e) => setReferredByMemberId(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        >
                          <option value="">— Select member —</option>
                          {allMembers
                            .filter((m) => m.id !== memberId)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.firstName} {m.lastName}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </form>
                )}
              </section>

              {/* MEMBERSHIPS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Memberships</h2>
                  <Link
                    href={`/pos?memberId=${member.id}&tab=membership`}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                  >
                    Add Membership
                  </Link>
                </div>

                {/* Tabs for Active/Inactive Memberships */}
                {member.memberships && member.memberships.length > 0 && (
                  <div className="flex gap-2 mb-3 border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setMembershipsTab("active")}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        membershipsTab === "active"
                          ? "border-primary text-primary"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Active ({member.memberships.filter(m => m.status === "ACTIVE" || m.status === "CANCELED").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMembershipsTab("inactive")}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        membershipsTab === "inactive"
                          ? "border-primary text-primary"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Inactive ({member.memberships.filter(m => m.status === "PAUSED" || m.status === "EXPIRED").length})
                    </button>
                  </div>
                )}

                {(!member.memberships || member.memberships.length === 0) ? (
                  <p className="text-sm text-gray-400">No memberships yet.</p>
                ) : (() => {
                  const filteredMemberships = member.memberships.filter(m =>
                    membershipsTab === "active"
                      ? m.status === "ACTIVE" || m.status === "CANCELED"
                      : m.status === "PAUSED" || m.status === "EXPIRED"
                  );

                  if (filteredMemberships.length === 0) {
                    return (
                      <p className="text-sm text-gray-400">
                        {membershipsTab === "active" ? "No active memberships." : "No inactive memberships."}
                      </p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                      {filteredMemberships.map((membership) => {
                        // Status badge colors (always status-based for the badge)
                        const statusBadgeConfig: Record<string, { bg: string; border: string; text: string }> = {
                          ACTIVE: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
                          PAUSED: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700" },
                          CANCELED: { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800" },
                          EXPIRED: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500" },
                        };
                        const badgeConfig = statusBadgeConfig[membership.status] || statusBadgeConfig.EXPIRED;

                        // Card tint colors - use plan color if available, otherwise fallback to gray
                        const planColor = membership.membershipPlan.color;
                        let cardStyle: React.CSSProperties = {};
                        let cardBorderClass = "border-gray-200";

                        if (planColor) {
                          // Convert hex to RGB for tint
                          const hexToRgb = (hex: string) => {
                            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                            return result ? {
                              r: parseInt(result[1], 16),
                              g: parseInt(result[2], 16),
                              b: parseInt(result[3], 16)
                            } : { r: 229, g: 231, b: 235 };
                          };
                          const rgb = hexToRgb(planColor);
                          // Create light tint for card background
                          const lightBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
                          const borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
                          cardStyle = {
                            background: `linear-gradient(135deg, ${lightBg} 0%, rgba(255,255,255,0.95) 100%)`,
                            borderColor: borderColor,
                          };
                        }

                        // Calculate days remaining or since end
                        let daysInfo = null;
                        if (membership.endDate) {
                          const endDate = new Date(membership.endDate);
                          const today = new Date();
                          const diffTime = endDate.getTime() - today.getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          if (membership.status === "ACTIVE" && diffDays > 0 && diffDays <= 30) {
                            daysInfo = { label: "Expires in", value: diffDays, urgent: diffDays <= 7 };
                          } else if (diffDays < 0) {
                            daysInfo = { label: "Ended", value: Math.abs(diffDays), urgent: false };
                          }
                        }

                        // Calculate price display
                        const planPrice = membership.membershipPlan.priceCents || 0;
                        const displayPrice = membership.customPriceCents !== null
                          ? membership.customPriceCents
                          : planPrice;

                        const isEditing = editingMembershipId === membership.id;

                        return (
                          <div
                            key={membership.id}
                            className={`border ${cardBorderClass} rounded-lg p-3 space-y-3 shadow-sm hover:shadow-md transition-shadow ${!planColor ? "bg-gradient-to-br from-gray-50 to-white" : ""}`}
                            style={planColor ? cardStyle : undefined}
                          >
                            {isEditing ? (
                              /* EDIT MODE */
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-semibold text-sm text-gray-900">Edit Membership</p>
                                  <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${badgeConfig.bg} ${badgeConfig.text} border ${badgeConfig.border}`}>
                                    {membership.status}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  <div className="space-y-1">
                                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                      Start Date
                                    </label>
                                    <input
                                      type="date"
                                      value={membershipEditForm.startDate}
                                      onChange={(e) => setMembershipEditForm({ ...membershipEditForm, startDate: e.target.value })}
                                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                      End Date
                                    </label>
                                    <input
                                      type="date"
                                      value={membershipEditForm.endDate}
                                      onChange={(e) => setMembershipEditForm({ ...membershipEditForm, endDate: e.target.value })}
                                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                      Custom Price
                                    </label>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                                      <input
                                        type="text"
                                        value={membershipEditForm.customPriceCents}
                                        onChange={(e) => setMembershipEditForm({ ...membershipEditForm, customPriceCents: e.target.value })}
                                        placeholder={(planPrice / 100).toFixed(2)}
                                        className="w-full rounded-md border border-gray-300 pl-5 pr-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 pt-2 border-t border-gray-100">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const updates: Record<string, unknown> = {};
                                        if (membershipEditForm.startDate) {
                                          updates.startDate = membershipEditForm.startDate;
                                        }
                                        if (membershipEditForm.endDate) {
                                          updates.endDate = membershipEditForm.endDate;
                                        }
                                        if (membershipEditForm.customPriceCents) {
                                          const cents = Math.round(parseFloat(membershipEditForm.customPriceCents) * 100);
                                          if (!isNaN(cents)) {
                                            updates.customPriceCents = cents;
                                          }
                                        }
                                        const res = await fetch(`/api/memberships/${membership.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(updates),
                                        });
                                        if (res.ok) {
                                          const data = await res.json();
                                          if (data.member) {
                                            setMember(data.member);
                                            hydrateFormFromMember(data.member);
                                          } else {
                                            fetchMember();
                                          }
                                          setEditingMembershipId(null);
                                        }
                                      } catch (err) {
                                        console.error("Error updating membership:", err);
                                      }
                                    }}
                                    className="flex-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingMembershipId(null)}
                                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* VIEW MODE */
                              <>
                                {/* Header with name and status */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm text-gray-900 truncate">
                                      {membership.membershipPlan.name}
                                    </p>
                                    {membership.membershipPlan.membershipId && (
                                      <p className="text-[10px] text-gray-500 font-medium">
                                        ID: {membership.membershipPlan.membershipId}
                                      </p>
                                    )}
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${badgeConfig.bg} ${badgeConfig.text} border ${badgeConfig.border}`}>
                                      {membership.status}
                                    </span>
                                    {membership.status === "CANCELED" && membership.endDate && (
                                      <p className="text-[9px] text-gray-500 mt-0.5">
                                        Expires: {new Date(membership.endDate).toLocaleDateString()}
                                      </p>
                                    )}
                                    {/* Billing status dot */}
                                    {(() => {
                                      const msInvoices = invoices.filter((i) => i.membershipId === membership.id);
                                      const hasPastDue = msInvoices.some((i) => i.status === "PAST_DUE");
                                      const hasPending = msInvoices.some((i) => i.status === "PENDING");
                                      if (hasPastDue) return <p className="text-[9px] text-red-600 font-semibold mt-0.5">Past Due</p>;
                                      if (hasPending) return <p className="text-[9px] text-yellow-600 font-semibold mt-0.5">Payment Pending</p>;
                                      return null;
                                    })()}
                                  </div>
                                </div>

                                {/* Price and Billing */}
                                <div className="flex items-baseline gap-1">
                                  <span className="text-lg font-bold text-gray-900">
                                    ${(displayPrice / 100).toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-gray-500 uppercase">
                                    /{membership.membershipPlan.billingCycle.toLowerCase().replace("ly", "")}
                                  </span>
                                  {membership.customPriceCents !== null && membership.customPriceCents !== planPrice && (
                                    <span className="text-[10px] text-gray-400 line-through ml-1">
                                      ${(planPrice / 100).toFixed(2)}
                                    </span>
                                  )}
                                  {membership.firstMonthDiscountOnly && (
                                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">
                                      1st mo.
                                    </span>
                                  )}
                                </div>

                                {/* Dates */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Start</span>
                                    <span className="text-xs font-medium text-gray-700">
                                      {new Date(membership.startDate).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">End</span>
                                    <span className="text-xs font-medium text-gray-700">
                                      {membership.endDate ? new Date(membership.endDate).toLocaleDateString() : "Recurring"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next Payment</span>
                                    <span className="text-xs font-medium text-gray-700">
                                      {membership.nextPaymentDate ? new Date(membership.nextPaymentDate).toLocaleDateString() : "—"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Payment</span>
                                    <span className="text-xs font-medium text-gray-700">
                                      {membership.lastPaymentDate ? new Date(membership.lastPaymentDate).toLocaleDateString() : "—"}
                                    </span>
                                  </div>
                                  {daysInfo && (
                                    <div className={`text-[10px] font-medium ${daysInfo.urgent ? 'text-red-600' : 'text-gray-500'}`}>
                                      {daysInfo.label} {daysInfo.value} day{daysInfo.value !== 1 ? 's' : ''} {daysInfo.label === "Ended" ? "ago" : ""}
                                    </div>
                                  )}
                                </div>

                                {/* Action Buttons - Row 1: Change, Edit, Pause/Activate */}
                                <div className="flex items-center justify-start gap-1 pt-2 border-t border-gray-100">
                                  {/* Change button - for ACTIVE and PAUSED memberships */}
                                  {(membership.status === "ACTIVE" || membership.status === "PAUSED") && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        setChangePlanModalMembershipId(membership.id);
                                        setChangePlanSelectedPlanId("");
                                        setChangePlanPriceDollars("0.00");
                                        setChangePlanRecurringDollars("0.00");
                                        setChangePlanShowConfirm(false);
                                        // Fetch all plans except current
                                        try {
                                          const res = await fetch("/api/membership-plans");
                                          if (res.ok) {
                                            const data = await res.json();
                                            const plans = data.membershipPlans
                                              .filter((p: { id: string }) => p.id !== membership.membershipPlanId)
                                              .map((p: { id: string; name: string; priceCents: number | null; billingCycle: string }) => ({
                                                id: p.id,
                                                name: p.name,
                                                priceCents: p.priceCents,
                                                billingCycle: p.billingCycle,
                                              }));
                                            setAvailablePlans(plans);
                                          }
                                        } catch (err) {
                                          console.error("Error fetching plans:", err);
                                        }
                                      }}
                                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primaryDark min-w-[52px]"
                                    >
                                      Change
                                    </button>
                                  )}

                                  {/* Edit button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMembershipId(membership.id);
                                      setMembershipEditForm({
                                        startDate: membership.startDate.split("T")[0],
                                        endDate: membership.endDate ? membership.endDate.split("T")[0] : "",
                                        customPriceCents: membership.customPriceCents !== null
                                          ? (membership.customPriceCents / 100).toFixed(2)
                                          : "",
                                      });
                                    }}
                                    className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primaryDark"
                                  >
                                    Edit
                                  </button>

                                  {/* Pause button - for ACTIVE memberships */}
                                  {membership.status === "ACTIVE" && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPauseModalMembershipId(membership.id);
                                        setPauseDuration(1);
                                        setPauseUnit("week");
                                      }}
                                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primaryDark min-w-[52px]"
                                    >
                                      Pause
                                    </button>
                                  )}

                                  {/* Activate button - for PAUSED memberships */}
                                  {membership.status === "PAUSED" && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/api/memberships/${membership.id}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ status: "ACTIVE" }),
                                          });
                                          if (res.ok) {
                                            const data = await res.json();
                                            if (data.member) {
                                              setMember(data.member);
                                              hydrateFormFromMember(data.member);
                                            } else {
                                              fetchMember();
                                            }
                                            setMembershipsTab("active");
                                          }
                                        } catch (err) {
                                          console.error("Error activating membership:", err);
                                        }
                                      }}
                                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primaryDark"
                                    >
                                      Activate
                                    </button>
                                  )}

                                  {/* Activate button - for CANCELED and EXPIRED memberships */}
                                  {(membership.status === "CANCELED" || membership.status === "EXPIRED") && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!confirm("Activate this membership?")) return;
                                        try {
                                          const res = await fetch(`/api/memberships/${membership.id}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ status: "ACTIVE" }),
                                          });
                                          if (res.ok) {
                                            const data = await res.json();
                                            if (data.member) {
                                              setMember(data.member);
                                              hydrateFormFromMember(data.member);
                                            } else {
                                              fetchMember();
                                            }
                                            setMembershipsTab("active");
                                          }
                                        } catch (err) {
                                          console.error("Error activating membership:", err);
                                        }
                                      }}
                                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primaryDark"
                                    >
                                      Activate
                                    </button>
                                  )}
                                </div>

                                {/* Action Buttons - Row 2: Cancel, Delete */}
                                <div className="flex items-center justify-start gap-1">
                                  {/* Cancel button - for ACTIVE and PAUSED memberships */}
                                  {(membership.status === "ACTIVE" || membership.status === "PAUSED") && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCancelModalMembershipId(membership.id);
                                        const defaultDate = membership.nextPaymentDate
                                          ? new Date(membership.nextPaymentDate).toISOString().split("T")[0]
                                          : getTodayString();
                                        setCancelEffectiveDate(defaultDate);
                                      }}
                                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                                    >
                                      Cancel
                                    </button>
                                  )}

                                  {/* Delete button */}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Delete this membership permanently? This cannot be undone.`)) return;
                                      try {
                                        const res = await fetch(`/api/memberships/${membership.id}`, {
                                          method: "DELETE",
                                        });
                                        if (res.ok) {
                                          const data = await res.json();
                                          if (data.member) {
                                            setMember(data.member);
                                            hydrateFormFromMember(data.member);
                                          } else {
                                            fetchMember();
                                          }
                                        }
                                      } catch (err) {
                                        console.error("Error deleting membership:", err);
                                      }
                                    }}
                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              {/* STYLES - Aligned with memberships above */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Styles</h2>
                  <button
                    type="button"
                    onClick={() => {
                      addStyle();
                      setEditingStyleIndex(styles.length);
                      setStylesTab("active");
                    }}
                    className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
                  >
                    Add Style
                  </button>
                </div>

                {/* Tabs for Active/Inactive Styles */}
                {styles.length > 0 && (
                  <div className="flex gap-2 mb-3 border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setStylesTab("active")}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        stylesTab === "active"
                          ? "border-primary text-primary"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Active ({styles.filter(s => s.active !== false).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStylesTab("inactive")}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        stylesTab === "inactive"
                          ? "border-primary text-primary"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Inactive ({styles.filter(s => s.active === false).length})
                    </button>
                  </div>
                )}

                {styles.length === 0 ? (
                  <p className="text-sm text-gray-400">No styles added yet.</p>
                ) : (() => {
                  // Filter styles based on stylesTab
                  const filteredStyles = styles
                    .map((s, i) => ({ style: s, originalIndex: i }))
                    .filter(({ style }) =>
                      stylesTab === "active"
                        ? style.active !== false
                        : style.active === false
                    );

                  if (filteredStyles.length === 0) {
                    return (
                      <p className="text-sm text-gray-400">
                        {stylesTab === "active" ? "No active styles." : "No inactive styles."}
                      </p>
                    );
                  }

                  return (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                      {filteredStyles.map(({ style: s, originalIndex: i }) => {

                        // Helper to check if attendance matches this style (respects reset date)
                        const matchesStyle = (att: any) => {
                          const cs = att.classSession;
                          if (!cs) return false;

                          // Filter out attendance before the reset date
                          if (s.attendanceResetDate) {
                            const attDateStr = (att.attendanceDate || att.checkedInAt || "").split("T")[0];
                            const resetDateStr = s.attendanceResetDate.split("T")[0];
                            if (attDateStr && resetDateStr && attDateStr < resetDateStr) {
                              return false;
                            }
                          }

                          // Check explicit style name match
                          if (cs.styleName?.toLowerCase() === s.name.toLowerCase()) return true;
                          if (cs.styleNames) {
                            try {
                              const names = JSON.parse(cs.styleNames);
                              if (Array.isArray(names) && names.some((n: string) => n.toLowerCase() === s.name.toLowerCase())) return true;
                            } catch { /* ignore */ }
                          }

                          // Fallback: if class has no explicit style, check if classType matches the style name
                          if (!cs.styleName && !cs.styleNames) {
                            if (cs.classType?.toLowerCase() === s.name.toLowerCase()) return true;
                            if (cs.classTypes) {
                              try {
                                const types: string[] = JSON.parse(cs.classTypes);
                                if (types.some((t: string) => t.toLowerCase() === s.name.toLowerCase())) return true;
                              } catch { /* ignore */ }
                            }
                          }
                          return false;
                        };

                        // Get class requirements from beltConfig (case-insensitive matching)
                        const selectedStyle = availableStyles.find((style) => style.name.toLowerCase() === s.name.toLowerCase());
                        let classRequirements: Array<{ label: string; minCount: number | null }> = [];
                        if (selectedStyle?.beltConfig && s.rank) {
                          try {
                            const beltConfig = JSON.parse(selectedStyle.beltConfig);
                            const rankData = beltConfig.ranks?.find((r: any) => r.name.toLowerCase() === (s.rank?.toLowerCase() || ""));
                            if (rankData?.classRequirements) {
                              classRequirements = rankData.classRequirements.filter(
                                (req: any) => req.label && req.minCount != null && req.minCount > 0
                              );
                            }
                          } catch { /* ignore */ }
                        }

                        const beltLayers = getBeltLayersForRank(selectedStyle?.beltConfig, s.rank);

                        return (
                          <div
                            key={i}
                            className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gradient-to-br from-gray-50 to-white shadow-sm text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-gray-900">{s.name || "Unnamed Style"}</span>
                              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${s.active !== false ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-500 border border-gray-200"}`}>
                                {s.active !== false ? "Active" : "Inactive"}
                              </span>
                            </div>
                            {beltLayers && <BeltImage layers={beltLayers} />}
                            {s.rank && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rank</span>
                                <span className="text-xs font-medium text-gray-700">{s.rank}</span>
                              </div>
                            )}
                            {s.startDate && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Started</span>
                                <span className="text-xs font-medium text-gray-700">{new Date(s.startDate).toLocaleDateString()}</span>
                              </div>
                            )}
                            {/* Progress bars for class requirements */}
                            {classRequirements.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Progress</span>
                                {classRequirements.map((req, idx) => {
                                  const attended = (member?.attendances || []).filter(
                                    (att) => {
                                      let typesMatch = false;
                                      if (att.classSession?.classTypes) {
                                        try {
                                          const types: string[] = JSON.parse(att.classSession.classTypes);
                                          typesMatch = types.some(t => t.toLowerCase() === req.label.toLowerCase());
                                        } catch { /* ignore */ }
                                      }
                                      if (!typesMatch) {
                                        typesMatch = att.classSession?.classType?.toLowerCase() === req.label.toLowerCase();
                                      }
                                      // Class has no explicit style: count for any matching type (not restricted to a style)
                                      const classHasNoStyle = !att.classSession?.styleName && !att.classSession?.styleNames;
                                      return typesMatch && (matchesStyle(att) || att.source === "IMPORTED" || classHasNoStyle);
                                    }
                                  ).length;
                                  const progress = req.minCount ? Math.min(100, (attended / req.minCount) * 100) : 0;
                                  const isComplete = req.minCount ? attended >= req.minCount : false;
                                  return (
                                    <div key={idx} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-600">{req.label}</span>
                                        <span className={`font-bold ${isComplete ? 'text-green-600' : 'text-gray-800'}`}>{attended}/{req.minCount}</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
                                          style={{ width: `${progress}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {/* Fallback: single requirement from Rank model */}
                            {classRequirements.length === 0 && s.rank && (() => {
                              const selectedRank = selectedStyle?.ranks?.find((r) => r.name.toLowerCase() === (s.rank?.toLowerCase() || ""));
                              if (selectedRank?.classRequirement != null) {
                                const styleAttendance = (member?.attendances || []).filter(
                                  (att) => {
                                    const classHasNoStyle = !att.classSession?.styleName && !att.classSession?.styleNames;
                                    return matchesStyle(att) || att.source === "IMPORTED" || classHasNoStyle;
                                  }
                                );
                                const progress = Math.min(100, (styleAttendance.length / selectedRank.classRequirement) * 100);
                                const isComplete = styleAttendance.length >= selectedRank.classRequirement;
                                return (
                                  <div className="space-y-1.5 pt-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Progress</span>
                                    <div className="space-y-0.5">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-gray-600">Classes</span>
                                        <span className={`font-bold ${isComplete ? 'text-green-600' : 'text-gray-800'}`}>{styleAttendance.length}/{selectedRank.classRequirement}</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
                                          style={{ width: `${progress}%` }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <div className="flex gap-1 pt-1 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={() => setEditingStyleIndex(i)}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => removeStyle(i)}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              {/* STYLE EDIT MODAL */}
              {editingStyleIndex !== null && editingStyleIndex < styles.length && (() => {
                const i = editingStyleIndex;
                const s = styles[i];
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Edit Style</h3>
                        <button
                          type="button"
                          onClick={() => setEditingStyleIndex(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Style</label>
                          <select
                            value={s.name}
                            onChange={(e) => updateStyle(i, "name", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          >
                            <option value="">Select Style</option>
                            {availableStyles.map((st) => (
                              <option key={st.id} value={st.name}>{st.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Rank Level</label>
                          <select
                            value={s.rank || ""}
                            onChange={(e) => updateStyle(i, "rank", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          >
                            <option value="">Select Rank</option>
                            {(() => {
                              const selectedStyle = availableStyles.find((st) => st.name === s.name);
                              if (!selectedStyle || !selectedStyle.ranks) return null;
                              return selectedStyle.ranks.sort((a, b) => a.order - b.order).map((rank) => (
                                <option key={rank.id} value={rank.name}>{rank.name}</option>
                              ));
                            })()}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Training Start Date</label>
                          <input
                            type="date"
                            value={s.startDate || ""}
                            onChange={(e) => updateStyle(i, "startDate", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Last Promotion Date</label>
                          <input
                            type="date"
                            value={s.lastPromotionDate || ""}
                            onChange={(e) => updateStyle(i, "lastPromotionDate", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Belt Size</label>
                          <input
                            value={s.beltSize || ""}
                            onChange={(e) => updateStyle(i, "beltSize", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            placeholder="e.g. A2"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">Uniform Size</label>
                          <input
                            value={s.uniformSize || ""}
                            onChange={(e) => updateStyle(i, "uniformSize", e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            placeholder="e.g. Medium"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`style-active-${i}`}
                            checked={s.active !== false}
                            onChange={(e) => updateStyle(i, "active", e.target.checked)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <label htmlFor={`style-active-${i}`} className="text-xs font-medium text-gray-700">
                            Style is active
                          </label>
                        </div>
                        <div className="flex gap-2 pt-3 border-t">
                          <button
                            type="button"
                            onClick={() => saveSection("style")}
                            disabled={savingSection === "style"}
                            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                          >
                            {savingSection === "style" ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              removeStyle(i);
                              setEditingStyleIndex(null);
                            }}
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            Remove Style
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ATTENDANCE SECTION */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Attendance</h2>
                  <span className="text-xs text-gray-500">
                    {(member?.attendances || []).length} total classes
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Column 1 - Add Single Attendance */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-600">Add Single Class</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Date</label>
                        <input
                          type="date"
                          value={bulkAttendanceDate}
                          onChange={(e) => setBulkAttendanceDate(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                      </div>
                      {availableClassTypes.length > 0 && (
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Filter by Type</label>
                          <select
                            value={filterByClassType}
                            onChange={(e) => {
                              setFilterByClassType(e.target.value);
                              setSelectedClassForAttendance("");
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                          >
                            <option value="">All Types</option>
                            {availableClassTypes.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Class</label>
                        <select
                          value={selectedClassForAttendance}
                          onChange={(e) => setSelectedClassForAttendance(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        >
                          <option value="">Select a class...</option>
                          {recentClasses
                            .filter((cls) => !filterByClassType || cls.classType === filterByClassType)
                            .map((cls) => {
                              const classDate = new Date(cls.startsAt);
                              const dateStr = classDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                              let styleLabel = '';
                              if (cls.styleNames) {
                                try {
                                  const arr = JSON.parse(cls.styleNames);
                                  styleLabel = arr.join(', ');
                                } catch {
                                  styleLabel = cls.styleName || '';
                                }
                              } else if (cls.styleName) {
                                styleLabel = cls.styleName;
                              }
                              return (
                                <option key={cls.id} value={cls.id}>
                                  {cls.name} - {dateStr}{styleLabel ? ` (${styleLabel})` : ''}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                      <button
                        onClick={async () => {
                          if (!selectedClassForAttendance || !member?.id) return;
                          setAddingAttendance(true);
                          try {
                            const res = await fetch("/api/attendance", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                memberId: member.id,
                                classSessionId: selectedClassForAttendance,
                                checkedInAt: new Date(bulkAttendanceDate + "T12:00:00").toISOString(),
                                confirmed: true,
                              }),
                            });
                            if (res.ok) {
                              // Get class name for activity message
                              const selectedClass = recentClasses.find(c => c.id === selectedClassForAttendance);
                              const className = selectedClass?.name || "class";
                              addActivity(`Checked into ${className}`, "ATTENDANCE");
                              fetchMember();
                              setSelectedClassForAttendance("");
                            }
                          } catch (err) {
                            console.error("Error adding attendance:", err);
                          } finally {
                            setAddingAttendance(false);
                          }
                        }}
                        disabled={addingAttendance || !selectedClassForAttendance}
                        className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingAttendance ? "Adding..." : "Add"}
                      </button>
                    </div>
                  </div>

                  {/* Column 2 - Bulk Import */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-600">Bulk Import</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Class Type</label>
                        <select
                          value={bulkImportClassType}
                          onChange={(e) => setBulkImportClassType(e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        >
                          <option value="">Select class type...</option>
                          {availableClassTypes.filter((ct) => ct !== "Imported").map((classType) => (
                            <option key={classType} value={classType}>
                              {classType}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Number of Classes</label>
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={bulkImportCount || ""}
                          onChange={(e) => setBulkImportCount(parseInt(e.target.value) || 0)}
                          placeholder="e.g. 10"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Can create bulk attendance records for members.
                      </p>
                      <button
                        onClick={async () => {
                          if (!bulkImportClassType || !bulkImportCount || bulkImportCount < 1 || !member?.id) return;
                          setBulkImporting(true);
                          try {
                            const res = await fetch("/api/attendance/bulk-import", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                memberId: member.id,
                                classType: bulkImportClassType,
                                count: bulkImportCount,
                              }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              fetchMember();
                              setBulkImportClassType("");
                              setBulkImportCount(0);
                              alert(`Successfully added ${data.created} ${bulkImportClassType} class${data.created !== 1 ? 'es' : ''}`);
                            } else {
                              const errData = await res.json();
                              alert(errData.error || "Failed to import attendance");
                            }
                          } catch (err) {
                            console.error("Error bulk importing attendance:", err);
                            alert("Failed to import attendance");
                          } finally {
                            setBulkImporting(false);
                          }
                        }}
                        disabled={bulkImporting || !bulkImportClassType || !bulkImportCount || bulkImportCount < 1}
                        className="w-full rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {bulkImporting ? "Importing..." : `Import ${bulkImportCount || 0} Classes`}
                      </button>
                    </div>

                    {/* Show imported classes summary */}
                    {(() => {
                      const importedAttendances = (member?.attendances || []).filter(
                        (att) => att.source === "IMPORTED"
                      );
                      if (importedAttendances.length === 0) return null;

                      // Group by class type
                      const byClassType: Record<string, number> = {};
                      importedAttendances.forEach((att) => {
                        const classType = att.classSession?.classType || "Unknown";
                        byClassType[classType] = (byClassType[classType] || 0) + 1;
                      });

                      return (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <h4 className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Imported Classes</h4>
                          <div className="space-y-1.5">
                            {Object.entries(byClassType).map(([classType, count]) => (
                              <div
                                key={classType}
                                className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-100"
                              >
                                <div>
                                  <span className="text-xs font-medium text-gray-700">{classType}</span>
                                  <span className="text-xs text-gray-500 ml-1">({count} classes)</span>
                                </div>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Delete all ${count} imported ${classType} classes?`)) return;
                                    try {
                                      const res = await fetch(
                                        `/api/attendance/bulk-delete?memberId=${member?.id}&classType=${encodeURIComponent(classType)}`,
                                        { method: "DELETE" }
                                      );
                                      if (res.ok) {
                                        fetchMember();
                                      } else {
                                        alert("Failed to delete imported classes");
                                      }
                                    } catch (err) {
                                      console.error("Error deleting imported classes:", err);
                                      alert("Failed to delete imported classes");
                                    }
                                  }}
                                  className="text-[10px] text-primary hover:text-primaryDark font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Column 3 - Recent Attendances */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-600">Recent Classes</h3>
                    {(() => {
                      // Filter out imported attendance - they are shown separately
                      const attendances = (member?.attendances || []).filter(
                        (att) => att.source !== "IMPORTED"
                      );
                      if (attendances.length === 0) {
                        return (
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                            <p className="text-[10px] text-gray-400">No attendance records yet.</p>
                          </div>
                        );
                      }

                      // Sort and take last 5
                      const last5 = [...attendances]
                        .sort((a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime())
                        .slice(0, 5);

                      return (
                        <div className="space-y-1">
                          {last5.map((att) => {
                            const date = new Date(att.checkedInAt);
                            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                            const dayNum = date.getDate();
                            const monthName = date.toLocaleDateString('en-US', { month: 'short' });

                            let styleDisplay = '';
                            if (att.classSession?.styleNames) {
                              try {
                                const styleNamesArr = JSON.parse(att.classSession.styleNames);
                                styleDisplay = styleNamesArr.join(', ');
                              } catch {
                                styleDisplay = att.classSession.styleName || '';
                              }
                            } else if (att.classSession?.styleName) {
                              styleDisplay = att.classSession.styleName;
                            }

                            return (
                              <div
                                key={att.id}
                                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
                              >
                                <div className="flex-shrink-0 w-10 text-center">
                                  <div className="text-[10px] text-gray-400 uppercase">{dayName}</div>
                                  <div className="text-xs font-semibold text-gray-700">{monthName} {dayNum}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-800 truncate">
                                    {att.classSession?.name || 'Unknown Class'}
                                  </p>
                                  {styleDisplay && (
                                    <p className="text-[10px] text-gray-500 truncate">{styleDisplay}</p>
                                  )}
                                </div>
                                <button
                                  onClick={async () => {
                                    if (!window.confirm("Remove this attendance record?")) return;
                                    try {
                                      const res = await fetch(`/api/attendance?id=${att.id}`, { method: "DELETE" });
                                      if (res.ok) fetchMember();
                                    } catch (e) {
                                      console.error("Failed to delete attendance:", e);
                                    }
                                  }}
                                  className="flex-shrink-0 text-gray-400 hover:text-primary text-xs"
                                  title="Remove attendance"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </section>

              {/* CURRICULUM */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Curriculum</h2>
                  {loadingCurriculum && (
                    <span className="text-xs text-gray-400">Loading...</span>
                  )}
                </div>

                {!loadingCurriculum && Object.keys(memberCurricula).length === 0 ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <p className="text-xs text-gray-400">
                      No curriculum available for this member&apos;s current rank(s).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(memberCurricula).map(([styleName, rankTests]) => {
                      const isStyleExpanded = expandedCurriculumStyles.has(styleName);
                      return (
                        <div key={styleName} className="border rounded-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedCurriculumStyles(prev => {
                                const next = new Set(prev);
                                if (next.has(styleName)) next.delete(styleName);
                                else next.add(styleName);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-t-lg"
                          >
                            <span className="text-sm font-medium">{styleName}</span>
                            <span className="text-xs text-gray-500">
                              {isStyleExpanded ? "Collapse" : "Expand"} ({rankTests.length} test{rankTests.length !== 1 ? "s" : ""})
                            </span>
                          </button>

                          {isStyleExpanded && (
                            <div className="border-t p-3 space-y-3">
                              {rankTests.map((rankTest) => {
                                const isRankExpanded = expandedCurriculumRanks.has(rankTest.id);
                                const totalItems = rankTest.categories.reduce(
                                  (sum, cat) => sum + cat.items.length, 0
                                );
                                return (
                                  <div key={rankTest.id} className="border rounded-md">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExpandedCurriculumRanks(prev => {
                                          const next = new Set(prev);
                                          if (next.has(rankTest.id)) next.delete(rankTest.id);
                                          else next.add(rankTest.id);
                                          return next;
                                        });
                                      }}
                                      className="w-full flex items-center justify-between p-2 hover:bg-gray-50"
                                    >
                                      <span className="text-xs font-medium">{rankTest.name}</span>
                                      <span className="text-[10px] text-gray-400">
                                        {totalItems} item{totalItems !== 1 ? "s" : ""}
                                      </span>
                                    </button>

                                    {isRankExpanded && (
                                      <div className="border-t p-2 space-y-2">
                                        {rankTest.categories.map((category) => (
                                          <div key={category.id}>
                                            <h5 className="text-xs font-semibold text-gray-700 mb-1">
                                              {category.name}
                                            </h5>
                                            <ul className="space-y-1">
                                              {category.items.map((item) => (
                                                <li key={item.id} className="text-xs flex items-start gap-2 text-gray-600">
                                                  <span className="text-gray-300 flex-shrink-0 mt-0.5">&#8226;</span>
                                                  <div className="flex-1 min-w-0">
                                                    <span className="font-medium">{item.name}</span>
                                                    {!item.required && (
                                                      <span className="ml-1 text-gray-400">(optional)</span>
                                                    )}
                                                    {item.description && (
                                                      <p className="text-[10px] text-gray-500 mt-0.5"
                                                         dangerouslySetInnerHTML={{ __html: item.description }} />
                                                    )}
                                                    {(item.reps || item.sets || item.duration || item.distance || item.timeLimit) && (
                                                      <span className="text-[10px] text-gray-400">
                                                        {" "}({item.sets && `${item.sets} sets`}
                                                        {item.sets && item.reps && " x "}
                                                        {item.reps && `${item.reps} reps`}
                                                        {item.duration && ` ${item.duration}`}
                                                        {item.distance && ` ${item.distance}`}
                                                        {item.timeLimit && ` ${item.timeLimitOperator === "lte" ? "\u2264" : item.timeLimitOperator === "lt" ? "<" : item.timeLimitOperator === "gte" ? "\u2265" : item.timeLimitOperator === "gt" ? ">" : "="} ${item.timeLimit}`})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-1 flex-shrink-0">
                                                    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                                                      item.type === "skill" ? "bg-blue-100 text-blue-800" :
                                                      item.type === "form" ? "bg-purple-100 text-purple-800" :
                                                      item.type === "workout" ? "bg-orange-100 text-orange-800" :
                                                      item.type === "sparring" ? "bg-red-100 text-red-800" :
                                                      item.type === "self_defense" ? "bg-green-100 text-green-800" :
                                                      item.type === "breaking" ? "bg-yellow-100 text-yellow-800" :
                                                      item.type === "knowledge" ? "bg-indigo-100 text-indigo-800" :
                                                      "bg-gray-100 text-gray-800"
                                                    }`}>
                                                      {item.type === "skill" ? "Skill" :
                                                       item.type === "form" ? "Form" :
                                                       item.type === "workout" ? "Workout" :
                                                       item.type === "sparring" ? "Sparring" :
                                                       item.type === "self_defense" ? "Self-Defense" :
                                                       item.type === "breaking" ? "Breaking" :
                                                       item.type === "knowledge" ? "Knowledge" : "Other"}
                                                    </span>
                                                    {item.videoUrl && (
                                                      <a href={item.videoUrl} target="_blank" rel="noopener noreferrer"
                                                         className="text-primary hover:text-primaryDark text-[10px]">
                                                        Video
                                                      </a>
                                                    )}
                                                  </div>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* MEMBER DOCUMENTS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Member Documents</h2>
                  <label className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark cursor-pointer">
                    {uploadingDocument ? "Uploading..." : "Upload PDF"}
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleDocumentUpload}
                      disabled={uploadingDocument}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-2 text-sm">
                  {styleDocuments.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <p className="text-xs text-gray-400">
                        No documents uploaded yet. Click "Upload PDF" to add documents.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {styleDocuments.map((doc) => (
                        <div key={doc.id} className="relative group">
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                // Check if it's a regular URL (file path) vs base64 data URL
                                if (doc.url.startsWith('/') || doc.url.startsWith('http')) {
                                  // Regular file URL - open directly
                                  window.open(doc.url, '_blank', 'noopener,noreferrer');
                                } else {
                                  // Base64 data URL - convert to blob
                                  const byteString = atob(doc.url.split(',')[1]);
                                  const mimeString = doc.url.split(',')[0].split(':')[1].split(';')[0];
                                  const ab = new ArrayBuffer(byteString.length);
                                  const ia = new Uint8Array(ab);
                                  for (let j = 0; j < byteString.length; j++) {
                                    ia[j] = byteString.charCodeAt(j);
                                  }
                                  const blob = new Blob([ab], { type: mimeString });
                                  const blobUrl = URL.createObjectURL(blob);
                                  window.open(blobUrl, '_blank', 'noopener,noreferrer');
                                }
                              } catch (e) {
                                console.error("Failed to open document:", e);
                              }
                            }}
                            className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-gray-100 transition-colors"
                            title={doc.name}
                          >
                            {doc.thumbnail ? (
                              <img
                                src={doc.thumbnail}
                                alt="PDF"
                                className="w-10 h-10"
                              />
                            ) : (
                              <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                            <span className="text-[10px] font-medium text-gray-600 max-w-[80px] truncate">{doc.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDocument(doc.id)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            title="Remove document"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

            </div>

            {/* RIGHT: Payments + Activity */}
            <div className="flex flex-col gap-4">
              {/* PAYMENTS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Payments / POS</h2>
                  {!editingPayments ? (
                    <button
                      type="button"
                      onClick={() => setEditingPayments(true)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        form="payments-form"
                        disabled={savingSection === "payments"}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "payments" ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelSection("payments")}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Saved Cards (Stripe) */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Saved Cards</h3>

                  {cardSetupSuccess && (
                    <div className="mb-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                      Card added successfully.
                    </div>
                  )}

                  {paymentMethods.length === 0 ? (
                    <p className="text-xs text-gray-400 mb-2">No saved cards on file.</p>
                  ) : (
                    <div className="space-y-2 mb-2">
                      {paymentMethods.map((pm) => (
                        <div key={pm.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 16" stroke="currentColor" strokeWidth={1.5}>
                              <rect x="1" y="1" width="22" height="14" rx="2" />
                              <line x1="1" y1="6" x2="23" y2="6" />
                            </svg>
                            <div>
                              <span className="text-xs font-medium text-gray-900">
                                {pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} ····{pm.last4}
                              </span>
                              <span className="text-[10px] text-gray-400 ml-2">
                                Exp {pm.expMonth}/{pm.expYear}
                              </span>
                              {defaultPaymentId === pm.id && (
                                <span className="ml-2 text-[10px] font-semibold text-primary">Default</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {defaultPaymentId !== pm.id && (
                              <button
                                type="button"
                                onClick={() => handleSetDefaultCard(pm.id)}
                                disabled={settingDefaultCardId === pm.id}
                                className="text-[10px] text-gray-500 hover:text-primary px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                              >
                                {settingDefaultCardId === pm.id ? "..." : "Set default"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveCard(pm.id)}
                              disabled={removingCardId === pm.id}
                              className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors disabled:opacity-50"
                            >
                              {removingCardId === pm.id ? (
                                <span className="w-3.5 h-3.5 block border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAddCard}
                    disabled={addingCard}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {addingCard ? (
                      <>
                        <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      <>Add Card</>
                    )}
                  </button>
                </div>

                <hr className="border-gray-200 mb-3" />

                {/* Payment Notes */}
                {!editingPayments ? (
                  <>
                    <h3 className="text-xs font-semibold text-gray-700 mb-1">Payment Notes</h3>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-900 whitespace-pre-wrap">
                        {member.paymentNotes || (
                          <span className="text-gray-400 text-xs">
                            No payment notes.
                          </span>
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <form
                    id="payments-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("payments");
                    }}
                    className="space-y-2 text-sm"
                  >
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Payment / POS Notes
                      </label>
                    </div>
                    <textarea
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      rows={5}
                      placeholder={
                        'Examples:\n- "Visa ending 1234, saved in Square; default for tuition."\n- "Cash only; pays first week of each month."\n- "Promo: HEROES-CUP-2026 (50% off Jan) applied."'
                      }
                    />
                    <p className="mt-1 text-[10px] text-gray-500">
                      For security, never store full card numbers or CVV here.
                    </p>
                  </form>
                )}
              </section>

              {/* APPOINTMENT CREDITS */}
              {serviceCredits.length > 0 && (
                <section className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Appointment Credits</h2>
                    <Link
                      href={`/pos?memberId=${memberId}&tab=services`}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Purchase More
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {serviceCredits.map((credit) => {
                      const isActive = credit.status === "ACTIVE";
                      const isExhausted = credit.status === "EXHAUSTED";
                      return (
                        <div
                          key={credit.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            isActive
                              ? "border-green-200 bg-green-50"
                              : isExhausted
                                ? "border-gray-200 bg-gray-50"
                                : "border-red-200 bg-red-50"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium">{credit.servicePackage.name}</p>
                            {credit.servicePackage.appointment && (
                              <p className="text-xs text-gray-500">{credit.servicePackage.appointment.title}</p>
                            )}
                            {credit.expiresAt && (
                              <p className="text-xs text-gray-400">
                                Expires: {new Date(credit.expiresAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {isActive && credit.creditsRemaining > 0 && (
                              <button
                                onClick={() => openCreditBooking(credit)}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Schedule
                              </button>
                            )}
                            <div className="text-right">
                              <p className={`text-sm font-semibold ${isActive ? "text-green-700" : "text-gray-500"}`}>
                                {credit.creditsRemaining}/{credit.creditsTotal}
                              </p>
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isActive
                                    ? "bg-green-100 text-green-700"
                                    : isExhausted
                                      ? "bg-gray-100 text-gray-500"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                {credit.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* BILLING HISTORY */}
              {invoices.length > 0 && (
                <section className="rounded-lg border border-gray-200 bg-white p-4">
                  <h2 className="text-sm font-semibold mb-3">Billing History</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500">
                          <th className="pb-2 pr-3 font-medium">Invoice</th>
                          <th className="pb-2 pr-3 font-medium">Plan</th>
                          <th className="pb-2 pr-3 font-medium">Period</th>
                          <th className="pb-2 pr-3 font-medium">Amount</th>
                          <th className="pb-2 pr-3 font-medium">Status</th>
                          <th className="pb-2 pr-3 font-medium">Due</th>
                          <th className="pb-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="py-2 pr-3 text-gray-700 font-mono">{inv.invoiceNumber || "—"}</td>
                            <td className="py-2 pr-3 text-gray-700">{inv.membership.membershipPlan.name}</td>
                            <td className="py-2 pr-3 text-gray-500">
                              {new Date(inv.billingPeriodStart).toLocaleDateString()} – {new Date(inv.billingPeriodEnd).toLocaleDateString()}
                            </td>
                            <td className="py-2 pr-3 font-semibold text-gray-900">${(inv.amountCents / 100).toFixed(2)}</td>
                            <td className="py-2 pr-3">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                inv.status === "PAID" ? "bg-green-100 text-green-700" :
                                inv.status === "PAST_DUE" ? "bg-red-100 text-red-700" :
                                inv.status === "PENDING" ? "bg-yellow-100 text-yellow-700" :
                                inv.status === "VOID" ? "bg-gray-100 text-gray-500" :
                                "bg-orange-100 text-orange-700"
                              }`}>
                                {inv.status === "PAST_DUE" ? "Past Due" : inv.status}
                              </span>
                            </td>
                            <td className="py-2 pr-3 text-gray-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                            <td className="py-2">
                              {(inv.status === "PENDING" || inv.status === "PAST_DUE") && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await fetch(`/api/invoices/${inv.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ status: "PAID", paymentMethod: "CASH" }),
                                        });
                                        fetchMember();
                                      } catch { /* ignore */ }
                                    }}
                                    className="rounded bg-green-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-green-700"
                                  >
                                    Mark Paid
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await fetch(`/api/invoices/${inv.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ status: "VOID" }),
                                        });
                                        fetchMember();
                                      } catch { /* ignore */ }
                                    }}
                                    className="rounded border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-100"
                                  >
                                    Void
                                  </button>
                                </div>
                              )}
                              {inv.status === "PAID" && inv.paidAt && (
                                <span className="text-[10px] text-gray-400">
                                  {new Date(inv.paidAt).toLocaleDateString()}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ACTIVITY (flex-1 so it stretches) */}
              <section className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold">Activity</h2>
                  {activity.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllActivityModal(true)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      View All
                    </button>
                  )}
                </div>

                {/* Date filter */}
                {activity.length > 0 && (
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <label className="text-[10px] text-gray-500">From:</label>
                    <input
                      type="date"
                      value={activityStartDate}
                      onChange={(e) => setActivityStartDate(e.target.value)}
                      className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded"
                    />
                    <label className="text-[10px] text-gray-500">To:</label>
                    <input
                      type="date"
                      value={activityEndDate}
                      onChange={(e) => setActivityEndDate(e.target.value)}
                      className="text-[10px] px-1.5 py-0.5 border border-gray-200 rounded"
                    />
                    {(activityStartDate || activityEndDate) && (
                      <button
                        type="button"
                        onClick={() => { setActivityStartDate(""); setActivityEndDate(""); }}
                        className="text-[10px] text-gray-400 hover:text-gray-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                {activity.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No activity yet.
                  </p>
                ) : (() => {
                  // Filter by date range if set
                  let filtered = activity;
                  if (activityStartDate) {
                    filtered = filtered.filter(item => item.createdAt >= activityStartDate);
                  }
                  if (activityEndDate) {
                    // Add one day to include the end date fully
                    const endDatePlusOne = new Date(activityEndDate);
                    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
                    filtered = filtered.filter(item => item.createdAt < endDatePlusOne.toISOString());
                  }
                  // Show only last 15
                  const displayed = filtered.slice(0, 15);

                  if (displayed.length === 0) {
                    return (
                      <p className="text-sm text-gray-400">
                        No activity matching filter.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2 text-sm overflow-y-auto flex-1">
                      {displayed.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start border-b border-gray-100 pb-1 last:border-0"
                        >
                          <div>
                            <div className="text-xs uppercase text-gray-500">
                              {item.type}
                            </div>
                            <div className="text-gray-900">{item.message}</div>
                          </div>
                          <div className="text-[10px] text-gray-400 whitespace-nowrap pl-2">
                            {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                      {filtered.length > 15 && (
                        <button
                          type="button"
                          onClick={() => setShowAllActivityModal(true)}
                          className="w-full text-center text-[10px] text-primary hover:text-primaryDark py-1"
                        >
                          +{filtered.length - 15} more...
                        </button>
                      )}
                    </div>
                  );
                })()}
              </section>
            </div>
          </div>
        )}

        {/* PDF Viewer Modal */}

        {/* Pause Membership Modal */}
        {pauseModalMembershipId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Pause Membership</h3>

              <div className="space-y-3">
                {/* Indefinite option */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pauseType"
                    checked={pauseUnit === "indefinite"}
                    onChange={() => setPauseUnit("indefinite")}
                    className="w-3.5 h-3.5 text-primary"
                  />
                  <span className="text-xs text-gray-700">Indefinite (until manually reactivated)</span>
                </label>

                {/* Duration option */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pauseType"
                    checked={pauseUnit !== "indefinite"}
                    onChange={() => setPauseUnit("week")}
                    className="w-3.5 h-3.5 text-primary"
                  />
                  <span className="text-xs text-gray-700">For a specific duration:</span>
                </label>

                {pauseUnit !== "indefinite" && (
                  <div className="flex items-center gap-2 ml-5">
                    <input
                      type="number"
                      min="1"
                      value={pauseDuration}
                      onChange={(e) => setPauseDuration(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    <select
                      value={pauseUnit}
                      onChange={(e) => setPauseUnit(e.target.value as "day" | "week" | "month")}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="day">{pauseDuration === 1 ? "Day" : "Days"}</option>
                      <option value="week">{pauseDuration === 1 ? "Week" : "Weeks"}</option>
                      <option value="month">{pauseDuration === 1 ? "Month" : "Months"}</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={async () => {
                    setPauseSubmitting(true);
                    try {
                      // Calculate pause end date if not indefinite
                      let pauseEndDate: string | null = null;
                      if (pauseUnit !== "indefinite") {
                        const endDate = new Date();
                        if (pauseUnit === "day") {
                          endDate.setDate(endDate.getDate() + pauseDuration);
                        } else if (pauseUnit === "week") {
                          endDate.setDate(endDate.getDate() + pauseDuration * 7);
                        } else if (pauseUnit === "month") {
                          endDate.setMonth(endDate.getMonth() + pauseDuration);
                        }
                        pauseEndDate = endDate.toISOString().split("T")[0];
                      }

                      const res = await fetch(`/api/memberships/${pauseModalMembershipId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          status: "PAUSED",
                          pauseEndDate,
                        }),
                      });
                      if (res.ok) {
                        // Get plan name for activity
                        const pausedMembership = member?.memberships?.find(m => m.id === pauseModalMembershipId);
                        const planName = pausedMembership?.membershipPlan?.name || "membership";
                        const pauseMsg = pauseUnit === "indefinite"
                          ? `Membership paused indefinitely: ${planName}`
                          : `Membership paused for ${pauseDuration} ${pauseUnit}${pauseDuration > 1 ? 's' : ''}: ${planName}`;
                        addActivity(pauseMsg, "MEMBERSHIP");

                        const data = await res.json();
                        if (data.member) {
                          setMember(data.member);
                          hydrateFormFromMember(data.member);
                        } else {
                          fetchMember();
                        }
                        setPauseModalMembershipId(null);
                      }
                    } catch (err) {
                      console.error("Error pausing membership:", err);
                    } finally {
                      setPauseSubmitting(false);
                    }
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  disabled={pauseSubmitting}
                >
                  {pauseSubmitting ? "Pausing..." : "Pause Membership"}
                </button>
                <button
                  type="button"
                  onClick={() => setPauseModalMembershipId(null)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  disabled={pauseSubmitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Membership Modal */}
        {cancelModalMembershipId && (() => {
          const cancelMembership = member?.memberships?.find(m => m.id === cancelModalMembershipId);
          const cancelPlan = cancelMembership?.membershipPlan;
          const isUnderContract = cancelMembership?.contractEndDate && new Date(cancelMembership.contractEndDate) > new Date();
          const earlyTermFee = isUnderContract && cancelPlan?.cancellationFeeCents ? cancelPlan.cancellationFeeCents : 0;
          const noticeDays = cancelPlan?.cancellationNoticeDays || 0;

          return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Cancel Membership</h3>

              <div className="space-y-3">
                {isUnderContract && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-2">
                    <p className="text-xs font-semibold text-amber-800">Under Contract</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Contract ends {new Date(cancelMembership!.contractEndDate!).toLocaleDateString()}.
                      {earlyTermFee > 0 && (
                        <> Early termination fee: <span className="font-semibold">${(earlyTermFee / 100).toFixed(2)}</span></>
                      )}
                    </p>
                  </div>
                )}

                {noticeDays > 0 && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
                    <p className="text-xs text-blue-700">
                      This plan requires <span className="font-semibold">{noticeDays} days</span> cancellation notice.
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-600">
                  Select the date to stop payments. Membership will remain active until the end of the last billing period.
                </p>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Stop payments after
                  </label>
                  <input
                    type="date"
                    value={cancelEffectiveDate}
                    onChange={(e) => setCancelEffectiveDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Reason for cancellation
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Optional"
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={async () => {
                    if (!cancelEffectiveDate) return;
                    setCancelSubmitting(true);
                    try {
                      const res = await fetch(`/api/memberships/${cancelModalMembershipId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          status: "CANCELED",
                          endDate: cancelEffectiveDate,
                          cancellationReason: cancelReason || undefined,
                        }),
                      });
                      if (res.ok) {
                        const planName = cancelPlan?.name || "membership";
                        addActivity(`Membership canceled (effective ${cancelEffectiveDate}): ${planName}`, "MEMBERSHIP");

                        const data = await res.json();
                        if (data.member) {
                          setMember(data.member);
                          hydrateFormFromMember(data.member);
                        } else {
                          fetchMember();
                        }
                        setCancelModalMembershipId(null);
                        setCancelReason("");
                      }
                    } catch (err) {
                      console.error("Error canceling membership:", err);
                    } finally {
                      setCancelSubmitting(false);
                    }
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  disabled={cancelSubmitting || !cancelEffectiveDate}
                >
                  {cancelSubmitting ? "Canceling..." : "Cancel Membership"}
                </button>
                <button
                  type="button"
                  onClick={() => { setCancelModalMembershipId(null); setCancelReason(""); }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  disabled={cancelSubmitting}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Change Plan Modal */}
        {changePlanModalMembershipId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-900">
                Change Membership Plan
              </h3>

              {!changePlanShowConfirm ? (
                /* Step 1: Plan Selection */
                <div className="space-y-3">
                <p className="text-xs text-gray-600">
                  Select a new plan. Styles will be updated to match the new plan.
                </p>

                {(() => {
                  const currentMembership = member?.memberships?.find(m => m.id === changePlanModalMembershipId);
                  return currentMembership ? (
                    <div className="text-xs bg-gray-50 p-2 rounded-md">
                      <span className="text-gray-500">Current plan:</span>{" "}
                      <span className="font-medium">{currentMembership.membershipPlan.name}</span>
                      {currentMembership.membershipPlan.priceCents && (
                        <span className="text-gray-500 ml-1">
                          (${(currentMembership.membershipPlan.priceCents / 100).toFixed(2)}/{currentMembership.membershipPlan.billingCycle.toLowerCase().replace("ly", "")})
                        </span>
                      )}
                    </div>
                  ) : null;
                })()}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    New Plan
                  </label>
                  {availablePlans.length === 0 ? (
                    <p className="text-xs text-gray-500 italic py-2">
                      No other plans available.
                    </p>
                  ) : (
                    <select
                      value={changePlanSelectedPlanId}
                      onChange={(e) => {
                        const selectedPlanId = e.target.value;
                        setChangePlanSelectedPlanId(selectedPlanId);

                        // Calculate prorated price when a plan is selected
                        if (selectedPlanId) {
                          const currentMembership = member?.memberships?.find(m => m.id === changePlanModalMembershipId);
                          const newPlan = availablePlans.find(p => p.id === selectedPlanId);

                          if (currentMembership && newPlan) {
                            const oldPriceCents = currentMembership.membershipPlan.priceCents ?? 0;
                            const newPriceCents = newPlan.priceCents ?? 0;

                            // Set recurring price to new plan's standard price
                            setChangePlanRecurringDollars((newPriceCents / 100).toFixed(2));
                            const priceDiffCents = newPriceCents - oldPriceCents;

                            // Get billing cycle days
                            const billingCycle = currentMembership.membershipPlan.billingCycle?.toUpperCase() || "MONTHLY";
                            let cycleDays = 30; // default to monthly
                            switch (billingCycle) {
                              case "DAILY": cycleDays = 1; break;
                              case "WEEKLY": cycleDays = 7; break;
                              case "MONTHLY": cycleDays = 30; break;
                              case "QUARTERLY": cycleDays = 91; break;
                              case "SEMI_ANNUALLY":
                              case "SEMI-ANNUALLY":
                              case "SEMIANNUALLY": cycleDays = 182; break;
                              case "YEARLY":
                              case "ANNUALLY": cycleDays = 365; break;
                            }

                            // Calculate days remaining and days in cycle
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);

                            const nextPayment = currentMembership.nextPaymentDate
                              ? new Date(currentMembership.nextPaymentDate)
                              : null;
                            const lastPayment = currentMembership.lastPaymentDate
                              ? new Date(currentMembership.lastPaymentDate)
                              : null;

                            let daysInCycle = cycleDays;
                            let daysRemaining = cycleDays;

                            if (nextPayment && lastPayment) {
                              // Use actual payment dates if available
                              nextPayment.setHours(0, 0, 0, 0);
                              lastPayment.setHours(0, 0, 0, 0);
                              daysInCycle = Math.max(1, Math.ceil((nextPayment.getTime() - lastPayment.getTime()) / (1000 * 60 * 60 * 24)));
                              daysRemaining = Math.max(0, Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                            } else if (nextPayment) {
                              // Only next payment available - estimate cycle from billing cycle
                              nextPayment.setHours(0, 0, 0, 0);
                              daysInCycle = cycleDays;
                              daysRemaining = Math.max(0, Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                            } else if (lastPayment) {
                              // Only last payment available - calculate next based on cycle
                              lastPayment.setHours(0, 0, 0, 0);
                              daysInCycle = cycleDays;
                              const daysSincePayment = Math.ceil((today.getTime() - lastPayment.getTime()) / (1000 * 60 * 60 * 24));
                              daysRemaining = Math.max(0, cycleDays - (daysSincePayment % cycleDays));
                            } else {
                              // No payment dates - use start date to estimate position in cycle
                              const startDate = new Date(currentMembership.startDate);
                              startDate.setHours(0, 0, 0, 0);
                              const msPerDay = 1000 * 60 * 60 * 24;
                              const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / msPerDay);
                              daysInCycle = cycleDays;

                              // Calculate days into the current cycle
                              const daysIntoCycle = daysSinceStart % cycleDays;
                              // Days remaining in current cycle (if at day 0, full cycle; if at day 29 of 30-day cycle, 1 day left)
                              daysRemaining = cycleDays - daysIntoCycle;
                              // Cap at cycleDays - 1 if we've been in the membership for at least one full day
                              // This prevents showing full price when we're actually deep into a cycle
                              if (daysSinceStart > 0 && daysRemaining === cycleDays) {
                                // Edge case: we're exactly on a cycle boundary, treat as end of cycle
                                daysRemaining = 0;
                              }
                            }

                            // If new price is same or less, no charge
                            if (priceDiffCents <= 0) {
                              setChangePlanPriceDollars("0.00");
                            } else {
                              // Prorated price = price difference * (days remaining / days in cycle)
                              const proratedCents = Math.round(priceDiffCents * (daysRemaining / daysInCycle));
                              setChangePlanPriceDollars((Math.max(0, proratedCents) / 100).toFixed(2));
                            }
                          } else {
                            setChangePlanPriceDollars("0.00");
                            setChangePlanRecurringDollars("0.00");
                          }
                        } else {
                          setChangePlanPriceDollars("0.00");
                          setChangePlanRecurringDollars("0.00");
                        }
                      }}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">Select a plan...</option>
                      {availablePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                          {plan.priceCents ? ` - $${(plan.priceCents / 100).toFixed(2)}/${plan.billingCycle.toLowerCase().replace("ly", "")}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Prorated Change Price */}
                {(() => {
                  const currentMbr = member?.memberships?.find(m => m.id === changePlanModalMembershipId);
                  const newPl = availablePlans.find(p => p.id === changePlanSelectedPlanId);
                  const oldPrice = currentMbr?.membershipPlan.priceCents ?? 0;
                  const newPrice = newPl?.priceCents ?? 0;
                  const isDowngradeOrSame = newPl && newPrice <= oldPrice;

                  return isDowngradeOrSame ? (
                    <div className="bg-gray-50 rounded-md p-2">
                      <p className="text-xs font-medium text-gray-700">No charge</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        New plan price is the same or less than current plan.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Change Price (prorated)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={changePlanPriceDollars}
                          onChange={(e) => setChangePlanPriceDollars(e.target.value)}
                          className="w-full rounded-md border border-gray-300 pl-5 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Prorated based on days remaining in billing cycle.
                      </p>
                    </div>
                  );
                })()}

                {/* Recurring Price */}
                {changePlanSelectedPlanId && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Recurring Price
                    </label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={changePlanRecurringDollars}
                        onChange={(e) => setChangePlanRecurringDollars(e.target.value)}
                        className="w-full rounded-md border border-gray-300 pl-5 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Default is the new plan's standard price. Adjust for a custom recurring rate.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setChangePlanShowConfirm(true)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                    disabled={!changePlanSelectedPlanId}
                  >
                    Review Change
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangePlanModalMembershipId(null)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              ) : (
                /* Step 2: Confirmation */
                <div className="space-y-4">
                  {(() => {
                    const currentMembership = member?.memberships?.find(m => m.id === changePlanModalMembershipId);
                    const newPlan = availablePlans.find(p => p.id === changePlanSelectedPlanId);
                    const chargeAmount = parseFloat(changePlanPriceDollars) || 0;
                    const recurringAmount = parseFloat(changePlanRecurringDollars) || 0;
                    const standardPrice = (newPlan?.priceCents ?? 0) / 100;
                    const isCustomRecurring = Math.abs(recurringAmount - standardPrice) > 0.001;
                    return (
                      <>
                        <div className="text-center py-2">
                          <svg className="w-10 h-10 mx-auto text-amber-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-sm font-semibold text-gray-900">Confirm Plan Change</p>
                        </div>

                        <div className="bg-gray-50 rounded-md p-3 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Current Plan:</span>
                            <span className="font-medium">{currentMembership?.membershipPlan.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">New Plan:</span>
                            <span className="font-medium text-primary">{newPlan?.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Recurring Price:</span>
                            <span className={`font-medium ${isCustomRecurring ? "text-amber-600" : ""}`}>
                              ${recurringAmount.toFixed(2)}/{newPlan?.billingCycle.toLowerCase().replace("ly", "")}
                              {isCustomRecurring && " (custom)"}
                            </span>
                          </div>
                          <div className="border-t border-gray-200 pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Charge Amount:</span>
                              <span className={`font-semibold ${chargeAmount > 0 ? "text-green-600" : "text-gray-600"}`}>
                                {chargeAmount > 0 ? `$${chargeAmount.toFixed(2)}` : "No charge"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-gray-600 text-center">
                          {chargeAmount > 0
                            ? "This will change the membership and charge the account."
                            : "This will change the membership with no additional charge."}
                        </p>
                      </>
                    );
                  })()}

                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!changePlanSelectedPlanId) return;
                        setChangePlanSubmitting(true);
                        try {
                          const res = await fetch(`/api/memberships/${changePlanModalMembershipId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              membershipPlanId: changePlanSelectedPlanId,
                              customPriceCents: (() => {
                                const recurring = Math.round((parseFloat(changePlanRecurringDollars) || 0) * 100);
                                const newPl = availablePlans.find(p => p.id === changePlanSelectedPlanId);
                                const standard = newPl?.priceCents ?? 0;
                                // Only set custom price if different from standard
                                return recurring !== standard ? recurring : null;
                              })(),
                            }),
                          });
                          if (res.ok) {
                            // Get plan names for activity
                            const oldMembership = member?.memberships?.find(m => m.id === changePlanModalMembershipId);
                            const oldPlanName = oldMembership?.membershipPlan?.name || "unknown";
                            const newPlan = availablePlans.find(p => p.id === changePlanSelectedPlanId);
                            const newPlanName = newPlan?.name || "unknown";
                            const priceStr = parseFloat(changePlanPriceDollars) > 0 ? ` ($${parseFloat(changePlanPriceDollars).toFixed(2)})` : "";
                            addActivity(`Plan changed: ${oldPlanName} → ${newPlanName}${priceStr}`, "MEMBERSHIP");

                            const data = await res.json();
                            if (data.member) {
                              setMember(data.member);
                              hydrateFormFromMember(data.member);
                            } else {
                              fetchMember();
                            }
                            setChangePlanModalMembershipId(null);
                            setChangePlanShowConfirm(false);
                          }
                        } catch (err) {
                          console.error("Error changing plan:", err);
                        } finally {
                          setChangePlanSubmitting(false);
                        }
                      }}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                      disabled={changePlanSubmitting}
                    >
                      {changePlanSubmitting ? "Processing..." : "Confirm & Change"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChangePlanShowConfirm(false)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      disabled={changePlanSubmitting}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Activity Modal */}
        {showAllActivityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">All Activity</h3>
                <button
                  type="button"
                  onClick={() => setShowAllActivityModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Date filter in modal */}
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <label className="text-xs text-gray-500">From:</label>
                <input
                  type="date"
                  value={activityStartDate}
                  onChange={(e) => setActivityStartDate(e.target.value)}
                  className="text-xs px-2 py-1 border border-gray-200 rounded"
                />
                <label className="text-xs text-gray-500">To:</label>
                <input
                  type="date"
                  value={activityEndDate}
                  onChange={(e) => setActivityEndDate(e.target.value)}
                  className="text-xs px-2 py-1 border border-gray-200 rounded"
                />
                {(activityStartDate || activityEndDate) && (
                  <button
                    type="button"
                    onClick={() => { setActivityStartDate(""); setActivityEndDate(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
                <span className="ml-auto text-xs text-gray-400">
                  {(() => {
                    let filtered = activity;
                    if (activityStartDate) {
                      filtered = filtered.filter(item => item.createdAt >= activityStartDate);
                    }
                    if (activityEndDate) {
                      const endDatePlusOne = new Date(activityEndDate);
                      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
                      filtered = filtered.filter(item => item.createdAt < endDatePlusOne.toISOString());
                    }
                    return `${filtered.length} activities`;
                  })()}
                </span>
              </div>

              {/* Scrollable activity list */}
              <div className="flex-1 overflow-y-auto p-4">
                {(() => {
                  let filtered = activity;
                  if (activityStartDate) {
                    filtered = filtered.filter(item => item.createdAt >= activityStartDate);
                  }
                  if (activityEndDate) {
                    const endDatePlusOne = new Date(activityEndDate);
                    endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
                    filtered = filtered.filter(item => item.createdAt < endDatePlusOne.toISOString());
                  }

                  if (filtered.length === 0) {
                    return (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No activity matching filter.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {filtered.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start border-b border-gray-100 pb-2 last:border-0"
                        >
                          <div>
                            <div className="text-[10px] uppercase text-gray-500 font-medium">
                              {item.type}
                            </div>
                            <div className="text-sm text-gray-900">{item.message}</div>
                          </div>
                          <div className="text-[10px] text-gray-400 whitespace-nowrap pl-3">
                            {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="p-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAllActivityModal(false)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      {/* Credit Scheduling Modal */}
      {showCreditBooking && bookingCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Schedule Appointment
              </h2>
              <button
                onClick={() => setShowCreditBooking(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Credit Info */}
            <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-xs">
              <p className="font-medium text-gray-900">{bookingCredit.servicePackage.name}</p>
              {bookingCredit.servicePackage.appointment && (
                <p className="text-gray-600">{bookingCredit.servicePackage.appointment.title} ({bookingCredit.servicePackage.appointment.duration} min)</p>
              )}
              <p className="text-green-700 font-semibold mt-1">
                {bookingCredit.creditsRemaining}/{bookingCredit.creditsTotal} credits remaining
              </p>
            </div>

            {/* Date Picker */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Select Date
              </label>
              <input
                type="date"
                value={bookingDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setBookingDate(e.target.value);
                  fetchAvailableSlots(e.target.value);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Available Slots */}
            {bookingDate && (
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium text-gray-700">
                  Available Time Slots
                </label>
                {bookingSlotsLoading ? (
                  <div className="text-center py-4 text-xs text-gray-500">Loading available slots...</div>
                ) : bookingSlots.length === 0 ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">
                    No available slots for this date. Try a different date or check that coach availability is configured.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                    {bookingSlots.map((slot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setBookingSelectedSlot(idx)}
                        className={`flex items-center justify-between rounded-md border p-3 text-left text-xs transition-colors ${
                          bookingSelectedSlot === idx
                            ? "border-primary bg-primary/5 ring-2 ring-primary"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div>
                          <span className="font-semibold text-gray-900">
                            {slot.startTime} – {slot.endTime}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-gray-600">{slot.coachName}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {bookingSelectedSlot !== null && (
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Notes (optional)
                </label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  placeholder="Additional notes..."
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreditBooking(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreditBookSubmit}
                disabled={bookingSaving || bookingSelectedSlot === null}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {bookingSaving ? "Scheduling..." : "Schedule Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </AppLayout>
  );
}
