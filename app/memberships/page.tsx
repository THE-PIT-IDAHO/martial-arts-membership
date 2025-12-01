"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

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
  trialDays: number | null;
  promoCode: string | null;
  cancellationNoticeDays: number | null;
  cancellationFeeCents: number | null;
  sortOrder: number;
  color: string | null;
  isActive: boolean;
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
  const [planFamilyDiscount, setPlanFamilyDiscount] = useState("");
  const [planTrialDays, setPlanTrialDays] = useState("");
  const [planPromoCode, setPlanPromoCode] = useState("");
  const [planCancellationDays, setPlanCancellationDays] = useState("");
  const [planCancellationFee, setPlanCancellationFee] = useState("");
  const [planSortOrder, setPlanSortOrder] = useState("0");
  const [planColor, setPlanColor] = useState("#c41111");
  const [planIsActive, setPlanIsActive] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);

  // Update confirmation dialog state
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [pendingUpdateBody, setPendingUpdateBody] = useState<any>(null);
  const [activeMembers, setActiveMembers] = useState<number>(0);

  // Assign membership state
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignPlanId, setAssignPlanId] = useState("");
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [savingAssign, setSavingAssign] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<"plans" | "memberships" | "types">("plans");

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [plansRes, membershipsRes, membersRes, stylesRes, typesRes] = await Promise.all([
        fetch("/api/membership-plans"),
        fetch("/api/memberships"),
        fetch("/api/members"),
        fetch("/api/styles"),
        fetch("/api/membership-types"),
      ]);

      if (!plansRes.ok) throw new Error("Failed to load membership plans");

      const plansData = await plansRes.json();
      const membershipsData = membershipsRes.ok ? await membershipsRes.json() : { memberships: [] };
      const membersData = membersRes.ok ? await membersRes.json() : { members: [] };
      const stylesData = stylesRes.ok ? await stylesRes.json() : { styles: [] };
      const typesData = typesRes.ok ? await typesRes.json() : { membershipTypes: [] };

      setPlans(plansData.membershipPlans || []);
      setMemberships(membershipsData.memberships || []);
      setMembers(membersData.members || []);
      setStyles(stylesData.styles || []);
      setMembershipTypes(typesData.membershipTypes || []);
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
    setPlanFamilyDiscount("");
    setPlanTrialDays("");
    setPlanPromoCode("");
    setPlanCancellationDays("");
    setPlanCancellationFee("");
    setPlanSortOrder("0");
    setPlanColor("#c41111");
    setPlanIsActive(true);
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
    setPlanFamilyDiscount(plan.familyDiscountPercent ? String(plan.familyDiscountPercent) : "");
    setPlanTrialDays(plan.trialDays ? String(plan.trialDays) : "");
    setPlanPromoCode(plan.promoCode || "");
    setPlanCancellationDays(plan.cancellationNoticeDays ? String(plan.cancellationNoticeDays) : "");
    setPlanCancellationFee(plan.cancellationFeeCents ? String(plan.cancellationFeeCents / 100) : "");
    setPlanSortOrder(String(plan.sortOrder || 0));
    setPlanColor(plan.color || "#c41111");
    setPlanIsActive(plan.isActive);
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
      familyDiscountPercent: planFamilyDiscount ? Number(planFamilyDiscount) : null,
      trialDays: planTrialDays ? Number(planTrialDays) : null,
      promoCode: planPromoCode.trim() || null,
      cancellationNoticeDays: planCancellationDays ? Number(planCancellationDays) : null,
      cancellationFeeCents,
      sortOrder: planSortOrder ? Number(planSortOrder) : 0,
      color: planColor || null,
      isActive: planIsActive,
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
      resetAssignForm();
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Memberships</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage membership plans and assign them to members
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAssignForm(true)}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
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
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : "Apply to Current Members & Future Sales"}
                </button>
                <button
                  onClick={() => handleUpdateConfirmChoice("current")}
                  disabled={savingPlan}
                  className="w-full rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  {savingPlan ? "Saving..." : "Apply to Current Members Only"}
                </button>
                <button
                  onClick={() => handleUpdateConfirmChoice("future")}
                  disabled={savingPlan}
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
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
                    <div className="mt-2">
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
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Family Discount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={planFamilyDiscount}
                      onChange={(e) => setPlanFamilyDiscount(e.target.value)}
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
                </div>
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
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                    {activeCount} active
                                  </span>
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
                  onClick={() => setShowAssignForm(true)}
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
                              <div className="font-medium text-gray-900">
                                {membership.member.firstName} {membership.member.lastName}
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
                                ? "bg-green-100 text-green-700"
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
                                ? "bg-green-100 text-green-700"
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
      </div>
    </AppLayout>
  );
}
