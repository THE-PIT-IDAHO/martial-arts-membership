"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { serializePaymentMethod } from "@/lib/payment-utils";
import { getTodayString } from "@/lib/dates";
import jsPDF from "jspdf";

type POSItemVariant = {
  id: string;
  size: string | null;
  color: string | null;
  quantity: number;
  sku: string | null;
};

type POSItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  priceCents: number;
  quantity: number;
  category: string | null;
  isActive: boolean;
  sizes: string | null;
  colors: string | null;
  variantLabel1: string | null;
  variantLabel2: string | null;
  itemType: string | null;
  variants: POSItemVariant[];
};

type MembershipPlan = {
  id: string;
  membershipId: string | null;
  name: string;
  description: string | null;
  priceCents: number | null;
  setupFeeCents: number | null;
  billingCycle: string;
  contractLengthMonths: number | null; // Actually stores days
  cancellationNoticeDays: number | null;
  cancellationFeeCents: number | null;
  contractClauses: string | null;
  allowedStyles: string | null;
  isActive: boolean;
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  memberNumber: number | null;
  status: string;
  accountCreditCents: number;
};

type ServicePackage = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  sessionsIncluded: number;
  expirationDays: number | null;
  isActive: boolean;
  appointmentId: string | null;
  appointment: { id: string; title: string } | null;
};

type CartItem = {
  id: string;
  type: "product" | "membership" | "credit" | "gift" | "service";
  itemId?: string;
  membershipPlanId?: string;
  servicePackageId?: string;
  itemName: string;
  itemSku?: string | null;
  unitPriceCents: number;
  quantity: number;
  // Membership-specific fields
  customPriceCents?: number;
  membershipStartDate?: string;
  membershipEndDate?: string;
  firstMonthDiscountOnly?: boolean;
  // Gift certificate fields
  recipientName?: string;
  // Variant selection
  selectedSize?: string | null;
  selectedColor?: string | null;
  // Per-item discount
  discountType?: "percent" | "amount";
  discountValue?: number; // percent (0-100) or cents
};

