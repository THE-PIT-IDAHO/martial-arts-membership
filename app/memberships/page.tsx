"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { getTodayString } from "@/lib/dates";

type Style = {
  id: string;
  name: string;
};

type MembershipType = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { membershipPlans: number };
};

type MembershipPlan = {
  id: string;
  membershipId: string | null;
  membershipTypeId: string | null;
  name: string;
  description: string | null;
  priceCents: number | null;
  setupFeeCents: number | null;
  purchaseLimit: number | null;
  billingCycle: string;
  contractLengthMonths: number | null;
  autoRenew: boolean;
  classesPerDay: number | null;
  classesPerWeek: number | null;
  classesPerMonth: number | null;
  allowedStyles: string | null;
  familyDiscountPercent: number | null;
  rankPromotionDiscountPercent: number | null;
  otherDiscountPercent: number | null;
  trialDays: number | null;
  promoCode: string | null;
  cancellationNoticeDays: number | null;
  cancellationFeeCents: number | null;
  contractClauses: string | null;
  sortOrder: number;
  color: string | null;
  isActive: boolean;
  availableOnline: boolean;
  memberships?: Membership[];
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
};

type Membership = {
  id: string;
  memberId: string;
  membershipPlanId: string;
  startDate: string;
  endDate: string | null;
  status: string;
  member?: Member;
  membershipPlan?: MembershipPlan;
};

const BILLING_CYCLES = ["WEEKLY", "MONTHLY", "YEARLY", "SESSION", "ONE_TIME"];
const MEMBERSHIP_STATUSES = ["ACTIVE", "PAUSED", "CANCELED", "EXPIRED"];

export default function MembershipsPage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Plan form state
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [planMembershipId, setPlanMembershipId] = useState("");
  const [planMembershipTypeId, setPlanMembershipTypeId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [planSetupFee, setPlanSetupFee] = useState("");
  const [planPurchaseLimit, setPlanPurchaseLimit] = useState("");
  const [planBillingCycle, setPlanBillingCycle] = useState("MONTHLY");
  const [planContractLength, setPlanContractLength] = useState("");
  const [planContractUnit, setPlanContractUnit] = useState<"days" | "weeks" | "months" | "years">("months");
  const [planAutoRenew, setPlanAutoRenew] = useState(true);
  const [planClassesPerDay, setPlanClassesPerDay] = useState("");
  const [planClassesPerWeek, setPlanClassesPerWeek] = useState("");
  const [planClassesPerMonth, setPlanClassesPerMonth] = useState("");
  const [planAllowedStyles, setPlanAllowedStyles] = useState<string[]>([]);
  const [planPromotionDiscount, setPlanPromotionDiscount] = useState("");
  const [planOtherDiscount, setPlanOtherDiscount] = useState("");
  const [planTrialDays, setPlanTrialDays] = useState("");
  const [planPromoCode, setPlanPromoCode] = useState("");
  const [planCancellationDays, setPlanCancellationDays] = useState("");
  const [planCancellationFee, setPlanCancellationFee] = useState("");
  const [planSortOrder, setPlanSortOrder] = useState("0");
  const [planColor, setPlanColor] = useState("#c41111");
  const [planIsActive, setPlanIsActive] = useState(true);
  const [planAvailableOnline, setPlanAvailableOnline] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  // Per-plan contract clauses
  type ContractClause = { id: string; title: string; content: string };
  const [planContractClauses, setPlanContractClauses] = useState<ContractClause[]>([]);

  // Global contract clauses (stored in Settings)
  const [globalContractClauses, setGlobalContractClauses] = useState<ContractClause[]>([]);
  const [editingClause, setEditingClause] = useState<ContractClause | null>(null);
  const [clauseTitle, setClauseTitle] = useState("");
  const [clauseContent, setClauseContent] = useState("");
  const [showClauseForm, setShowClauseForm] = useState(false);
  const [savingClauses, setSavingClauses] = useState(false);

  // Update confirmation dialog state
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [pendingUpdateBody, setPendingUpdateBody] = useState<any>(null);
  const [activeMembers, setActiveMembers] = useState<number>(0);

  // Assign membership state
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(getTodayString());
  const [assignEndDate, setAssignEndDate] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<"plans" | "memberships" | "types" | "services">("plans");

  // Membership Types state
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<MembershipType | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeDescription, setTypeDescription] = useState("");
  const [typeColor, setTypeColor] = useState("#c41111");
  const [typeSortOrder, setTypeSortOrder] = useState("0");
  const [typeIsActive, setTypeIsActive] = useState(true);
  const [savingType, setSavingType] = useState(false);

  // Appointments state
  type SvcAppointment = {
    id: string; title: string; description: string | null;
    type: string | null; duration: number; priceCents: number | null;
    color: string | null; coachId: string | null; coachName: string | null;
    styleId: string | null; styleName: string | null;
    notes: string | null; isActive: boolean;
  };
  type SvcPackage = {
    id: string; name: string; description: string | null;
    appointmentId: string | null; sessionsIncluded: number;
    priceCents: number; expirationDays: number | null;
    isActive: boolean; availableOnline: boolean; sortOrder: number;
    appointment: { id: string; title: string } | null;
  };
  type Coach = { id: string; firstName: string; lastName: string };
  type PricingTier = { id?: string; sessions: string; priceDollars: string; posEnabled: boolean; portalEnabled: boolean; expirationDays: string };
  const [svcPackages, setSvcPackages] = useState<SvcPackage[]>([]);
  const [svcAppointments, setSvcAppointments] = useState<SvcAppointment[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  // Appointment type form state (includes pricing tiers)
  const [showApptModal, setShowApptModal] = useState(false);
  const [editingAppt, setEditingAppt] = useState<SvcAppointment | null>(null);
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptForm, setApptForm] = useState({
    title: "", description: "", type: "", duration: "60",
    durationUnit: "minutes" as "minutes" | "hours",
    priceDollars: "", color: "#6b7280", coachId: "", styleId: "",
    notes: "", isActive: true,
  });
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  // Expanded row state for viewing tiers inline
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-generate description based on contract settings
  useEffect(() => {
    // Only auto-generate if description is empty or was auto-generated
    if (editingPlan) return; // Don't auto-generate when editing existing plan

    const contractLen = parseInt(planContractLength) || 0;
    if (contractLen <= 0) {
      setPlanDescription("");
      return;
    }

    // Build contract length text
    let contractText = "";
    if (planContractUnit === "days") {
      contractText = contractLen === 1 ? "1 day" : `${contractLen} day`;
    } else if (planContractUnit === "weeks") {
      contractText = contractLen === 1 ? "1 week" : `${contractLen} week`;
    } else if (planContractUnit === "months") {
      contractText = contractLen === 1 ? "1 month" : `${contractLen} month`;
    } else if (planContractUnit === "years") {
      contractText = contractLen === 1 ? "1 year" : `${contractLen} year`;
    }

    // Build billing cycle text
    let billingText = "";
    switch (planBillingCycle) {
      case "WEEKLY":
        billingText = "every week";
        break;
      case "MONTHLY":
        billingText = "every month";
        break;
      case "YEARLY":
        billingText = "every year";
        break;
      case "SESSION":
        billingText = "per session";
        break;
      case "ONE_TIME":
        billingText = "one time";
        break;
      default:
        billingText = "every month";
    }

    // Build full description
    let description = `${contractText} contract`;
    if (planAutoRenew && planBillingCycle !== "ONE_TIME" && planBillingCycle !== "SESSION") {
      description += ` that is auto billed ${billingText}`;
    } else if (planBillingCycle === "ONE_TIME") {
      description += " with one time payment";
    } else if (planBillingCycle === "SESSION") {
      description += " billed per session";
    } else {
      description += ` billed ${billingText}`;
    }

    setPlanDescription(description);
  }, [planContractLength, planContractUnit, planBillingCycle, planAutoRenew, editingPlan]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [plansRes, membershipsRes, membersRes, stylesRes, typesRes, svcRes, aptRes, coachesRes, settingsRes] = await Promise.all([
        fetch("/api/membership-plans"),
        fetch("/api/memberships"),
        fetch("/api/members"),
        fetch("/api/styles"),
        fetch("/api/membership-types"),
        fetch("/api/service-packages"),
        fetch("/api/appointments"),
        fetch("/api/members?status=COACH"),
        fetch("/api/settings"),
      ]);

      if (!plansRes.ok) throw new Error("Failed to load membership plans");

      const plansData = await plansRes.json();
      const membershipsData = membershipsRes.ok ? await membershipsRes.json() : { memberships: [] };
      const membersData = membersRes.ok ? await membersRes.json() : { members: [] };
      const stylesData = stylesRes.ok ? await stylesRes.json() : { styles: [] };
      const typesData = typesRes.ok ? await typesRes.json() : { membershipTypes: [] };
      const svcData = svcRes.ok ? await svcRes.json() : { packages: [] };
      const aptData = aptRes.ok ? await aptRes.json() : { appointments: [] };
      const coachesData = coachesRes.ok ? await coachesRes.json() : { members: [] };
      const settingsData = settingsRes.ok ? await settingsRes.json() : { settings: [] };

      // Load global contract clauses from settings
      const settingsMap: Record<string, string> = {};
      for (const s of settingsData.settings || []) settingsMap[s.key] = s.value;
      if (settingsMap.contract_clauses) {
        try { setGlobalContractClauses(JSON.parse(settingsMap.contract_clauses)); } catch { /* ignore */ }
      }

      setPlans(plansData.membershipPlans || []);
      setMemberships(membershipsData.memberships || []);
      setMembers(membersData.members || []);
      setStyles(stylesData.styles || []);
      setMembershipTypes(typesData.membershipTypes || []);
      setSvcPackages(svcData.servicePackages || []);
      setSvcAppointments(aptData.appointments || []);
      setCoaches((coachesData.members || []).map((c: { id: string; firstName: string; lastName: string }) => ({
        id: c.id, firstName: c.firstName, lastName: c.lastName,
      })));
    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  function resetPlanForm() {
    setEditingPlan(null);
    setPlanMembershipId("");
    setPlanMembershipTypeId("");
    setPlanName("");
    setPlanDescription("");
    setPlanPrice("");
    setPlanSetupFee("");
    setPlanPurchaseLimit("");
    setPlanBillingCycle("MONTHLY");
    setPlanContractLength("");
    setPlanContractUnit("months");
    setPlanAutoRenew(true);
    setPlanClassesPerDay("");
    setPlanClassesPerWeek("");
    setPlanClassesPerMonth("");
    setPlanAllowedStyles([]);
    setPlanPromotionDiscount("");
    setPlanOtherDiscount("");
    setPlanTrialDays("");
    setPlanPromoCode("");
    setPlanCancellationDays("");
    setPlanCancellationFee("");
    setPlanSortOrder("0");
    setPlanColor("#c41111");
    setPlanIsActive(true);
    setPlanAvailableOnline(false);
    setPlanContractClauses([]);
    setShowPlanForm(false);
  }

  // Membership Type functions
  function resetTypeForm() {
    setEditingType(null);
    setTypeName("");
    setTypeDescription("");
    setTypeColor("#c41111");
    // Calculate next sort order (max + 1, starting at 1)
    const maxOrder = membershipTypes.length > 0
      ? Math.max(...membershipTypes.map(t => t.sortOrder))
      : 0;
    setTypeSortOrder(String(maxOrder + 1));
    setTypeIsActive(true);
    setShowTypeForm(false);
  }

  // Drag and drop state for types
  const [draggedTypeId, setDraggedTypeId] = useState<string | null>(null);

  function handleTypeDragStart(e: React.DragEvent, typeId: string) {
    setDraggedTypeId(typeId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleTypeDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleTypeDrop(e: React.DragEvent, targetTypeId: string) {
    e.preventDefault();
    if (!draggedTypeId || draggedTypeId === targetTypeId) {
      setDraggedTypeId(null);
      return;
    }

    const draggedIndex = membershipTypes.findIndex(t => t.id === draggedTypeId);
    const targetIndex = membershipTypes.findIndex(t => t.id === targetTypeId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTypeId(null);
      return;
    }

    // Reorder the array
    const newTypes = [...membershipTypes];
    const [removed] = newTypes.splice(draggedIndex, 1);
    newTypes.splice(targetIndex, 0, removed);

    // Update sort orders (1-based)
    const updatedTypes = newTypes.map((type, index) => ({
      ...type,
      sortOrder: index + 1,
    }));

    // Optimistically update UI
    setMembershipTypes(updatedTypes);
    setDraggedTypeId(null);

    // Save new order to server
    try {
      await Promise.all(
        updatedTypes.map((type) =>
          fetch(`/api/membership-types/${type.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: type.sortOrder }),
          })
        )
      );
    } catch (err) {
      console.error("Error saving type order:", err);
      // Reload on error to get correct order
      loadData();
    }
  }

  function handleTypeDragEnd() {
    setDraggedTypeId(null);
  }

  function handleEditType(type: MembershipType) {
    setEditingType(type);
    setTypeName(type.name);
    setTypeDescription(type.description || "");
    setTypeColor(type.color || "#c41111");
    setTypeSortOrder(String(type.sortOrder || 0));
    setTypeIsActive(type.isActive);
    setShowTypeForm(true);
  }

  async function handleSaveType(e: React.FormEvent) {
    e.preventDefault();
    if (!typeName.trim()) return;

    try {
      setSavingType(true);
      setError(null);

      const body = {
        name: typeName.trim(),
        description: typeDescription.trim() || null,
        color: typeColor || null,
        sortOrder: typeSortOrder ? Number(typeSortOrder) : 0,
        isActive: typeIsActive,
      };

      const res = await fetch(
        editingType ? `/api/membership-types/${editingType.id}` : "/api/membership-types",
        {
          method: editingType ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save membership type");
      }

      await loadData();
      resetTypeForm();
    } catch (err: any) {
      console.error("Error saving type:", err);
      setError(err.message || "Failed to save membership type");
    } finally {
      setSavingType(false);
    }
  }

  async function handleDeleteType(type: MembershipType) {
    if (!window.confirm(`Are you sure you want to delete "${type.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/membership-types/${type.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete membership type");
      }

      setMembershipTypes(membershipTypes.filter((t) => t.id !== type.id));
    } catch (err: any) {
      console.error("Error deleting type:", err);
      alert(err.message || "Failed to delete membership type");
    }
  }

  function handleEditPlan(plan: MembershipPlan) {
    setEditingPlan(plan);
    populatePlanForm(plan);
  }

  function handleDuplicatePlan(plan: MembershipPlan) {
    setEditingPlan(null); // null so it creates a new plan instead of updating
    populatePlanForm(plan);
    setPlanName(plan.name + " (Copy)"); // Add "(Copy)" suffix to distinguish
    setPlanMembershipId(""); // Clear membership ID for new plan
  }

  function populatePlanForm(plan: MembershipPlan) {
    setPlanMembershipId(plan.membershipId || "");
    setPlanMembershipTypeId(plan.membershipTypeId || "");
    setPlanName(plan.name);
    setPlanDescription(plan.description || "");
    setPlanPrice(plan.priceCents ? String(plan.priceCents / 100) : "");
    setPlanSetupFee(plan.setupFeeCents ? String(plan.setupFeeCents / 100) : "");
    setPlanPurchaseLimit(plan.purchaseLimit ? String(plan.purchaseLimit) : "");
    setPlanBillingCycle(plan.billingCycle);
    // Parse stored days back to appropriate unit
    if (plan.contractLengthMonths) {
      const days = plan.contractLengthMonths;
      if (days % 365 === 0) {
        setPlanContractLength(String(days / 365));
        setPlanContractUnit("years");
      } else if (days % 30 === 0) {
        setPlanContractLength(String(days / 30));
        setPlanContractUnit("months");
      } else if (days % 7 === 0) {
        setPlanContractLength(String(days / 7));
        setPlanContractUnit("weeks");
      } else {
        setPlanContractLength(String(days));
        setPlanContractUnit("days");
      }
    } else {
      setPlanContractLength("");
      setPlanContractUnit("months");
    }
    setPlanAutoRenew(plan.autoRenew);
    setPlanClassesPerDay(plan.classesPerDay ? String(plan.classesPerDay) : "");
    setPlanClassesPerWeek(plan.classesPerWeek ? String(plan.classesPerWeek) : "");
    setPlanClassesPerMonth(plan.classesPerMonth ? String(plan.classesPerMonth) : "");
    setPlanAllowedStyles(plan.allowedStyles ? JSON.parse(plan.allowedStyles) : []);
    setPlanPromotionDiscount(plan.rankPromotionDiscountPercent ? String(plan.rankPromotionDiscountPercent) : "");
    setPlanOtherDiscount(plan.otherDiscountPercent ? String(plan.otherDiscountPercent) : "");
    setPlanTrialDays(plan.trialDays ? String(plan.trialDays) : "");
    setPlanPromoCode(plan.promoCode || "");
    setPlanCancellationDays(plan.cancellationNoticeDays ? String(plan.cancellationNoticeDays) : "");
    setPlanCancellationFee(plan.cancellationFeeCents ? String(plan.cancellationFeeCents / 100) : "");
    setPlanSortOrder(String(plan.sortOrder || 0));
    setPlanColor(plan.color || "#c41111");
    setPlanIsActive(plan.isActive);
    setPlanAvailableOnline(plan.availableOnline ?? false);
    if (plan.contractClauses) {
      try { setPlanContractClauses(JSON.parse(plan.contractClauses)); } catch { setPlanContractClauses([]); }
    } else {
      setPlanContractClauses([]);
    }
    setShowPlanForm(true);
  }

  function buildPlanBody() {
    const priceCents = planPrice ? Math.round(parseFloat(planPrice) * 100) : null;
    const setupFeeCents = planSetupFee ? Math.round(parseFloat(planSetupFee) * 100) : null;

    // Convert contract length to days for storage
    let contractLengthDays: number | null = null;
    if (planContractLength) {
      const value = Number(planContractLength);
      switch (planContractUnit) {
        case "days":
          contractLengthDays = value;
          break;
        case "weeks":
          contractLengthDays = value * 7;
          break;
        case "months":
          contractLengthDays = value * 30;
          break;
        case "years":
          contractLengthDays = value * 365;
          break;
      }
    }

    const cancellationFeeCents = planCancellationFee ? Math.round(parseFloat(planCancellationFee) * 100) : null;

    return {
      membershipId: planMembershipId.trim() || null,
      membershipTypeId: planMembershipTypeId || null,
      name: planName.trim(),
      description: planDescription.trim() || null,
      priceCents,
      setupFeeCents,
      purchaseLimit: planPurchaseLimit ? Number(planPurchaseLimit) : null,
      billingCycle: planBillingCycle,
      contractLengthMonths: contractLengthDays,
      autoRenew: planAutoRenew,
      classesPerDay: planClassesPerDay ? Number(planClassesPerDay) : null,
      classesPerWeek: planClassesPerWeek ? Number(planClassesPerWeek) : null,
      classesPerMonth: planClassesPerMonth ? Number(planClassesPerMonth) : null,
      allowedStyles: planAllowedStyles.length > 0 ? JSON.stringify(planAllowedStyles) : null,
      rankPromotionDiscountPercent: planPromotionDiscount ? Number(planPromotionDiscount) : null,
      otherDiscountPercent: planOtherDiscount ? Number(planOtherDiscount) : null,
      trialDays: planTrialDays ? Number(planTrialDays) : null,
      promoCode: planPromoCode.trim() || null,
      cancellationNoticeDays: planCancellationDays ? Number(planCancellationDays) : null,
      cancellationFeeCents,
      sortOrder: planSortOrder ? Number(planSortOrder) : 0,
      color: planColor || null,
      isActive: planIsActive,
      availableOnline: planAvailableOnline,
      contractClauses: planContractClauses.length > 0 ? JSON.stringify(planContractClauses) : null,
    };
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planName.trim()) return;

    const body = buildPlanBody();

    // If editing and there are active members, show confirmation dialog
    if (editingPlan) {
      const activeMemberCount = editingPlan.memberships?.filter(
        (m) => m.status === "ACTIVE"
      ).length || 0;

      if (activeMemberCount > 0) {
        setPendingUpdateBody(body);
        setActiveMembers(activeMemberCount);
        setShowUpdateConfirm(true);
        return;
      }
    }

    // No active members or creating new plan - proceed directly
    await savePlan(body, "future");
  }

  async function savePlan(body: any, updateMode: "both" | "current" | "future") {
    try {
      setSavingPlan(true);
      setError(null);

      const applyToCurrentMembers = updateMode === "both" || updateMode === "current";
      const updatePlanTemplate = updateMode === "both" || updateMode === "future";

      const res = await fetch(
        editingPlan ? `/api/membership-plans/${editingPlan.id}` : "/api/membership-plans",
        {
          method: editingPlan ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, applyToCurrentMembers, updatePlanTemplate }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save membership plan");
      }

      await loadData();
      resetPlanForm();
      setShowUpdateConfirm(false);
      setPendingUpdateBody(null);
    } catch (err: any) {
      console.error("Error saving plan:", err);
      setError(err.message || "Failed to save membership plan");
    } finally {
      setSavingPlan(false);
    }
  }

  function handleUpdateConfirmChoice(updateMode: "both" | "current" | "future") {
    if (pendingUpdateBody) {
      savePlan(pendingUpdateBody, updateMode);
    }
  }

  function handleCancelUpdateConfirm() {
    setShowUpdateConfirm(false);
    setPendingUpdateBody(null);
  }

  async function handleDeletePlan(plan: MembershipPlan) {
    if (!window.confirm(`Are you sure you want to delete "${plan.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/membership-plans/${plan.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete membership plan");
      }

      setPlans(plans.filter((p) => p.id !== plan.id));
    } catch (err: any) {
      console.error("Error deleting plan:", err);
      alert(err.message || "Failed to delete membership plan");
    }
  }

  // ── Global Contract Clause Functions ──
  function openClauseForm(clause?: ContractClause) {
    if (clause) {
      setEditingClause(clause);
      setClauseTitle(clause.title);
      setClauseContent(clause.content);
    } else {
      setEditingClause(null);
      setClauseTitle("");
      setClauseContent("");
    }
    setShowClauseForm(true);
  }

  async function saveGlobalClauses(updated: ContractClause[]) {
    setSavingClauses(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "contract_clauses", value: JSON.stringify(updated) }),
      });
      setGlobalContractClauses(updated);
    } catch { /* ignore */ }
    setSavingClauses(false);
  }

  function handleSaveClause() {
    if (!clauseTitle.trim() || !clauseContent.trim()) return;
    let updated: ContractClause[];
    if (editingClause) {
      updated = globalContractClauses.map((c) =>
        c.id === editingClause.id ? { ...c, title: clauseTitle.trim(), content: clauseContent.trim() } : c
      );
    } else {
      updated = [...globalContractClauses, { id: `clause-${Date.now()}`, title: clauseTitle.trim(), content: clauseContent.trim() }];
    }
    saveGlobalClauses(updated);
    setShowClauseForm(false);
    setEditingClause(null);
    setClauseTitle("");
    setClauseContent("");
  }

  function handleDeleteClause(id: string) {
    if (!window.confirm("Remove this contract clause?")) return;
    saveGlobalClauses(globalContractClauses.filter((c) => c.id !== id));
  }

  // Per-plan clause helpers
  function addPlanClause() {
    setPlanContractClauses([...planContractClauses, { id: `pc-${Date.now()}`, title: "", content: "" }]);
  }
  function updatePlanClause(id: string, field: "title" | "content", value: string) {
    setPlanContractClauses(planContractClauses.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }
  function removePlanClause(id: string) {
    setPlanContractClauses(planContractClauses.filter((c) => c.id !== id));
  }

  function resetAssignForm() {
    setAssignPlanId("");
    setAssignMemberId("");
    setAssignStartDate("");
    setAssignEndDate("");
    setShowAssignForm(false);
  }

  async function handleAssignMembership(e: React.FormEvent) {
    e.preventDefault();
    if (!assignPlanId || !assignMemberId || !assignStartDate) return;

    try {
      setSavingAssign(true);
      setError(null);

      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipPlanId: assignPlanId,
          memberId: assignMemberId,
          startDate: assignStartDate,
          endDate: assignEndDate || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to assign membership");
      }

      await loadData();
      // Only reset member selection, keep form open for another assignment
      setAssignMemberId("");
      // Show success message briefly
      setError(null);
      alert("Membership assigned successfully!");
    } catch (err: any) {
      console.error("Error assigning membership:", err);
      setError(err.message || "Failed to assign membership");
    } finally {
      setSavingAssign(false);
    }
  }

  async function handleUpdateMembershipStatus(membership: Membership, newStatus: string) {
    try {
      const res = await fetch(`/api/memberships/${membership.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update membership");

      await loadData();
    } catch (err: any) {
      console.error("Error updating membership:", err);
      alert(err.message || "Failed to update membership");
    }
  }

  async function handleDeleteMembership(membership: Membership) {
    const memberName = membership.member
      ? `${membership.member.firstName} ${membership.member.lastName}`
      : "this member";

    if (!window.confirm(`Remove membership for ${memberName}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/memberships/${membership.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete membership");

      setMemberships(memberships.filter((m) => m.id !== membership.id));
    } catch (err: any) {
      console.error("Error deleting membership:", err);
      alert(err.message || "Failed to delete membership");
    }
  }

  // Appointment type CRUD functions
  function resetApptForm() {
    setEditingAppt(null);
    setApptForm({
      title: "", description: "", type: "", duration: "60",
      durationUnit: "minutes", priceDollars: "", color: "#6b7280",
      coachId: "", styleId: "", notes: "", isActive: true,
    });
    setPricingTiers([]);
    setShowApptModal(false);
  }

  function handleEditApptType(appt: SvcAppointment) {
    setEditingAppt(appt);
    const duration = appt.duration || 60;
    const isHours = duration >= 60 && duration % 60 === 0;
    setApptForm({
      title: appt.title,
      description: appt.description || "",
      type: appt.type || "",
      duration: isHours ? String(duration / 60) : String(duration),
      durationUnit: isHours ? "hours" : "minutes",
      priceDollars: appt.priceCents ? String(appt.priceCents / 100) : "",
      color: appt.color || "#6b7280",
      coachId: appt.coachId || "",
      styleId: appt.styleId || "",
      notes: appt.notes || "",
      isActive: appt.isActive !== false,
    });
    // Load existing pricing tiers for this appointment type
    const existingTiers = svcPackages
      .filter(p => p.appointmentId === appt.id)
      .map(p => ({
        id: p.id,
        sessions: String(p.sessionsIncluded),
        priceDollars: String(p.priceCents / 100),
        posEnabled: p.isActive,
        portalEnabled: p.availableOnline,
        expirationDays: p.expirationDays ? String(p.expirationDays) : "",
      }));
    setPricingTiers(existingTiers);
    setShowApptModal(true);
  }

  function addPricingTier() {
    setPricingTiers([...pricingTiers, { sessions: "1", priceDollars: "", posEnabled: true, portalEnabled: false, expirationDays: "" }]);
  }

  function updatePricingTier(index: number, field: keyof PricingTier, value: string | boolean) {
    const updated = [...pricingTiers];
    (updated[index] as any)[field] = value;
    setPricingTiers(updated);
  }

  function removePricingTier(index: number) {
    setPricingTiers(pricingTiers.filter((_, i) => i !== index));
  }

  async function handleSaveApptType(e: React.FormEvent) {
    e.preventDefault();
    if (!apptForm.title.trim()) return;

    try {
      setSavingAppt(true);
      setError(null);

      const selectedCoach = coaches.find(c => c.id === apptForm.coachId);
      const selectedStyle = styles.find(s => s.id === apptForm.styleId);
      const priceCents = apptForm.priceDollars ? Math.round(parseFloat(apptForm.priceDollars) * 100) : null;
      const durationMinutes = apptForm.durationUnit === "hours"
        ? (parseInt(apptForm.duration) || 1) * 60
        : parseInt(apptForm.duration) || 60;

      const apptData = {
        title: apptForm.title.trim(),
        description: apptForm.description.trim() || null,
        type: apptForm.type.trim() || null,
        duration: durationMinutes,
        priceCents,
        color: apptForm.color,
        coachId: apptForm.coachId || null,
        coachName: selectedCoach ? `${selectedCoach.firstName} ${selectedCoach.lastName}` : null,
        styleId: apptForm.styleId || null,
        styleName: selectedStyle ? selectedStyle.name : null,
        notes: apptForm.notes.trim() || null,
        isActive: apptForm.isActive,
      };

      // Save the appointment type
      const url = editingAppt ? `/api/appointments/${editingAppt.id}` : "/api/appointments";
      const method = editingAppt ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(apptData) });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save appointment type");
      }

      const savedAppt = await res.json();
      const apptId = savedAppt.appointment.id;

      // Save pricing tiers as service packages
      // Get existing packs for this appointment
      const existingPacks = svcPackages.filter(p => p.appointmentId === (editingAppt?.id || apptId));
      const existingIds = new Set(pricingTiers.filter(t => t.id).map(t => t.id));

      // Delete removed tiers
      for (const pack of existingPacks) {
        if (!existingIds.has(pack.id)) {
          await fetch(`/api/service-packages/${pack.id}`, { method: "DELETE" });
        }
      }

      // Create or update tiers
      for (let i = 0; i < pricingTiers.length; i++) {
        const tier = pricingTiers[i];
        if (!tier.priceDollars || !tier.sessions) continue;
        const tierPayload = {
          name: `${apptForm.title.trim()} — ${tier.sessions} session${parseInt(tier.sessions) !== 1 ? "s" : ""}`,
          description: null,
          appointmentId: apptId,
          sessionsIncluded: parseInt(tier.sessions) || 1,
          priceCents: Math.round(parseFloat(tier.priceDollars) * 100),
          expirationDays: tier.expirationDays ? parseInt(tier.expirationDays) : null,
          isActive: tier.posEnabled,
          availableOnline: tier.portalEnabled,
          sortOrder: i,
        };
        if (tier.id) {
          await fetch(`/api/service-packages/${tier.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tierPayload) });
        } else {
          await fetch("/api/service-packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tierPayload) });
        }
      }

      await loadData();
      resetApptForm();
    } catch (err: any) {
      console.error("Error saving appointment type:", err);
      setError(err.message || "Failed to save appointment type");
    } finally {
      setSavingAppt(false);
    }
  }

  async function handleDeleteApptType(appt: SvcAppointment) {
    if (!window.confirm(`Are you sure you want to delete "${appt.title}"? This will also delete any associated pricing.`)) return;
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete");
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete appointment type");
    }
  }

  function formatPrice(cents: number | null): string {
    if (cents === null) return "Free";
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  function formatContractLength(days: number | null): string {
    if (!days) return "No contract";
    if (days % 365 === 0) {
      const years = days / 365;
      return `${years} ${years === 1 ? "year" : "years"}`;
    }
    if (days % 30 === 0) {
      const months = days / 30;
      return `${months} ${months === 1 ? "month" : "months"}`;
    }
    if (days % 7 === 0) {
      const weeks = days / 7;
      return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
    }
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  function toggleStyle(styleId: string) {
    if (planAllowedStyles.includes(styleId)) {
      setPlanAllowedStyles(planAllowedStyles.filter((id) => id !== styleId));
    } else {
      setPlanAllowedStyles([...planAllowedStyles, styleId]);
    }
  }

  const activePlans = plans.filter((p) => p.isActive);
  const inactivePlans = plans.filter((p) => !p.isActive);

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Memberships</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage membership plans and assign them to members
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAssignStartDate(getTodayString());
                setShowAssignForm(true);
              }}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Assign Membership
            </button>
            <button
              onClick={() => setShowPlanForm(true)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Create Plan
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        {/* Update Confirmation Dialog */}
        {showUpdateConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Update Membership Plan
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                This plan has <span className="font-semibold text-primary">{activeMembers} active member{activeMembers !== 1 ? "s" : ""}</span>.
                How would you like to apply these changes?
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => handleUpdateConfirmChoice("both")}
                  disabled={savingPlan}
                  className="w-full rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : "Apply to Current Members & Future Sales"}
                </button>
                <button
                  onClick={() => handleUpdateConfirmChoice("current")}
                  disabled={savingPlan}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : "Apply to Current Members Only"}
                </button>
                <button
                  onClick={() => handleUpdateConfirmChoice("future")}
                  disabled={savingPlan}
                  className="w-full rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : "Apply to Future Sales Only"}
                </button>
                <button
                  onClick={handleCancelUpdateConfirm}
                  disabled={savingPlan}
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Mode Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setViewMode("plans")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              viewMode === "plans"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Membership Plans ({plans.length})
          </button>
          <button
            onClick={() => setViewMode("memberships")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              viewMode === "memberships"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Active Memberships ({memberships.filter((m) => m.status === "ACTIVE").length})
          </button>
          <button
            onClick={() => setViewMode("types")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              viewMode === "types"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Membership Types
          </button>
          <button
            onClick={() => setViewMode("services")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              viewMode === "services"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Appointments ({svcPackages.length})
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            Loading...
          </div>
        )}

        {/* Plan Form */}
        {showPlanForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingPlan ? "Edit Plan" : "Create Membership Plan"}
              </h2>
              <button
                onClick={resetPlanForm}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 border-b pb-1">Basic Information</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Plan Name <span className="text-primary">*</span>
                    </label>
                    <input
                      type="text"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Monthly Unlimited"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Membership ID #
                    </label>
                    <input
                      type="text"
                      value={planMembershipId}
                      onChange={(e) => setPlanMembershipId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Auto-generated"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Description
                    </label>
                    <input
                      type="text"
                      value={planDescription}
                      onChange={(e) => setPlanDescription(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Brief description of this plan"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Membership Type
                    </label>
                    <select
                      value={planMembershipTypeId}
                      onChange={(e) => setPlanMembershipTypeId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">No type assigned</option>
                      {membershipTypes.filter(t => t.isActive).map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 border-b pb-1">Pricing</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Price ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={planPrice}
                      onChange={(e) => setPlanPrice(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Billing Cycle
                    </label>
                    <select
                      value={planBillingCycle}
                      onChange={(e) => setPlanBillingCycle(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {BILLING_CYCLES.map((cycle) => (
                        <option key={cycle} value={cycle}>
                          {cycle === "ONE_TIME" ? "One-Time" : cycle.charAt(0) + cycle.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Purchase Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={planPurchaseLimit}
                      onChange={(e) => setPlanPurchaseLimit(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Setup/Registration Fee ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={planSetupFee}
                      onChange={(e) => setPlanSetupFee(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4 mt-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Promotion Fee Discount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={planPromotionDiscount}
                      onChange={(e) => setPlanPromotionDiscount(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., 10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Other Discount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={planOtherDiscount}
                      onChange={(e) => setPlanOtherDiscount(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., 10"
                    />
                  </div>
                </div>
              </div>

              {/* Contract Terms */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 border-b pb-1">Contract Terms</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Contract Length
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        value={planContractLength}
                        onChange={(e) => setPlanContractLength(e.target.value)}
                        className="w-11 shrink-0 rounded-md border border-gray-300 px-1.5 py-1 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="#"
                      />
                      <select
                        value={planContractUnit}
                        onChange={(e) => setPlanContractUnit(e.target.value as "days" | "weeks" | "months" | "years")}
                        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="days">{Number(planContractLength) === 1 ? "Day" : "Days"}</option>
                        <option value="weeks">{Number(planContractLength) === 1 ? "Week" : "Weeks"}</option>
                        <option value="months">{Number(planContractLength) === 1 ? "Month" : "Months"}</option>
                        <option value="years">{Number(planContractLength) === 1 ? "Year" : "Years"}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Trial Period (days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={planTrialDays}
                      onChange={(e) => setPlanTrialDays(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., 7"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Cancellation Notice (days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={planCancellationDays}
                      onChange={(e) => setPlanCancellationDays(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., 30"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Cancellation Fee ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={planCancellationFee}
                      onChange={(e) => setPlanCancellationFee(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={planAutoRenew}
                        onChange={(e) => setPlanAutoRenew(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Auto-renew after contract ends
                    </label>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={planAvailableOnline}
                        onChange={(e) => setPlanAvailableOnline(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Available for online purchase
                    </label>
                  </div>
                </div>
              </div>

              {/* Plan-Specific Contract Clauses */}
              <div>
                <div className="flex items-center justify-between mb-3 border-b pb-1">
                  <h3 className="text-sm font-semibold text-gray-700">Plan Contract Clauses</h3>
                  <button type="button" onClick={addPlanClause} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">
                    Add Clause
                  </button>
                </div>
                {planContractClauses.length === 0 ? (
                  <p className="text-xs text-gray-400">No plan-specific clauses. Global clauses still apply.</p>
                ) : (
                  <div className="space-y-3">
                    {planContractClauses.map((clause) => (
                      <div key={clause.id} className="rounded-md border border-gray-200 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="text"
                            value={clause.title}
                            onChange={(e) => updatePlanClause(clause.id, "title", e.target.value)}
                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Clause title"
                          />
                          <button type="button" onClick={() => removePlanClause(clause.id)} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                            Remove
                          </button>
                        </div>
                        <textarea
                          value={clause.content}
                          onChange={(e) => updatePlanClause(clause.id, "content", e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Clause content..."
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Access Controls */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 border-b pb-1">Access Controls</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Classes per Day
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={planClassesPerDay}
                      onChange={(e) => setPlanClassesPerDay(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Unlimited if empty"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Classes per Week
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={planClassesPerWeek}
                      onChange={(e) => setPlanClassesPerWeek(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Unlimited if empty"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Classes per Month
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={planClassesPerMonth}
                      onChange={(e) => setPlanClassesPerMonth(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Unlimited if empty"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Included Styles
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {styles.length === 0 ? (
                        <span className="text-xs text-gray-400">No styles defined</span>
                      ) : (
                        styles.map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => toggleStyle(style.id)}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              planAllowedStyles.includes(style.id)
                                ? "bg-primary text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {style.name}
                          </button>
                        ))
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {planAllowedStyles.length === 0 ? "No styles auto-assigned" : `${planAllowedStyles.length} style(s) will be auto-assigned`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Display & Promo */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-700 border-b pb-1">Display & Promotions</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Sort Order
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={planSortOrder}
                      onChange={(e) => setPlanSortOrder(e.target.value)}
                      className="w-11 rounded-md border border-gray-300 px-1.5 py-1 text-center text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="#"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Display Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={planColor}
                        onChange={(e) => setPlanColor(e.target.value)}
                        className="h-7 w-10 rounded border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={planColor}
                        onChange={(e) => setPlanColor(e.target.value)}
                        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="#c41111"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Promo Code
                    </label>
                    <input
                      type="text"
                      value={planPromoCode}
                      onChange={(e) => setPlanPromoCode(e.target.value.toUpperCase())}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., SUMMER2024"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={planIsActive}
                        onChange={(e) => setPlanIsActive(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Plan is active
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : editingPlan ? "Update Plan" : "Create Plan"}
                </button>
                <button
                  type="button"
                  onClick={resetPlanForm}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Assign Membership Form */}
        {showAssignForm && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assign Membership to Member</h2>
              <button
                onClick={resetAssignForm}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssignMembership} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Membership Plan <span className="text-primary">*</span>
                  </label>
                  <select
                    value={assignPlanId}
                    onChange={(e) => setAssignPlanId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="">Select a plan</option>
                    {activePlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - {formatPrice(plan.priceCents)}/{plan.billingCycle.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Member <span className="text-primary">*</span>
                  </label>
                  <select
                    value={assignMemberId}
                    onChange={(e) => setAssignMemberId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="">Select a member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.firstName} {member.lastName}
                        {member.email ? ` (${member.email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Start Date <span className="text-primary">*</span>
                  </label>
                  <input
                    type="date"
                    value={assignStartDate}
                    onChange={(e) => setAssignStartDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    End Date (optional)
                  </label>
                  <input
                    type="date"
                    value={assignEndDate}
                    onChange={(e) => setAssignEndDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={savingAssign}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingAssign ? "Assigning..." : "Assign Membership"}
                </button>
                <button
                  type="button"
                  onClick={resetAssignForm}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Plans View */}
        {!loading && viewMode === "plans" && (
          <>
            {plans.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  No membership plans yet. Create your first plan to get started.
                </p>
                <button
                  onClick={() => setShowPlanForm(true)}
                  className="mt-4 inline-block rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Create First Plan
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active Plans */}
                {activePlans.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-700">
                      Active Plans ({activePlans.length})
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Plan Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Price
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Billing
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Contract
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Members
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {activePlans.map((plan) => {
                            const activeCount = plan.memberships?.filter(
                              (m) => m.status === "ACTIVE"
                            ).length || 0;
                            return (
                              <tr key={plan.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    {plan.color && (
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: plan.color }}
                                      />
                                    )}
                                    <div>
                                      <div className="font-medium text-gray-900">{plan.name}</div>
                                      {plan.description && (
                                        <div className="text-xs text-gray-500">{plan.description}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  <div>{formatPrice(plan.priceCents)}</div>
                                  {plan.setupFeeCents && (
                                    <div className="text-[10px] text-gray-400">
                                      +{formatPrice(plan.setupFeeCents)} setup
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {plan.billingCycle === "ONE_TIME" ? "One-Time" : plan.billingCycle.charAt(0) + plan.billingCycle.slice(1).toLowerCase()}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {formatContractLength(plan.contractLengthMonths)}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                    {activeCount} active
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1">
                                    <button
                                      onClick={() => handleDuplicatePlan(plan)}
                                      className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                      title="Duplicate this plan"
                                    >
                                      Duplicate
                                    </button>
                                    <button
                                      onClick={() => handleEditPlan(plan)}
                                      className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeletePlan(plan)}
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
                  </div>
                )}

                {/* Inactive Plans */}
                {inactivePlans.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-500">
                      Inactive Plans ({inactivePlans.length})
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Plan Name
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Price
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                              Billing
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {inactivePlans.map((plan) => (
                            <tr key={plan.id} className="hover:bg-gray-50 opacity-60">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{plan.name}</div>
                                {plan.description && (
                                  <div className="text-xs text-gray-500">{plan.description}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {formatPrice(plan.priceCents)}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {plan.billingCycle === "ONE_TIME" ? "One-Time" : plan.billingCycle.charAt(0) + plan.billingCycle.slice(1).toLowerCase()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    onClick={() => handleEditPlan(plan)}
                                    className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeletePlan(plan)}
                                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Global Contract Clauses */}
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Contract Clauses</h3>
                    <p className="text-xs text-gray-500 mt-0.5">These clauses appear on all membership and service contracts at point of sale.</p>
                  </div>
                  <button
                    onClick={() => openClauseForm()}
                    disabled={savingClauses}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    Add Clause
                  </button>
                </div>

                {globalContractClauses.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                    <p className="text-xs text-gray-400">No contract clauses defined. Add clauses to include in sale contracts.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {globalContractClauses.map((clause) => (
                      <div key={clause.id} className="rounded-md border border-gray-200 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="text-xs font-semibold text-gray-800">{clause.title}</h4>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openClauseForm(clause)}
                              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteClause(clause.id)}
                              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap">{clause.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Clause Add/Edit Form */}
                {showClauseForm && (
                  <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-4">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">
                      {editingClause ? "Edit Clause" : "New Clause"}
                    </h4>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={clauseTitle}
                        onChange={(e) => setClauseTitle(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Clause title (e.g., Payment Terms)"
                      />
                      <textarea
                        value={clauseContent}
                        onChange={(e) => setClauseContent(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Clause content..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveClause}
                          disabled={!clauseTitle.trim() || !clauseContent.trim()}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                        >
                          {editingClause ? "Save Changes" : "Add Clause"}
                        </button>
                        <button
                          onClick={() => { setShowClauseForm(false); setEditingClause(null); setClauseTitle(""); setClauseContent(""); }}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Memberships View */}
        {!loading && viewMode === "memberships" && (
          <>
            {memberships.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  No memberships assigned yet. Assign a membership plan to a member to get started.
                </p>
                <button
                  onClick={() => {
                    setAssignStartDate(getTodayString());
                    setShowAssignForm(true);
                  }}
                  className="mt-4 inline-block rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Assign First Membership
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        Member
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        Plan
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        Start Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        End Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        Status
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {memberships.map((membership) => (
                      <tr key={membership.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {membership.member ? (
                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/members/${membership.member.id}`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {membership.member.firstName} {membership.member.lastName}
                                </Link>
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                    membership.member.status === "ACTIVE"
                                      ? "bg-primary/10 text-primary"
                                      : membership.member.status === "PROSPECT"
                                      ? "bg-blue-100 text-blue-700"
                                      : membership.member.status === "INACTIVE"
                                      ? "bg-gray-100 text-gray-600"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {membership.member.status}
                                </span>
                              </div>
                              {membership.member.email && (
                                <div className="text-xs text-gray-500">
                                  {membership.member.email}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Unknown member</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {membership.membershipPlan?.name || "Unknown plan"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatDate(membership.startDate)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {membership.endDate ? formatDate(membership.endDate) : "Ongoing"}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={membership.status}
                            onChange={(e) =>
                              handleUpdateMembershipStatus(membership, e.target.value)
                            }
                            className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 focus:ring-2 focus:ring-primary ${
                              membership.status === "ACTIVE"
                                ? "bg-primary/10 text-primary"
                                : membership.status === "PAUSED"
                                ? "bg-yellow-100 text-yellow-700"
                                : membership.status === "CANCELED"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {MEMBERSHIP_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status.charAt(0) + status.slice(1).toLowerCase()}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteMembership(membership)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Membership Types View */}
        {!loading && viewMode === "types" && (
          <>
            {/* Type Form */}
            {showTypeForm && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {editingType ? "Edit Type" : "Create Membership Type"}
                  </h2>
                  <button
                    onClick={resetTypeForm}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveType} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Type Name <span className="text-primary">*</span>
                      </label>
                      <input
                        type="text"
                        value={typeName}
                        onChange={(e) => setTypeName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="e.g., Monthly, Paid in Full, Trial"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Description
                      </label>
                      <input
                        type="text"
                        value={typeDescription}
                        onChange={(e) => setTypeDescription(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Optional description"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={typeColor}
                          onChange={(e) => setTypeColor(e.target.value)}
                          className="h-7 w-10 rounded border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={typeColor}
                          onChange={(e) => setTypeColor(e.target.value)}
                          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="#c41111"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Sort Order
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={typeSortOrder}
                          onChange={(e) => setTypeSortOrder(e.target.value)}
                          className="w-14 rounded-md border border-gray-300 px-2 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={typeIsActive}
                            onChange={(e) => setTypeIsActive(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button
                      type="submit"
                      disabled={savingType}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                    >
                      {savingType ? "Saving..." : editingType ? "Update Type" : "Create Type"}
                    </button>
                    <button
                      type="button"
                      onClick={resetTypeForm}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Add Type Button */}
            {!showTypeForm && (
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => setShowTypeForm(true)}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Add Type
                </button>
              </div>
            )}

            {/* Types List */}
            {membershipTypes.length === 0 ? (
              <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  No membership types defined yet. Create types like &quot;Monthly&quot;, &quot;Paid in Full&quot;, or &quot;Trial&quot; for reporting.
                </p>
                <button
                  onClick={() => setShowTypeForm(true)}
                  className="mt-4 inline-block rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Create First Type
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-12 px-2 py-2 text-center text-xs font-semibold text-gray-600">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        Type Name
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">
                        Description
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">
                        Plans Using
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">
                        Status
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {membershipTypes.map((type) => (
                      <tr
                        key={type.id}
                        className={`hover:bg-gray-50 ${!type.isActive ? "opacity-60" : ""} ${draggedTypeId === type.id ? "opacity-50 bg-gray-100" : ""}`}
                        onDragOver={handleTypeDragOver}
                        onDrop={(e) => handleTypeDrop(e, type.id)}
                        onDragEnd={handleTypeDragEnd}
                      >
                        <td className="w-12 px-2 py-3 text-center text-xs text-gray-400">
                          {type.sortOrder}
                        </td>
                        <td className="px-4 py-3">
                          <div
                            className="flex items-center gap-2 cursor-grab active:cursor-grabbing"
                            draggable
                            onDragStart={(e) => handleTypeDragStart(e, type.id)}
                          >
                            {type.color && (
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: type.color }}
                              />
                            )}
                            <span className="font-medium text-gray-900">{type.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {type.description || "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {type._count?.membershipPlans || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              type.isActive
                                ? "bg-primary/10 text-primary"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {type.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleEditType(type)}
                              className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteType(type)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Appointments View */}
        {!loading && viewMode === "services" && (
          <>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Appointment Types</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Define services, set pricing tiers, and manage sales channels</p>
                </div>
                <button
                  onClick={() => { resetApptForm(); setShowApptModal(true); }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark whitespace-nowrap"
                >
                  New Appointment
                </button>
              </div>

              {svcAppointments.length === 0 ? (
                <div className="rounded-md border border-gray-100 bg-gray-50 p-4 text-center">
                  <p className="text-xs text-gray-500">No appointment types yet. Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {svcAppointments.map((appt) => {
                    const apptPacks = svcPackages.filter(p => p.appointmentId === appt.id);
                    const isExpanded = expandedApptId === appt.id;
                    return (
                      <div key={appt.id} className={`border-b border-gray-100 last:border-b-0 ${!appt.isActive ? "opacity-50" : ""}`}>
                        {/* Appointment type row */}
                        <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedApptId(isExpanded ? null : appt.id)}>
                          <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: appt.color || "#6b7280" }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-900">{appt.title}</span>
                              <span className="text-[10px] text-gray-400">{appt.duration} min</span>
                              {appt.coachName && <span className="text-[10px] text-gray-400">| {appt.coachName}</span>}
                              {appt.styleName && <span className="text-[10px] text-gray-400">| {appt.styleName}</span>}
                            </div>
                            {appt.description && <p className="text-[10px] text-gray-400 truncate max-w-[300px]">{appt.description}</p>}
                          </div>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${appt.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {appt.isActive ? "Active" : "Inactive"}
                          </span>
                          <span className="text-[10px] text-gray-400">{apptPacks.length} {apptPacks.length === 1 ? "tier" : "tiers"}</span>
                          <button onClick={(e) => { e.stopPropagation(); handleEditApptType(appt); }} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark">Edit</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteApptType(appt); }} className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">Delete</button>
                          <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}>&#9660;</span>
                        </div>

                        {/* Expanded pricing tiers */}
                        {isExpanded && (
                          <div className="bg-gray-50 px-3 pb-3 pt-1">
                            {apptPacks.length === 0 ? (
                              <p className="text-[10px] text-gray-400 py-2 text-center">No pricing tiers. Edit this appointment to add pricing.</p>
                            ) : (
                              <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 text-left">
                                    <tr>
                                      <th className="px-3 py-1.5 font-semibold text-gray-600 text-center">Sessions</th>
                                      <th className="px-3 py-1.5 font-semibold text-gray-600 text-right">Price</th>
                                      <th className="px-3 py-1.5 font-semibold text-gray-600 text-right">Per Session</th>
                                      <th className="px-3 py-1.5 font-semibold text-gray-600 text-center">Expires</th>
                                      <th className="px-3 py-1.5 font-semibold text-gray-600 text-center">POS</th>
                                      <th className="px-3 py-1.5 font-semibold text-gray-600 text-center">Portal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {apptPacks.map(pkg => (
                                      <tr key={pkg.id}>
                                        <td className="px-3 py-1.5 text-center font-medium">{pkg.sessionsIncluded}</td>
                                        <td className="px-3 py-1.5 text-right">${(pkg.priceCents / 100).toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-right text-gray-500">${(pkg.priceCents / pkg.sessionsIncluded / 100).toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-center text-gray-500">{pkg.expirationDays ? `${pkg.expirationDays}d` : "—"}</td>
                                        <td className="px-3 py-1.5 text-center">{pkg.isActive ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}</td>
                                        <td className="px-3 py-1.5 text-center">{pkg.availableOnline ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Appointment Type Modal */}
        {showApptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editingAppt ? "Edit Appointment Type" : "New Appointment Type"}
              </h2>

              <form onSubmit={handleSaveApptType} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                    <input type="text" value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })}
                      placeholder="e.g., Personal Training"
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input type="text" value={apptForm.description} onChange={(e) => setApptForm({ ...apptForm, description: e.target.value })}
                      placeholder="Brief description of this service"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min="1" value={apptForm.duration}
                        onChange={(e) => setApptForm({ ...apptForm, duration: e.target.value })}
                        className="w-20 rounded-md border border-gray-300 px-2 py-2 text-sm text-center" />
                      <select value={apptForm.durationUnit}
                        onChange={(e) => setApptForm({ ...apptForm, durationUnit: e.target.value as "minutes" | "hours" })}
                        className="rounded-md border border-gray-300 px-2 py-2 text-sm">
                        <option value="minutes">Min</option>
                        <option value="hours">Hr</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Price ($)</label>
                    <input type="number" min="0" step="0.01" value={apptForm.priceDollars}
                      onChange={(e) => setApptForm({ ...apptForm, priceDollars: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Style</label>
                    <select value={apptForm.styleId}
                      onChange={(e) => setApptForm({ ...apptForm, styleId: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                      <option value="">None</option>
                      {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Coach</label>
                    <select value={apptForm.coachId}
                      onChange={(e) => setApptForm({ ...apptForm, coachId: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                      <option value="">None</option>
                      {coaches.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    <input type="color" value={apptForm.color}
                      onChange={(e) => setApptForm({ ...apptForm, color: e.target.value })}
                      className="h-8 w-10 cursor-pointer rounded border border-gray-300" />
                  </div>
                  <div className="pt-5">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={apptForm.isActive}
                        onChange={(e) => setApptForm({ ...apptForm, isActive: e.target.checked })}
                        className="accent-primary" />
                      Active
                    </label>
                  </div>
                </div>

                {/* Pricing Tiers */}
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Pricing</h3>
                      <p className="text-xs text-gray-400">Set volume pricing — e.g., 1 session @ $80, 5 sessions @ $350</p>
                    </div>
                    <button type="button" onClick={addPricingTier}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                      Add Tier
                    </button>
                  </div>

                  {pricingTiers.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-md">
                      No pricing tiers. Click &quot;Add Tier&quot; to set up volume pricing.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-500 px-1">
                        <div className="col-span-2">Sessions</div>
                        <div className="col-span-2">Price ($)</div>
                        <div className="col-span-2">Per Session</div>
                        <div className="col-span-2">Expires (days)</div>
                        <div className="col-span-1 text-center">POS</div>
                        <div className="col-span-1 text-center">Portal</div>
                        <div className="col-span-2"></div>
                      </div>
                      {pricingTiers.map((tier, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-2">
                            <input type="number" min="1" value={tier.sessions}
                              onChange={(e) => updatePricingTier(i, "sessions", e.target.value)}
                              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-center" />
                          </div>
                          <div className="col-span-2">
                            <input type="number" min="0" step="0.01" value={tier.priceDollars}
                              onChange={(e) => updatePricingTier(i, "priceDollars", e.target.value)}
                              placeholder="0.00"
                              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
                          </div>
                          <div className="col-span-2 text-xs text-gray-500 text-center">
                            {tier.priceDollars && tier.sessions && parseInt(tier.sessions) > 0
                              ? `$${(parseFloat(tier.priceDollars) / parseInt(tier.sessions)).toFixed(2)}`
                              : "—"}
                          </div>
                          <div className="col-span-2">
                            <input type="number" min="1" value={tier.expirationDays}
                              onChange={(e) => updatePricingTier(i, "expirationDays", e.target.value)}
                              placeholder="No exp."
                              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-center" />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <input type="checkbox" checked={tier.posEnabled}
                              onChange={(e) => updatePricingTier(i, "posEnabled", e.target.checked)}
                              className="accent-primary" />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <input type="checkbox" checked={tier.portalEnabled}
                              onChange={(e) => updatePricingTier(i, "portalEnabled", e.target.checked)}
                              className="accent-primary" />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <button type="button" onClick={() => removePricingTier(i)}
                              className="text-xs text-red-500 hover:underline">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button type="submit" disabled={savingAppt || !apptForm.title.trim()}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
                    {savingAppt ? "Saving..." : editingAppt ? "Save Changes" : "Create Appointment"}
                  </button>
                  <button type="button" onClick={resetApptForm}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