type MembershipConfig = {
  startDate: string;
  isRecurring: boolean;
  durationValue: number;
  durationUnit: "days" | "weeks" | "months" | "years";
  customPrice: string;
  discountType: "percent" | "amount";
  discountValue: string;
  firstMonthDiscountOnly: boolean;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseCents(dollars: string): number {
  const num = parseFloat(dollars.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num * 100);
}

export default function POSPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"checkout" | "items" | "history">("checkout");

  // Items and plans
  const [items, setItems] = useState<POSItem[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [servicePackages, setServicePackages] = useState<ServicePackage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and filters
  const [itemSearch, setItemSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [catalogTab, setCatalogTab] = useState<"products" | "memberships" | "credit" | "gift" | "services">("products");

  // Account credit / gift certificate
  const [creditAmount, setCreditAmount] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftRecipient, setGiftRecipient] = useState("");

  // Gift certificate redemption
  const [showRedeemGift, setShowRedeemGift] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemingGift, setRedeemingGift] = useState(false);
  const [redeemedGift, setRedeemedGift] = useState<{ code: string; balanceCents: number; appliedCents: number } | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  // Payment splits
  type PaymentSplitEntry = {
    id: string;
    method: "CASH" | "CARD" | "CHECK" | "ACCOUNT";
    amountCents: number;
    label: string;
  };
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitEntry[]>([
    { id: crypto.randomUUID(), method: "CASH", amountCents: 0, label: "" },
  ]);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [notes, setNotes] = useState("");

  // Discounts (per section)
  const [productDiscountType, setProductDiscountType] = useState<"percent" | "amount">("percent");
  const [productDiscountValue, setProductDiscountValue] = useState("");

  // Section discount visibility
  const [showProductDiscount, setShowProductDiscount] = useState(false);

  // Membership configuration modal
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [selectedPlanForConfig, setSelectedPlanForConfig] = useState<MembershipPlan | null>(null);
  const [membershipConfig, setMembershipConfig] = useState<MembershipConfig>({
    startDate: getTodayString(),
    isRecurring: true,
    durationValue: 1,
    durationUnit: "months",
    customPrice: "",
    discountType: "percent",
    discountValue: "",
    firstMonthDiscountOnly: false,
  });

  // Tax rate (from account settings, applied to goods only)
  const [taxRate, setTaxRate] = useState(0);

  // Variant picker
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [variantPickerItem, setVariantPickerItem] = useState<POSItem | null>(null);
  const [pickerSize, setPickerSize] = useState<string | null>(null);
  const [pickerColor, setPickerColor] = useState<string | null>(null);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{ id: string; transactionNumber: string } | null>(null);

  // Payment processor integration
  const [activeProcessor, setActiveProcessor] = useState<string | null>(null);
  const [stripePolling, setStripePolling] = useState(false);

  // Track if we've applied URL params
  const [urlParamsApplied, setUrlParamsApplied] = useState(false);

  // Contract signing state
  type ContractClause = { id: string; title: string; content: string };
  const [showContractSigning, setShowContractSigning] = useState(false);
  const [contractSigning, setContractSigning] = useState(false);
  const [globalContractClauses, setGlobalContractClauses] = useState<ContractClause[]>([]);
  const [gymName, setGymName] = useState("");
  const [gymLogo, setGymLogo] = useState("");
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Apply URL params after members are loaded
  useEffect(() => {
    if (!loading && members.length > 0 && !urlParamsApplied) {
      const memberId = searchParams.get("memberId");
      const tab = searchParams.get("tab");

      if (memberId) {
        const member = members.find(m => m.id === memberId);
        if (member) {
          setSelectedMember(member);
        }
      }

      if (tab === "membership") {
        setCatalogTab("memberships");
      } else if (tab === "services") {
        setCatalogTab("services");
      }

      setUrlParamsApplied(true);
    }
  }, [loading, members, searchParams, urlParamsApplied]);

  async function fetchData() {
    setLoading(true);
    try {
      const [itemsRes, plansRes, membersRes, settingsRes, svcRes] = await Promise.all([
        fetch("/api/pos/items"),
        fetch("/api/membership-plans"),
        fetch("/api/members"),
        fetch("/api/settings"),
        fetch("/api/service-packages"),
      ]);

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.items || []);
      }
      if (plansRes.ok) {
        const data = await plansRes.json();
        setMembershipPlans(data.membershipPlans || []);
      }
      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members || []);
      }
      if (svcRes.ok) {
        const data = await svcRes.json();
        setServicePackages((data.servicePackages || []).filter((p: ServicePackage) => p.isActive));
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.settings && Array.isArray(data.settings)) {
          const settingsMap = new Map<string, string>(data.settings.map((s: { key: string; value: string }) => [s.key, s.value]));
          const taxVal = settingsMap.get("taxRate");
          if (taxVal) setTaxRate(Number(taxVal) || 0);
          // Load gym branding for contract PDFs
          const gn = settingsMap.get("gymName");
          if (gn) setGymName(gn);
          const gl = settingsMap.get("gymLogo");
          if (gl) setGymLogo(gl);
          // Load global contract clauses
          const cc = settingsMap.get("contract_clauses");
          if (cc) { try { setGlobalContractClauses(JSON.parse(cc)); } catch { /* ignore */ } }
          // Determine active payment processor
          const proc = settingsMap.get("payment_active_processor") as string | undefined;
          if (proc && proc !== "none") {
            setActiveProcessor(proc as string);
          } else if (
            settingsMap.get("payment_stripe_enabled") === "true" &&
            settingsMap.get("payment_stripe_secret_key")
          ) {
            setActiveProcessor("stripe"); // backward compat
          } else if (settingsMap.get("payment_paypal_enabled") === "true") {
            setActiveProcessor("paypal");
          } else if (settingsMap.get("payment_square_enabled") === "true") {
            setActiveProcessor("square");
          } else {
            setActiveProcessor(null);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories
  const categories = [...new Set(items.filter(i => i.category).map(i => i.category!))].sort();

  // Filter items
  const filteredItems = items.filter(item => {
    if (!item.isActive) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (itemSearch) {
      const search = itemSearch.toLowerCase();
      return (
        item.name.toLowerCase().includes(search) ||
        item.sku?.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Filter membership plans
  const filteredPlans = membershipPlans.filter(plan => {
    if (!plan.isActive) return false;
    if (itemSearch) {
      const search = itemSearch.toLowerCase();
      return (
        plan.name.toLowerCase().includes(search) ||
        plan.membershipId?.toLowerCase().includes(search) ||
        plan.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Filter service packages
  const filteredServicePackages = servicePackages.filter(pkg => {
    if (itemSearch) {
      const search = itemSearch.toLowerCase();
      return (
        pkg.name.toLowerCase().includes(search) ||
        pkg.description?.toLowerCase().includes(search) ||
        pkg.appointment?.title?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Filter members
  const filteredMembers = members.filter(member => {
    if (memberSearch) {
      const search = memberSearch.toLowerCase();
      return (
        member.firstName.toLowerCase().includes(search) ||
        member.lastName.toLowerCase().includes(search) ||
        member.email?.toLowerCase().includes(search) ||
        member.phone?.includes(search) ||
        member.memberNumber?.toString().includes(search)
      );
    }
    return true;
  }).slice(0, 10);

  // Get total stock for an item (sum of variants or base quantity)
  function getTotalStock(item: POSItem): number {
    if (item.variants && item.variants.length > 0) {
      return item.variants.reduce((sum, v) => sum + v.quantity, 0);
    }
    return item.quantity;
  }

  // Check if item has variant options
  function hasVariants(item: POSItem): boolean {
    const sizesArr = item.sizes ? (typeof item.sizes === "string" ? JSON.parse(item.sizes) : item.sizes) : [];
    const colorsArr = item.colors ? (typeof item.colors === "string" ? JSON.parse(item.colors) : item.colors) : [];
    return sizesArr.length > 0 || colorsArr.length > 0;
  }

  // Open variant picker or add directly
  function handleProductClick(item: POSItem) {
    if (hasVariants(item)) {
      const sizesArr: string[] = item.sizes ? (typeof item.sizes === "string" ? JSON.parse(item.sizes) : item.sizes) : [];
      const colorsArr: string[] = item.colors ? (typeof item.colors === "string" ? JSON.parse(item.colors) : item.colors) : [];
      setVariantPickerItem(item);
      setPickerSize(sizesArr.length > 0 ? sizesArr[0] : null);
      setPickerColor(colorsArr.length > 0 ? colorsArr[0] : null);
      setShowVariantPicker(true);
    } else {
      addProductToCart(item, null, null);
    }
  }

  // Add product to cart with optional variant
  function addProductToCart(item: POSItem, selectedSize: string | null, selectedColor: string | null) {
    // Build display name with variant info
    const variantParts = [selectedSize, selectedColor].filter(Boolean);
    const displayName = variantParts.length > 0
      ? `${item.name} (${variantParts.join(" / ")})`
      : item.name;

    // Check for existing cart item with same item + variant
    const existingIndex = cart.findIndex(c =>
      c.type === "product" &&
      c.itemId === item.id &&
      (c.selectedSize || null) === (selectedSize || null) &&
      (c.selectedColor || null) === (selectedColor || null)
    );

    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          id: crypto.randomUUID(),
          type: "product",
          itemId: item.id,
          itemName: displayName,
          itemSku: item.sku,
          unitPriceCents: item.priceCents,
          quantity: 1,
          selectedSize,
          selectedColor,
        },
      ]);
    }
  }

  // Get variant stock for a specific size/color combo
  function getVariantStock(item: POSItem, size: string | null, color: string | null): number {
    if (!item.variants || item.variants.length === 0) return item.quantity;
    const variant = item.variants.find(
      (v) => (v.size || null) === (size || null) && (v.color || null) === (color || null)
    );
    return variant ? variant.quantity : 0;
  }

  // Open membership configuration modal
  function openMembershipConfig(plan: MembershipPlan) {
    if (!selectedMember) {
      alert("Please select a member first before adding a membership.");
      return;
    }
    setSelectedPlanForConfig(plan);
    const totalPrice = (plan.priceCents || 0) + (plan.setupFeeCents || 0);

    // Check if this is a one-time payment
    const cycle = plan.billingCycle?.toUpperCase() || "MONTHLY";
    const isOneTime = cycle === "ONE_TIME";

    // Set default duration based on billing cycle or contract length from plan
    let durationValue = 1;
    let durationUnit: "days" | "weeks" | "months" | "years" = "months";
    let isRecurring = !isOneTime; // One-time payments are not recurring

    // If plan has contract length (stored as days), use it
    if (plan.contractLengthMonths) {
      const days = plan.contractLengthMonths;
      if (days % 365 === 0) {
        durationValue = days / 365;
        durationUnit = "years";
      } else if (days % 30 === 0) {
        durationValue = days / 30;
        durationUnit = "months";
      } else if (days % 7 === 0) {
        durationValue = days / 7;
        durationUnit = "weeks";
      } else {
        durationValue = days;
        durationUnit = "days";
      }
    } else {
      // Fall back to billing cycle for duration unit
      if (cycle === "WEEKLY") {
        durationUnit = "weeks";
      } else if (cycle === "MONTHLY") {
        durationUnit = "months";
      } else if (cycle === "QUARTERLY") {
        durationValue = 3;
        durationUnit = "months";
      } else if (cycle === "SEMI_ANNUALLY" || cycle === "SEMI-ANNUALLY" || cycle === "SEMIANNUALLY") {
        durationValue = 6;
        durationUnit = "months";
      } else if (cycle === "YEARLY" || cycle === "ANNUALLY") {
        durationUnit = "years";
      } else if (cycle === "DAILY") {
        durationUnit = "days";
      }
    }

    setMembershipConfig({
      startDate: getTodayString(),
      isRecurring,
      durationValue,
      durationUnit,
      customPrice: (totalPrice / 100).toFixed(2),
      discountType: "percent",
      discountValue: "",
      firstMonthDiscountOnly: false,
    });
    setShowMembershipModal(true);
  }

  // Calculate end date from start date and duration
  function calculateEndDate(startDate: string, value: number, unit: string): string {
    const date = new Date(startDate);
    switch (unit) {
      case "days":
        date.setDate(date.getDate() + value);
        break;
      case "weeks":
        date.setDate(date.getDate() + value * 7);
        break;
      case "months":
        date.setMonth(date.getMonth() + value);
        break;
      case "years":
        date.setFullYear(date.getFullYear() + value);
        break;
    }
    return date.toISOString().split("T")[0];
  }

  // Add membership to cart from modal
  function addMembershipToCart() {
    if (!selectedPlanForConfig) return;

    const plan = selectedPlanForConfig;
    const basePriceCents = (plan.priceCents || 0) + (plan.setupFeeCents || 0);

    let finalPriceCents = parseCents(membershipConfig.customPrice);

    // Apply discount if specified
    if (membershipConfig.discountValue) {
      if (membershipConfig.discountType === "percent") {
        const discountPct = parseFloat(membershipConfig.discountValue);
        if (!isNaN(discountPct) && discountPct > 0) {
          finalPriceCents = Math.round(finalPriceCents * (1 - discountPct / 100));
        }
      } else {
        const discountAmountCents = parseCents(membershipConfig.discountValue);
        if (discountAmountCents > 0) {
          finalPriceCents = Math.max(0, finalPriceCents - discountAmountCents);
        }
      }
    }

    // Only calculate end date if not recurring
    const endDate = membershipConfig.isRecurring
      ? undefined
      : calculateEndDate(
          membershipConfig.startDate,
          membershipConfig.durationValue,
          membershipConfig.durationUnit
        );

    setCart([
      ...cart,
      {
        id: crypto.randomUUID(),
        type: "membership",
        membershipPlanId: plan.id,
        itemName: plan.name,
        unitPriceCents: finalPriceCents,
        quantity: 1,
        customPriceCents: finalPriceCents !== basePriceCents ? finalPriceCents : undefined,
        membershipStartDate: membershipConfig.startDate,
        membershipEndDate: endDate,
        firstMonthDiscountOnly: membershipConfig.firstMonthDiscountOnly,
      },
    ]);

    setShowMembershipModal(false);
    setSelectedPlanForConfig(null);
  }

  // Update cart item quantity
  function updateCartQuantity(cartId: string, quantity: number) {
    if (quantity <= 0) {
      setCart(cart.filter(c => c.id !== cartId));
    } else {
      setCart(cart.map(c => c.id === cartId ? { ...c, quantity } : c));
    }
  }

  // Remove from cart
  function removeFromCart(cartId: string) {
    setCart(cart.filter(c => c.id !== cartId));
  }

  // Calculate per-item discount for a cart item
  function getItemDiscountCents(item: CartItem): number {
    if (!item.discountType || !item.discountValue) return 0;
    const lineTotal = item.unitPriceCents * item.quantity;
    if (item.discountType === "percent") {
      return Math.round(lineTotal * item.discountValue / 100);
    }
    return Math.min(item.discountValue, lineTotal);
  }

  // Split cart into sections
  const serviceItems = cart.filter(item => item.type === "membership" || item.type === "credit" || item.type === "gift" || item.type === "service");
  const productItems = cart.filter(item => item.type === "product");

  // Calculate per-section totals
  function calcSection(items: CartItem[], discType: "percent" | "amount", discVal: string) {
    const subtotal = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const itemDisc = items.reduce((sum, item) => sum + getItemDiscountCents(item), 0);
    const afterItemDisc = subtotal - itemDisc;

    let sectionDisc = 0;
    if (discVal) {
      if (discType === "percent") {
        sectionDisc = Math.round(afterItemDisc * Number(discVal) / 100);
      } else {
        sectionDisc = parseCents(discVal);
      }
      sectionDisc = Math.min(sectionDisc, afterItemDisc);
    }

    const total = afterItemDisc - sectionDisc;
    return { subtotal, itemDisc, sectionDisc, total };
  }

  const serviceCalc = calcSection(serviceItems, "percent", "");
  const productCalc = calcSection(productItems, productDiscountType, productDiscountValue);

  const subtotalCents = serviceCalc.subtotal + productCalc.subtotal;
  const discountCents = serviceCalc.itemDisc + serviceCalc.sectionDisc + productCalc.itemDisc + productCalc.sectionDisc;
  const taxCents = taxRate > 0 ? Math.round(productCalc.total * taxRate / 100) : 0; // Tax on goods only
  const totalCents = serviceCalc.total + productCalc.total + taxCents;

  // Process checkout
  async function processCheckout() {
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    // Check if membership, credit, or service items require a member
    const hasMembership = cart.some(c => c.type === "membership");
    const hasCredit = cart.some(c => c.type === "credit");
    const hasService = cart.some(c => c.type === "service");
    const hasAccountPayment = paymentSplits.some(s => s.method === "ACCOUNT");
    if ((hasMembership || hasCredit || hasService || hasAccountPayment) && !selectedMember) {
      alert("Please select a member to assign the membership, account credit, appointment, or account payment to.");
      return;
    }

    // Validate split payment totals
    if (isSplitMode) {
      const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
      const allocated = paymentSplits.reduce((sum, s) => sum + s.amountCents, 0);
      if (allocated !== effectiveTotal) {
        alert(`Split payment amounts ($${(allocated / 100).toFixed(2)}) must equal the total ($${(effectiveTotal / 100).toFixed(2)}).`);
        return;
      }
    }

    // Show contract signing screen for membership/service sales
    if ((hasMembership || hasService) && selectedMember) {
      setShowContractSigning(true);
      return;
    }

    // No contract needed — proceed directly
    await executeCheckout();
  }

  // ── Signature Canvas Handlers ──
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x: number, y: number;
    if ("touches" in e) {
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x: number, y: number;
    if ("touches" in e) {
      e.preventDefault();
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing]);

  const stopDrawing = useCallback(() => { setIsDrawing(false); }, []);

  function clearSignature() {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  // ── Contract PDF Generation + Signing ──
  function buildContractText(): string {
    const lines: string[] = [];
    const memberName = selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : "";
    lines.push(`MEMBERSHIP / SERVICE AGREEMENT`);
    lines.push(`Date: ${new Date().toLocaleDateString()}`);
    lines.push("");
    lines.push(`Member: ${memberName}`);
    if (selectedMember?.email) lines.push(`Email: ${selectedMember.email}`);
    if (selectedMember?.phone) lines.push(`Phone: ${selectedMember.phone}`);
    if (selectedMember?.memberNumber) lines.push(`Member #: ${selectedMember.memberNumber}`);
    lines.push("");

    for (const item of cart) {
      if (item.type === "membership") {
        const plan = membershipPlans.find(p => p.id === item.membershipPlanId);
        lines.push(`--- Membership: ${item.itemName} ---`);
        lines.push(`Price: ${formatCents(item.unitPriceCents)}/${plan?.billingCycle?.toLowerCase() || "month"}`);
        if (plan?.contractLengthMonths) {
          const days = plan.contractLengthMonths;
          if (days >= 365 && days % 365 === 0) lines.push(`Contract: ${days / 365} year(s)`);
          else if (days >= 30 && days % 30 === 0) lines.push(`Contract: ${days / 30} month(s)`);
          else lines.push(`Contract: ${days} days`);
        }
        if (item.membershipStartDate) lines.push(`Start Date: ${new Date(item.membershipStartDate).toLocaleDateString()}`);
        if (plan?.cancellationNoticeDays) lines.push(`Cancellation Notice: ${plan.cancellationNoticeDays} days`);
        if (plan?.cancellationFeeCents) lines.push(`Early Termination Fee: ${formatCents(plan.cancellationFeeCents)}`);
        lines.push("");
      } else if (item.type === "service") {
        const pkg = servicePackages.find(p => p.id === item.servicePackageId);
        lines.push(`--- Service: ${item.itemName} ---`);
        lines.push(`Price: ${formatCents(item.unitPriceCents)}`);
        if (pkg?.sessionsIncluded) lines.push(`Sessions: ${pkg.sessionsIncluded}`);
        if (pkg?.expirationDays) lines.push(`Expires: ${pkg.expirationDays} days from purchase`);
        lines.push("");
      }
    }
    return lines.join("\n");
  }

  async function handleSignContract() {
    if (!hasSignature || !selectedMember) return;
    setContractSigning(true);

    try {
      const canvas = sigCanvasRef.current;
      const signatureDataUrl = canvas ? canvas.toDataURL("image/png") : "";
      const contractText = buildContractText();

      // 1. Generate PDF
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let yPos = 20;

      // Header
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text(gymName || "Martial Arts School", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;
      pdf.setFontSize(14);
      pdf.text("Membership / Service Agreement", pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Member info
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text("Member Information", margin, yPos);
      yPos += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Name: ${selectedMember.firstName} ${selectedMember.lastName}`, margin, yPos); yPos += 5;
      if (selectedMember.email) { pdf.text(`Email: ${selectedMember.email}`, margin, yPos); yPos += 5; }
      if (selectedMember.phone) { pdf.text(`Phone: ${selectedMember.phone}`, margin, yPos); yPos += 5; }
      if (selectedMember.memberNumber) { pdf.text(`Member #: ${selectedMember.memberNumber}`, margin, yPos); yPos += 5; }
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos); yPos += 10;

      // Items
      for (const item of cart) {
        if (item.type !== "membership" && item.type !== "service") continue;
        if (yPos > 250) { pdf.addPage(); yPos = 20; }

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        if (item.type === "membership") {
          const plan = membershipPlans.find(p => p.id === item.membershipPlanId);
          pdf.text(`Membership: ${item.itemName}`, margin, yPos); yPos += 7;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10);
          pdf.text(`Price: ${formatCents(item.unitPriceCents)}/${plan?.billingCycle?.toLowerCase() || "month"}`, margin, yPos); yPos += 5;
          if (plan?.contractLengthMonths) {
            const days = plan.contractLengthMonths;
            const contractStr = days >= 365 && days % 365 === 0 ? `${days / 365} year(s)` : days >= 30 && days % 30 === 0 ? `${days / 30} month(s)` : `${days} days`;
            pdf.text(`Contract Length: ${contractStr}`, margin, yPos); yPos += 5;
          }
          if (item.membershipStartDate) { pdf.text(`Start Date: ${new Date(item.membershipStartDate).toLocaleDateString()}`, margin, yPos); yPos += 5; }
          if (plan?.cancellationNoticeDays) { pdf.text(`Cancellation Notice: ${plan.cancellationNoticeDays} days`, margin, yPos); yPos += 5; }
          if (plan?.cancellationFeeCents) { pdf.text(`Early Termination Fee: ${formatCents(plan.cancellationFeeCents)}`, margin, yPos); yPos += 5; }

          // Plan-specific clauses
          if (plan?.contractClauses) {
            try {
              const planClauses: ContractClause[] = JSON.parse(plan.contractClauses);
              for (const clause of planClauses) {
                yPos += 5;
                if (yPos > 260) { pdf.addPage(); yPos = 20; }
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(10);
                pdf.text(clause.title, margin, yPos); yPos += 5;
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(9);
                const cLines = pdf.splitTextToSize(clause.content, maxWidth);
                for (const cl of cLines) {
                  if (yPos > 270) { pdf.addPage(); yPos = 20; }
                  pdf.text(cl, margin, yPos); yPos += 4;
                }
              }
            } catch { /* ignore */ }
          }
          yPos += 5;
        } else if (item.type === "service") {
          const pkg = servicePackages.find(p => p.id === item.servicePackageId);
          pdf.text(`Service: ${item.itemName}`, margin, yPos); yPos += 7;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10);
          pdf.text(`Price: ${formatCents(item.unitPriceCents)}`, margin, yPos); yPos += 5;
          if (pkg?.sessionsIncluded) { pdf.text(`Sessions: ${pkg.sessionsIncluded}`, margin, yPos); yPos += 5; }
          if (pkg?.expirationDays) { pdf.text(`Expires: ${pkg.expirationDays} days from purchase`, margin, yPos); yPos += 5; }
          yPos += 5;
        }
      }

      // Global contract clauses
      if (globalContractClauses.length > 0) {
        if (yPos > 240) { pdf.addPage(); yPos = 20; }
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text("Terms & Conditions", margin, yPos); yPos += 7;

        for (const clause of globalContractClauses) {
          if (yPos > 250) { pdf.addPage(); yPos = 20; }
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.text(clause.title, margin, yPos); yPos += 5;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          const clauseLines = pdf.splitTextToSize(clause.content, maxWidth);
          for (const line of clauseLines) {
            if (yPos > 270) { pdf.addPage(); yPos = 20; }
            pdf.text(line, margin, yPos); yPos += 4;
          }
          yPos += 4;
        }
      }

      // Signature
      if (yPos > 230) { pdf.addPage(); yPos = 20; }
      yPos += 10;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Signature", margin, yPos); yPos += 8;
      if (canvas && hasSignature) {
        pdf.addImage(signatureDataUrl, "PNG", margin, yPos, 60, 20);
        yPos += 25;
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPos); yPos += 8;
      pdf.setFontSize(8);
      pdf.text(`Signed electronically on ${new Date().toLocaleString()}`, margin, yPos);

      const pdfBase64 = pdf.output("datauristring");

      // 2. Save PDF to member documents
      try {
        const memberRes = await fetch(`/api/members/${selectedMember.id}`);
        if (memberRes.ok) {
          const memberData = await memberRes.json();
          const existing = memberData.member?.styleDocuments ? JSON.parse(memberData.member.styleDocuments) : [];
          const contractName = cart.find(c => c.type === "membership")?.itemName || cart.find(c => c.type === "service")?.itemName || "Contract";
          const newDoc = {
            id: `contract-${Date.now()}`,
            name: `${contractName} Contract - ${new Date().toLocaleDateString()}`,
            url: pdfBase64,
            uploadedAt: new Date().toISOString(),
          };
          await fetch(`/api/members/${selectedMember.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ styleDocuments: JSON.stringify([...existing, newDoc]) }),
          });
        }
      } catch (err) { console.error("Failed to save contract to documents:", err); }

      // 3. Create SignedContract record
      const itemsSummary = cart
        .filter(c => c.type === "membership" || c.type === "service")
        .map(c => ({ name: c.itemName, type: c.type, priceCents: c.unitPriceCents }));
      try {
        await fetch("/api/contracts/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMember.id,
            planName: itemsSummary.map(i => i.name).join(", "),
            itemsSummary: JSON.stringify(itemsSummary),
            contractContent: contractText,
            signatureData: signatureDataUrl,
          }),
        });
      } catch (err) { console.error("Failed to save signed contract:", err); }

      // 4. Email contract PDF
      try {
        const raw64 = pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64;
        await fetch("/api/contracts/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMember.id,
            pdfBase64: raw64,
            contractTitle: `${gymName || "Gym"} - Membership Agreement`,
          }),
        });
      } catch (err) { console.error("Failed to email contract:", err); }

      // 5. Close contract signing and continue checkout
      setShowContractSigning(false);
      setHasSignature(false);

      // Now continue with the actual checkout (bypass the contract check by calling inner logic directly)
      await executeCheckout();
    } catch (err) {
      console.error("Error during contract signing:", err);
      alert("Failed to process contract signing. Please try again.");
    } finally {
      setContractSigning(false);
    }
  }

  // The actual checkout logic (extracted so contract signing can call it after)
  async function executeCheckout() {
    setProcessing(true);
    try {
      const lineItems = cart.map(item => ({
        type: item.type,
        itemId: item.itemId,
        membershipPlanId: item.membershipPlanId,
        servicePackageId: item.servicePackageId || null,
        itemName: item.itemName,
        itemSku: item.itemSku,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        customPriceCents: item.customPriceCents,
        membershipStartDate: item.membershipStartDate,
        membershipEndDate: item.membershipEndDate,
        firstMonthDiscountOnly: item.firstMonthDiscountOnly,
        recipientName: item.recipientName,
        selectedSize: item.selectedSize || null,
        selectedColor: item.selectedColor || null,
        discountType: item.discountType || null,
        discountValue: item.discountValue || null,
        discountCents: getItemDiscountCents(item),
      }));

      const isCardPayment = !isSplitMode && paymentSplits[0]?.method === "CARD";
      const hasCardInSplit = isSplitMode && paymentSplits.some(s => s.method === "CARD");

      if (activeProcessor && (isCardPayment || hasCardInSplit)) {
        const cardAmountCents = isSplitMode
          ? paymentSplits.filter(s => s.method === "CARD").reduce((sum, s) => sum + s.amountCents, 0)
          : Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));

        let existingTransactionId: string | undefined;
        let existingTransactionNumber: string | undefined;
        if (isSplitMode && hasCardInSplit) {
          const txnRes = await fetch("/api/pos/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              memberId: selectedMember?.id || null,
              memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : null,
              lineItems,
              paymentMethod: serializePaymentMethod(paymentSplits.map(s => ({ method: s.method, amountCents: s.amountCents, ...(s.label ? { label: s.label } : {}) }))),
              notes: notes || null,
              discountCents: (redeemedGift?.appliedCents || 0) + discountCents,
              taxCents,
              serviceDiscountCents: serviceCalc.itemDisc + serviceCalc.sectionDisc,
              productDiscountCents: productCalc.itemDisc + productCalc.sectionDisc,
              redeemedGiftCode: redeemedGift?.code || null,
              redeemedGiftAmountCents: redeemedGift?.appliedCents || 0,
            }),
          });
          if (!txnRes.ok) throw new Error(await txnRes.text() || "Failed to create transaction");
          const txnData = await txnRes.json();
          existingTransactionId = txnData.transaction.id;
          existingTransactionNumber = txnData.transaction.transactionNumber;
        }

        const checkoutRes = await fetch("/api/pos/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMember?.id || null,
            memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : null,
            lineItems,
            notes: notes || null,
            discountCents: (redeemedGift?.appliedCents || 0) + discountCents,
            taxCents,
            serviceDiscountCents: serviceCalc.itemDisc + serviceCalc.sectionDisc,
            productDiscountCents: productCalc.itemDisc + productCalc.sectionDisc,
            cardAmountCents,
            transactionId: existingTransactionId,
            redeemedGiftCode: redeemedGift?.code || null,
            redeemedGiftAmountCents: redeemedGift?.appliedCents || 0,
            metadata: {
              source: "pos",
              cartItems: JSON.stringify(cart),
              discounts: JSON.stringify({ productDiscountType, productDiscountValue }),
              giftRedemption: redeemedGift ? JSON.stringify(redeemedGift) : null,
            },
          }),
        });

        if (!checkoutRes.ok) throw new Error(await checkoutRes.text() || "Card checkout failed");
        const checkoutData = await checkoutRes.json();

        if (checkoutData.url) {
          const popup = window.open(checkoutData.url, "_blank", "width=600,height=700,scrollbars=yes");
          setStripePolling(true);
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(`/api/pos/checkout/status?sessionId=${checkoutData.sessionId}&processor=${checkoutData.processor || activeProcessor}`);
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.status === "complete") {
                  clearInterval(pollInterval);
                  setStripePolling(false);
                  if (popup && !popup.closed) popup.close();
                  if (!existingTransactionId) {
                    const txnRes2 = await fetch("/api/pos/transactions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        memberId: selectedMember?.id || null,
                        memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : null,
                        lineItems,
                        paymentMethod: isSplitMode
                          ? serializePaymentMethod(paymentSplits.map(s => ({ method: s.method, amountCents: s.amountCents, ...(s.label ? { label: s.label } : {}) })))
                          : "CARD",
                        notes: notes || null,
                        discountCents: (redeemedGift?.appliedCents || 0) + discountCents,
                        taxCents,
                        serviceDiscountCents: serviceCalc.itemDisc + serviceCalc.sectionDisc,
                        productDiscountCents: productCalc.itemDisc + productCalc.sectionDisc,
                        paymentIntentId: statusData.paymentIntentId,
                        receiptUrl: statusData.receiptUrl,
                        paymentProcessor: checkoutData.processor || activeProcessor,
                        redeemedGiftCode: redeemedGift?.code || null,
                        redeemedGiftAmountCents: redeemedGift?.appliedCents || 0,
                      }),
                    });
                    if (txnRes2.ok) {
                      const txnData2 = await txnRes2.json();
                      setLastTransaction({ id: txnData2.transaction.id, transactionNumber: txnData2.transaction.transactionNumber });
                    }
                  } else {
                    setLastTransaction({ id: existingTransactionId!, transactionNumber: existingTransactionNumber! });
                  }
                  resetAfterCheckout();
                } else if (statusData.status === "expired" || statusData.status === "failed") {
                  clearInterval(pollInterval);
                  setStripePolling(false);
                  setProcessing(false);
                  if (popup && !popup.closed) popup.close();
                  alert("Payment failed or expired. Please try again.");
                }
              }
            } catch { /* polling error, continue */ }
            if (popup && popup.closed) {
              clearInterval(pollInterval);
              setStripePolling(false);
              setProcessing(false);
            }
          }, 2000);
          return;
        }
      }

      // Standard (non-card) checkout
      const res = await fetch("/api/pos/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: selectedMember?.id || null,
          memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : null,
          lineItems,
          paymentMethod: isSplitMode
            ? serializePaymentMethod(paymentSplits.map(s => ({ method: s.method, amountCents: s.amountCents, ...(s.label ? { label: s.label } : {}) })))
            : paymentSplits[0].method,
          notes: notes || null,
          discountCents: (redeemedGift?.appliedCents || 0) + discountCents,
          taxCents,
          serviceDiscountCents: serviceCalc.itemDisc + serviceCalc.sectionDisc,
          productDiscountCents: productCalc.itemDisc + productCalc.sectionDisc,
          redeemedGiftCode: redeemedGift?.code || null,
          redeemedGiftAmountCents: redeemedGift?.appliedCents || 0,
        }),
      });

      if (!res.ok) throw new Error(await res.text() || "Failed to process transaction");
      const data = await res.json();
      setLastTransaction({ id: data.transaction.id, transactionNumber: data.transaction.transactionNumber });
      resetAfterCheckout();
      fetchData();
    } catch (error) {
      console.error("Error processing checkout:", error);
      alert(error instanceof Error ? error.message : "Failed to process transaction");
    } finally {
      setProcessing(false);
    }
  }

  function resetAfterCheckout() {
    setCart([]);
    setSelectedMember(null);
    setNotes("");
    setRedeemedGift(null);
    setRedeemCode("");
    setProductDiscountValue("");
    setShowProductDiscount(false);
    setPaymentSplits([{ id: crypto.randomUUID(), method: "CASH", amountCents: 0, label: "" }]);
    setIsSplitMode(false);
    setShowRedeemGift(false);
    setCreditAmount("");
    setGiftAmount("");
    setGiftRecipient("");
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading POS...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">POS (Point of Sale)</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("checkout")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activeTab === "checkout"
                  ? "bg-primary text-white hover:bg-primaryDark"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Checkout
            </button>
            <Link
              href="/pos/items"
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Manage Items
            </Link>
            <Link
              href="/pos/history"
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              History
            </Link>
          </div>
        </div>

        {/* Success message */}
        {lastTransaction && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-green-800">Transaction Complete!</p>
              <p className="text-sm text-green-600">
                Transaction #{lastTransaction.transactionNumber}
              </p>
            </div>
            <button
              onClick={() => setLastTransaction(null)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main checkout layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Product/Membership catalog */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search and filters */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-3">Search</h3>
              <div className="space-y-2">
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Search items, memberships, or services..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { key: "products" as const, label: `Products (${filteredItems.length})` },
                    { key: "memberships" as const, label: `Memberships (${filteredPlans.length})` },
                    { key: "services" as const, label: `Services (${filteredServicePackages.length})` },
                    { key: "credit" as const, label: "Account Credit" },
                    { key: "gift" as const, label: "Gift Certificate" },
                  ]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setCatalogTab(tab.key)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                        catalogTab === tab.key
                          ? "bg-primary text-white hover:bg-primaryDark"
                          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Items grid */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              {catalogTab === "products" && (
                filteredItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No products found. <Link href="/pos/items" className="text-primary hover:underline">Add some items</Link>
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {filteredItems.map(item => {
                      const totalStock = getTotalStock(item);
                      const itemHasVariants = hasVariants(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleProductClick(item)}
                          disabled={totalStock <= 0}
                          className={`p-3 border rounded-lg text-left transition-colors ${
                            totalStock <= 0
                              ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                              : "border-gray-200 hover:border-primary hover:bg-primary/5"
                          }`}
                        >
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          {item.sku && <p className="text-xs text-gray-500">{item.sku}</p>}
                          <p className="text-sm font-semibold text-primary mt-1">
                            {formatCents(item.priceCents)}
                          </p>
                          <p className={`text-xs mt-1 ${totalStock <= 0 ? "text-red-500" : "text-gray-500"}`}>
                            {totalStock <= 0 ? "Out of stock" : `${totalStock} in stock`}
                            {itemHasVariants && totalStock > 0 && (
                              <span className="text-gray-400"> (variants)</span>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {catalogTab === "memberships" && (
                filteredPlans.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No membership plans found. <Link href="/memberships" className="text-primary hover:underline">Create some plans</Link>
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredPlans.map(plan => (
                      <button
                        key={plan.id}
                        onClick={() => openMembershipConfig(plan)}
                        className="p-3 border border-gray-200 rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <p className="font-medium text-sm">{plan.name}</p>
                        {plan.membershipId && (
                          <p className="text-xs text-gray-500">#{plan.membershipId}</p>
                        )}
                        <p className="text-sm font-semibold text-primary mt-1">
                          {formatCents((plan.priceCents || 0) + (plan.setupFeeCents || 0))}
                          {plan.setupFeeCents ? (
                            <span className="text-xs font-normal text-gray-500">
                              {" "}(incl. ${(plan.setupFeeCents / 100).toFixed(2)} setup)
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{plan.billingCycle}</p>
                      </button>
                    ))}
                  </div>
                )
              )}

              {catalogTab === "services" && (
                filteredServicePackages.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No appointments found. <Link href="/settings/service-packages" className="text-primary hover:underline">Create some appointments</Link>
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredServicePackages.map(pkg => (
                      <button
                        key={pkg.id}
                        onClick={() => {
                          if (!selectedMember) {
                            alert("Please select a member first before adding an appointment.");
                            return;
                          }
                          setCart([...cart, {
                            id: crypto.randomUUID(),
                            type: "service",
                            servicePackageId: pkg.id,
                            itemName: pkg.name,
                            unitPriceCents: pkg.priceCents,
                            quantity: 1,
                          }]);
                        }}
                        className="p-3 border border-gray-200 rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <p className="font-medium text-sm">{pkg.name}</p>
                        {pkg.appointment && (
                          <p className="text-xs text-gray-500">{pkg.appointment.title}</p>
                        )}
                        <p className="text-sm font-semibold text-primary mt-1">
                          {formatCents(pkg.priceCents)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {pkg.sessionsIncluded === 1 ? "1 session" : `${pkg.sessionsIncluded} sessions`}
                          {pkg.expirationDays ? ` · ${pkg.expirationDays}d expiry` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )
              )}

              {catalogTab === "credit" && (
                <div className="max-w-sm mx-auto py-4 space-y-4">
                  <div className="text-center">
                    <h3 className="font-semibold text-gray-900">Add Account Credit</h3>
                    <p className="text-xs text-gray-500 mt-1">Add credit to a member&apos;s account balance</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const cents = parseCents(creditAmount);
                      if (cents <= 0) { alert("Please enter a valid amount."); return; }
                      setCart([...cart, {
                        id: crypto.randomUUID(),
                        type: "credit",
                        itemName: "Account Credit",
                        unitPriceCents: cents,
                        quantity: 1,
                      }]);
                      setCreditAmount("");
                    }}
                    className="w-full rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
                  >
                    Add to Cart
                  </button>
                </div>
              )}

              {catalogTab === "gift" && (
                <div className="max-w-sm mx-auto py-4 space-y-4">
                  <div className="text-center">
                    <h3 className="font-semibold text-gray-900">Sell Gift Certificate</h3>
                    <p className="text-xs text-gray-500 mt-1">Create a gift certificate with a unique code</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="text"
                        value={giftAmount}
                        onChange={(e) => setGiftAmount(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name (optional)</label>
                    <input
                      type="text"
                      value={giftRecipient}
                      onChange={(e) => setGiftRecipient(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Recipient name"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const cents = parseCents(giftAmount);
                      if (cents <= 0) { alert("Please enter a valid amount."); return; }
                      setCart([...cart, {
                        id: crypto.randomUUID(),
                        type: "gift",
                        itemName: "Gift Certificate",
                        unitPriceCents: cents,
                        quantity: 1,
                        recipientName: giftRecipient || undefined,
                      }]);
                      setGiftAmount("");
                      setGiftRecipient("");
                    }}
                    className="w-full rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
                  >
                    Add to Cart
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Cart and checkout */}
          <div className="space-y-4">
            {/* Member selection */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 pb-[1.5625rem]">
              <h3 className="font-medium text-sm mb-3">Customer</h3>
              {selectedMember ? (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div>
                    <p className="font-medium">
                      {selectedMember.firstName} {selectedMember.lastName}
                    </p>
                    {selectedMember.memberNumber && (
                      <p className="text-xs text-gray-500">#{selectedMember.memberNumber}</p>
                    )}
                    <p className={`text-xs font-medium ${selectedMember.accountCreditCents < 0 ? "text-red-600" : selectedMember.accountCreditCents > 0 ? "text-green-600" : "text-gray-400"}`}>
                      {selectedMember.accountCreditCents < 0
                        ? `Balance Due: $${(Math.abs(selectedMember.accountCreditCents) / 100).toFixed(2)}`
                        : selectedMember.accountCreditCents > 0
                          ? `Account Credit: $${(selectedMember.accountCreditCents / 100).toFixed(2)}`
                          : "No account balance"}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Search members..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && memberSearch && filteredMembers.length > 0) {
                        e.preventDefault();
                        setSelectedMember(filteredMembers[0]);
                        setMemberSearch("");
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {memberSearch && filteredMembers.length > 0 && (
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {filteredMembers.map((member, idx) => (
                        <button
                          key={member.id}
                          onClick={() => {
                            setSelectedMember(member);
                            setMemberSearch("");
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${idx === 0 ? "bg-gray-50" : ""}`}
                        >
                          <p className="font-medium text-sm">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.memberNumber ? `#${member.memberNumber}` : member.email || member.phone || "No contact"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 py-1">
                    Optional for products &amp; gift certificates, required for memberships, services &amp; account credit
                  </p>
                </div>
              )}
            </div>

            {/* Cart */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-3">Cart ({cart.length} items)</h3>
              {cart.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Cart is empty</p>
              ) : (
                <div className="space-y-4">
                  {/* Services Section */}
                  {serviceItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Services</span>
                        <span className="text-xs text-gray-400">({serviceItems.length})</span>
                      </div>
                      <div className="space-y-3 pl-2 border-l-2 border-blue-200">
                        {serviceItems.map(item => (
                          <div key={item.id} className="pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{item.itemName}</p>
                                {item.type === "membership" && item.membershipStartDate && (
                                  <p className="text-xs text-gray-500">
                                    {item.membershipStartDate} to {item.membershipEndDate}
                                    {item.firstMonthDiscountOnly && " (1st mo. discount)"}
                                  </p>
                                )}
                                {item.type === "gift" && item.recipientName && (
                                  <p className="text-xs text-gray-500">For: {item.recipientName}</p>
                                )}
                                <p className="text-sm text-primary">{formatCents(item.unitPriceCents)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-semibold">x1</span>
                                <button
                                  onClick={() => removeFromCart(item.id)}
                                  className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark ml-1"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs text-gray-600 pt-1">
                          <span>Services subtotal</span>
                          <span>{formatCents(serviceCalc.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Products Section */}
                  {productItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</span>
                        <span className="text-xs text-gray-400">({productItems.length})</span>
                      </div>
                      <div className="space-y-3 pl-2 border-l-2 border-amber-200">
                        {productItems.map(item => {
                          const itemDisc = getItemDiscountCents(item);
                          return (
                            <div key={item.id} className="pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{item.itemName}</p>
                                  {item.itemSku && <p className="text-xs text-gray-500">{item.itemSku}</p>}
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-sm text-primary">{formatCents(item.unitPriceCents)}</span>
                                    <span className="text-xs text-gray-400">disc:</span>
                                    <select
                                      value={item.discountType || "percent"}
                                      onChange={(e) => {
                                        const newType = e.target.value as "percent" | "amount";
                                        setCart(cart.map(c => c.id === item.id ? { ...c, discountType: newType, discountValue: c.discountValue || undefined } : c));
                                      }}
                                      className="border border-gray-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                      <option value="percent">%</option>
                                      <option value="amount">$</option>
                                    </select>
                                    <input
                                      type="number"
                                      value={item.discountValue && item.discountValue > 0 ? (item.discountType === "amount" ? (item.discountValue / 100).toFixed(2) : item.discountValue) : ""}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const type = item.discountType || "percent";
                                        if (!raw || Number(raw) <= 0) {
                                          setCart(cart.map(c => c.id === item.id ? { ...c, discountValue: undefined } : c));
                                        } else {
                                          const val = type === "percent" ? Math.min(Number(raw), 100) : parseCents(raw);
                                          setCart(cart.map(c => c.id === item.id ? { ...c, discountType: type, discountValue: val } : c));
                                        }
                                      }}
                                      placeholder="0"
                                      min="0"
                                      step={(item.discountType || "percent") === "percent" ? "1" : "0.01"}
                                      className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    {itemDisc > 0 && (
                                      <span className="text-xs text-green-600">-{formatCents(itemDisc)}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                                    className="w-6 h-6 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    -
                                  </button>
                                  <span className="text-xs w-6 text-center font-semibold">{item.quantity}</span>
                                  <button
                                    onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                    className="w-6 h-6 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark ml-1"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Products section discount */}
                      <div className="mt-2 pl-2 border-l-2 border-amber-200">
                        {productDiscountValue && Number(productDiscountValue) > 0 ? (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-green-600">
                              Section discount: {productDiscountType === "percent" ? `${productDiscountValue}%` : formatCents(parseCents(productDiscountValue))} (-{formatCents(productCalc.sectionDisc)})
                            </span>
                            <button
                              onClick={() => { setProductDiscountValue(""); setShowProductDiscount(false); }}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Remove
                            </button>
                          </div>
                        ) : showProductDiscount ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={productDiscountType}
                              onChange={(e) => setProductDiscountType(e.target.value as "percent" | "amount")}
                              className="border border-gray-300 rounded-md px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="percent">%</option>
                              <option value="amount">$</option>
                            </select>
                            <input
                              type="number"
                              value={productDiscountValue}
                              onChange={(e) => setProductDiscountValue(e.target.value)}
                              placeholder={productDiscountType === "percent" ? "10" : "5.00"}
                              min="0"
                              step={productDiscountType === "percent" ? "1" : "0.01"}
                              className="w-20 border border-gray-300 rounded-md px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              autoFocus
                            />
                            <button
                              onClick={() => { if (!productDiscountValue) setShowProductDiscount(false); }}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowProductDiscount(true)}
                            className="text-xs text-gray-400 hover:text-primary"
                          >
                            Add section discount
                          </button>
                        )}
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>Products subtotal</span>
                          <span>{formatCents(productCalc.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-3">Payment Method</h3>
              {isSplitMode ? (
                <div className="space-y-2">
                  {paymentSplits.map((split) => (
                    <div key={split.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <select
                        value={split.method}
                        onChange={(e) => {
                          const m = e.target.value as PaymentSplitEntry["method"];
                          if (m === "ACCOUNT" && !selectedMember) {
                            alert("Please select a member first to use Account payment.");
                            return;
                          }
                          setPaymentSplits(prev => prev.map(s => {
                            if (s.id !== split.id) return s;
                            let newAmount = s.amountCents;
                            // Auto-fill ACCOUNT with member balance (capped at remaining)
                            if (m === "ACCOUNT" && selectedMember && selectedMember.accountCreditCents > 0) {
                              const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
                              const otherAllocated = prev.filter(o => o.id !== s.id).reduce((sum, o) => sum + o.amountCents, 0);
                              const remaining = Math.max(0, effectiveTotal - otherAllocated);
                              newAmount = Math.min(selectedMember.accountCreditCents, remaining);
                            }
                            return { ...s, method: m, amountCents: newAmount, label: m !== "CARD" ? "" : s.label };
                          }));
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="CASH">CASH</option>
                        <option value="CARD">CARD</option>
                        <option value="CHECK">CHECK</option>
                        <option value="ACCOUNT">ACCOUNT</option>
                      </select>
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                        <input
                          type="text"
                          value={split.amountCents > 0 ? (split.amountCents / 100).toFixed(2) : ""}
                          onChange={(e) => {
                            const cents = parseCents(e.target.value);
                            setPaymentSplits(prev => prev.map(s => s.id === split.id ? { ...s, amountCents: cents } : s));
                          }}
                          placeholder="0.00"
                          className="w-full border border-gray-300 rounded-lg pl-5 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      {split.method === "CARD" && (
                        <input
                          type="text"
                          placeholder="Label (optional)"
                          value={split.label}
                          onChange={(e) => setPaymentSplits(prev => prev.map(s => s.id === split.id ? { ...s, label: e.target.value } : s))}
                          className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      )}
                      {paymentSplits.length > 1 && (
                        <button
                          onClick={() => setPaymentSplits(prev => prev.filter(s => s.id !== split.id))}
                          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Remaining balance */}
                  {(() => {
                    const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
                    const allocated = paymentSplits.reduce((sum, s) => sum + s.amountCents, 0);
                    const remaining = effectiveTotal - allocated;
                    return (
                      <div className="flex justify-between text-xs px-1">
                        <span className="text-gray-500">Remaining</span>
                        <span className={remaining === 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                          {formatCents(remaining)}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
                        const allocated = paymentSplits.reduce((sum, s) => sum + s.amountCents, 0);
                        const remaining = Math.max(0, effectiveTotal - allocated);
                        setPaymentSplits(prev => [...prev, { id: crypto.randomUUID(), method: "CASH", amountCents: remaining, label: "" }]);
                      }}
                      className="text-xs text-primary hover:text-primaryDark font-semibold"
                    >
                      Add Payment Method
                    </button>
                    <button
                      onClick={() => {
                        setIsSplitMode(false);
                        setPaymentSplits([{ id: crypto.randomUUID(), method: paymentSplits[0]?.method || "CASH", amountCents: 0, label: "" }]);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Back to single
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(["CASH", "CARD", "CHECK", "ACCOUNT"] as const).map(method => (
                      <button
                        key={method}
                        onClick={() => {
                          if (method === "ACCOUNT" && !selectedMember) {
                            alert("Please select a member first to use Account payment.");
                            return;
                          }
                          setPaymentSplits([{ id: paymentSplits[0]?.id || crypto.randomUUID(), method, amountCents: 0, label: "" }]);
                        }}
                        disabled={method === "ACCOUNT" && !selectedMember}
                        className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          paymentSplits[0]?.method === method
                            ? "border border-primary bg-primary/10 text-primary"
                            : method === "ACCOUNT" && !selectedMember
                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                              : "bg-primary text-white hover:bg-primaryDark"
                        }`}
                      >
                        {method === "CARD" && activeProcessor
                          ? `CARD (${activeProcessor.charAt(0).toUpperCase() + activeProcessor.slice(1)})`
                          : method === "ACCOUNT" && selectedMember
                            ? `ACCOUNT (${selectedMember.accountCreditCents >= 0 ? "$" : "-$"}${(Math.abs(selectedMember.accountCreditCents) / 100).toFixed(2)})`
                            : method}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
                      setIsSplitMode(true);
                      setPaymentSplits([{ id: crypto.randomUUID(), method: paymentSplits[0]?.method || "CASH", amountCents: effectiveTotal, label: "" }]);
                    }}
                    className="text-xs text-primary hover:text-primaryDark mt-2 font-semibold"
                  >
                    Split Payment
                  </button>
                </>
              )}

              {/* Redeem Gift Certificate */}
              <div className="mt-3">
                {redeemedGift ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">Gift Certificate Applied</span>
                      <button
                        onClick={() => setRedeemedGift(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="bg-primary/5 rounded-lg p-3">
                      <p className="text-sm font-medium">Code: {redeemedGift.code}</p>
                      <p className="text-sm text-primary font-semibold">-{formatCents(redeemedGift.appliedCents)}</p>
                    </div>
                  </div>
                ) : showRedeemGift ? (
                  <div className="space-y-2">
                    <span className="font-medium text-sm">Redeem Gift Certificate</span>
                    <input
                      type="text"
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Enter gift certificate code"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!redeemCode.trim()) return;
                          setRedeemingGift(true);
                          try {
                            const res = await fetch(`/api/gift-certificates/lookup?code=${encodeURIComponent(redeemCode.trim())}`);
                            if (!res.ok) {
                              const text = await res.text();
                              alert(text || "Gift certificate not found");
                              return;
                            }
                            const data = await res.json();
                            const appliedCents = Math.min(data.balanceCents, totalCents);
                            setRedeemedGift({
                              code: data.code,
                              balanceCents: data.balanceCents,
                              appliedCents,
                            });
                            setShowRedeemGift(false);
                            setRedeemCode("");
                          } catch {
                            alert("Failed to look up gift certificate");
                          } finally {
                            setRedeemingGift(false);
                          }
                        }}
                        disabled={redeemingGift || !redeemCode.trim()}
                        className="flex-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 transition-colors"
                      >
                        {redeemingGift ? "Looking up..." : "Apply"}
                      </button>
                      <button
                        onClick={() => { setShowRedeemGift(false); setRedeemCode(""); }}
                        className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setShowRedeemGift(true)}
                      className="px-3 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primaryDark transition-colors"
                    >
                      Redeem Gift Certificate
                    </button>
                  </div>
                )}
              </div>

              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full mt-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                rows={2}
              />
            </div>

            {/* Totals and checkout */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="space-y-2 text-sm">
                {/* Per-section breakdowns */}
                {serviceItems.length > 0 && productItems.length > 0 && (
                  <>
                    <div className="flex justify-between text-gray-600">
                      <span>Services</span>
                      <span>{formatCents(serviceCalc.total)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Products</span>
                      <span>{formatCents(productCalc.total)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatCents(subtotalCents)}</span>
                </div>
                {discountCents > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discounts</span>
                    <span>-{formatCents(discountCents)}</span>
                  </div>
                )}
                {taxCents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax</span>
                    <span>{formatCents(taxCents)}</span>
                  </div>
                )}
                {redeemedGift && redeemedGift.appliedCents > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Gift Certificate ({redeemedGift.code})</span>
                    <span>-{formatCents(redeemedGift.appliedCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
                  <span>Total</span>
                  <span>{formatCents(Math.max(0, totalCents - (redeemedGift?.appliedCents || 0)))}</span>
                </div>
              </div>
              {isSplitMode && (() => {
                const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
                const allocated = paymentSplits.reduce((sum, s) => sum + s.amountCents, 0);
                return allocated !== effectiveTotal && cart.length > 0 ? (
                  <p className="text-xs text-red-500 mt-2">Split amounts must equal {formatCents(effectiveTotal)}</p>
                ) : null;
              })()}
              <div className="flex justify-center mt-4">
                {stripePolling ? (
                  <div className="text-center space-y-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                    <p className="text-sm text-gray-600 font-medium">Waiting for Stripe payment...</p>
                    <p className="text-xs text-gray-400">Complete the payment in the popup window</p>
                  </div>
                ) : (
                  <button
                    onClick={processCheckout}
                    disabled={cart.length === 0 || processing || (isSplitMode && paymentSplits.reduce((sum, s) => sum + s.amountCents, 0) !== Math.max(0, totalCents - (redeemedGift?.appliedCents || 0)))}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing ? "Processing..." : `Complete Sale (${formatCents(Math.max(0, totalCents - (redeemedGift?.appliedCents || 0)))})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Membership Configuration Modal */}
      {showMembershipModal && selectedPlanForConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold">Configure Membership</h2>
              <p className="text-sm text-gray-600">{selectedPlanForConfig.name}</p>
            </div>
            <div className="p-4 space-y-4">
              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={membershipConfig.startDate}
                  onChange={(e) => setMembershipConfig({ ...membershipConfig, startDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Recurring Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="durationType"
                      checked={membershipConfig.isRecurring}
                      onChange={() => setMembershipConfig({ ...membershipConfig, isRecurring: true })}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">Recurring (no end date)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="durationType"
                      checked={!membershipConfig.isRecurring}
                      onChange={() => setMembershipConfig({ ...membershipConfig, isRecurring: false })}
                      className="text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-gray-700">One Time</span>
                  </label>
                </div>
              </div>

              {/* Duration - only show if not recurring */}
              {!membershipConfig.isRecurring && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      value={membershipConfig.durationValue}
                      onChange={(e) => setMembershipConfig({ ...membershipConfig, durationValue: parseInt(e.target.value) || 1 })}
                      className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <select
                      value={membershipConfig.durationUnit}
                      onChange={(e) => setMembershipConfig({ ...membershipConfig, durationUnit: e.target.value as MembershipConfig["durationUnit"] })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    End date: {calculateEndDate(membershipConfig.startDate, membershipConfig.durationValue, membershipConfig.durationUnit)}
                  </p>
                </div>
              )}

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={membershipConfig.customPrice}
                    onChange={(e) => setMembershipConfig({ ...membershipConfig, customPrice: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Plan price: {formatCents((selectedPlanForConfig.priceCents || 0) + (selectedPlanForConfig.setupFeeCents || 0))}
                </p>
              </div>

              {/* Discount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount
                </label>
                <div className="flex gap-2">
                  <select
                    value={membershipConfig.discountType}
                    onChange={(e) => setMembershipConfig({ ...membershipConfig, discountType: e.target.value as "percent" | "amount" })}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                  <input
                    type="text"
                    value={membershipConfig.discountValue}
                    onChange={(e) => setMembershipConfig({ ...membershipConfig, discountValue: e.target.value })}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder={membershipConfig.discountType === "percent" ? "0" : "0.00"}
                  />
                </div>
              </div>

              {/* First month discount only */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={membershipConfig.firstMonthDiscountOnly}
                  onChange={(e) => setMembershipConfig({ ...membershipConfig, firstMonthDiscountOnly: e.target.checked })}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">First month discount only</span>
              </label>

              {/* Calculated price */}
              {membershipConfig.discountValue && parseFloat(membershipConfig.discountValue) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-600">Final price:</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCents(
                      membershipConfig.discountType === "percent"
                        ? Math.round(parseCents(membershipConfig.customPrice) * (1 - parseFloat(membershipConfig.discountValue) / 100))
                        : Math.max(0, parseCents(membershipConfig.customPrice) - parseCents(membershipConfig.discountValue))
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={addMembershipToCart}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors"
              >
                Add to Cart
              </button>
              <button
                onClick={() => {
                  setShowMembershipModal(false);
                  setSelectedPlanForConfig(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Variant Picker Modal */}
      {showVariantPicker && variantPickerItem && (() => {
        const item = variantPickerItem;
        const sizesArr: string[] = item.sizes ? (typeof item.sizes === "string" ? JSON.parse(item.sizes) : item.sizes) : [];
        const colorsArr: string[] = item.colors ? (typeof item.colors === "string" ? JSON.parse(item.colors) : item.colors) : [];
        const varStock = getVariantStock(item, pickerSize, pickerColor);
        const label1 = item.variantLabel1 || "Size";
        const label2 = item.variantLabel2 || "Color";

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-bold">Select Variant</h2>
                <p className="text-sm text-gray-600">{item.name} — {formatCents(item.priceCents)}</p>
              </div>
              <div className="p-4 space-y-4">
                {sizesArr.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{label1}</label>
                    <div className="flex flex-wrap gap-2">
                      {sizesArr.map((size: string) => {
                        const sizeStock = colorsArr.length > 0
                          ? item.variants.filter(v => v.size === size).reduce((sum, v) => sum + v.quantity, 0)
                          : getVariantStock(item, size, null);
                        return (
                          <button
                            key={size}
                            onClick={() => setPickerSize(size)}
                            disabled={sizeStock <= 0}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                              pickerSize === size
                                ? "border-primary bg-primary text-white font-semibold"
                                : sizeStock <= 0
                                  ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                                  : "border-gray-300 hover:border-primary text-gray-700"
                            }`}
                          >
                            {size}
                            <span className={`text-xs ml-1 ${pickerSize === size ? "text-white" : "text-gray-400"}`}>({sizeStock})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {colorsArr.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{label2}</label>
                    <div className="flex flex-wrap gap-2">
                      {colorsArr.map((color: string) => {
                        const colorStock = sizesArr.length > 0
                          ? getVariantStock(item, pickerSize, color)
                          : getVariantStock(item, null, color);
                        return (
                          <button
                            key={color}
                            onClick={() => setPickerColor(color)}
                            disabled={colorStock <= 0}
                            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                              pickerColor === color
                                ? "border-primary bg-primary text-white font-semibold"
                                : colorStock <= 0
                                  ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                                  : "border-gray-300 hover:border-primary text-gray-700"
                            }`}
                          >
                            {color}
                            <span className={`text-xs ml-1 ${pickerColor === color ? "text-white" : "text-gray-400"}`}>({colorStock})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Stock info for selected variant */}
                <div className={`text-sm font-medium ${varStock > 0 ? "text-green-600" : "text-red-500"}`}>
                  {varStock > 0 ? `${varStock} in stock` : "Out of stock"}
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 flex gap-3 justify-end">
                <button
                  onClick={() => {
                    addProductToCart(item, pickerSize, pickerColor);
                    setShowVariantPicker(false);
                    setVariantPickerItem(null);
                  }}
                  disabled={varStock <= 0}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add to Cart
                </button>
                <button
                  onClick={() => {
                    setShowVariantPicker(false);
                    setVariantPickerItem(null);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Contract Signing Overlay */}
      {showContractSigning && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-auto">
          <div className="w-full max-w-2xl mx-4 my-8 rounded-lg bg-white shadow-2xl">
            {/* Header */}
            <div className="bg-primary px-6 py-4 rounded-t-lg text-center">
              <h2 className="text-lg font-bold text-white">{gymName || "Martial Arts School"}</h2>
              <p className="text-sm text-white/80">Membership / Service Agreement</p>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Member Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Member Information</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                  <div><span className="font-medium text-gray-700">Name:</span> {selectedMember.firstName} {selectedMember.lastName}</div>
                  {selectedMember.email && <div><span className="font-medium text-gray-700">Email:</span> {selectedMember.email}</div>}
                  {selectedMember.phone && <div><span className="font-medium text-gray-700">Phone:</span> {selectedMember.phone}</div>}
                  {selectedMember.memberNumber && <div><span className="font-medium text-gray-700">Member #:</span> {selectedMember.memberNumber}</div>}
                  <div><span className="font-medium text-gray-700">Date:</span> {new Date().toLocaleDateString()}</div>
                </div>
              </div>

              {/* Items */}
              {cart.filter(c => c.type === "membership" || c.type === "service").map((item) => {
                const plan = item.type === "membership" ? membershipPlans.find(p => p.id === item.membershipPlanId) : null;
                const pkg = item.type === "service" ? servicePackages.find(p => p.id === item.servicePackageId) : null;
                return (
                  <div key={item.id} className="rounded-md border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                      {item.type === "membership" ? "Membership" : "Service"}: {item.itemName}
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                      <div><span className="font-medium text-gray-700">Price:</span> {formatCents(item.unitPriceCents)}{plan ? `/${plan.billingCycle.toLowerCase()}` : ""}</div>
                      {plan?.contractLengthMonths && (
                        <div><span className="font-medium text-gray-700">Contract:</span> {
                          plan.contractLengthMonths >= 365 && plan.contractLengthMonths % 365 === 0
                            ? `${plan.contractLengthMonths / 365} year(s)`
                            : plan.contractLengthMonths >= 30 && plan.contractLengthMonths % 30 === 0
                              ? `${plan.contractLengthMonths / 30} month(s)`
                              : `${plan.contractLengthMonths} days`
                        }</div>
                      )}
                      {item.membershipStartDate && <div><span className="font-medium text-gray-700">Start Date:</span> {new Date(item.membershipStartDate).toLocaleDateString()}</div>}
                      {plan?.cancellationNoticeDays && <div><span className="font-medium text-gray-700">Cancellation Notice:</span> {plan.cancellationNoticeDays} days</div>}
                      {plan?.cancellationFeeCents && <div><span className="font-medium text-gray-700">Early Termination Fee:</span> {formatCents(plan.cancellationFeeCents)}</div>}
                      {pkg?.sessionsIncluded && <div><span className="font-medium text-gray-700">Sessions:</span> {pkg.sessionsIncluded}</div>}
                      {pkg?.expirationDays && <div><span className="font-medium text-gray-700">Expires:</span> {pkg.expirationDays} days from purchase</div>}
                    </div>

                    {/* Plan-specific clauses */}
                    {plan?.contractClauses && (() => {
                      try {
                        const clauses: { id: string; title: string; content: string }[] = JSON.parse(plan.contractClauses);
                        return clauses.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {clauses.map((c) => (
                              <div key={c.id}>
                                <h4 className="text-xs font-semibold text-gray-700">{c.title}</h4>
                                <p className="text-xs text-gray-600 whitespace-pre-wrap">{c.content}</p>
                              </div>
                            ))}
                          </div>
                        ) : null;
                      } catch { return null; }
                    })()}
                  </div>
                );
              })}

              {/* Global Contract Clauses */}
              {globalContractClauses.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Terms & Conditions</h3>
                  <div className="space-y-3">
                    {globalContractClauses.map((clause) => (
                      <div key={clause.id}>
                        <h4 className="text-xs font-semibold text-gray-700">{clause.title}</h4>
                        <p className="text-xs text-gray-600 whitespace-pre-wrap">{clause.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signature */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">Signature</h3>
                <p className="text-xs text-gray-500 mb-2">
                  By signing below, I acknowledge that I have read and agree to the terms above.
                </p>
                <div className="relative rounded-md border-2 border-gray-300 bg-white">
                  <canvas
                    ref={sigCanvasRef}
                    width={600}
                    height={200}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: "150px", minHeight: "150px" }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-gray-300 text-lg select-none">Sign Here</span>
                    </div>
                  )}
                </div>
                {hasSignature && (
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="mt-1 text-xs text-primary hover:underline"
                  >
                    Clear Signature
                  </button>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button
                onClick={handleSignContract}
                disabled={!hasSignature || contractSigning}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {contractSigning ? "Processing..." : "Sign & Complete Sale"}
              </button>
              <button
                onClick={() => { setShowContractSigning(false); setHasSignature(false); }}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
