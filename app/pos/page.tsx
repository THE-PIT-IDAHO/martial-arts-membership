"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { serializePaymentMethod } from "@/lib/payment-utils";
import { filterAndRankMembers } from "@/lib/member-search";
import { getTodayString, parseLocalDate } from "@/lib/dates";
import { generateWaiverPdf, type InfoBlock, type BodySection } from "@/lib/waiver-pdf";

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
  // When false the plan is manual-renewal even on a recurring cycle;
  // the contract wording flips from "auto-charged... until cancelled"
  // to "manual renewal each cycle". Server default is true.
  autoRenew: boolean | null;
  contractLengthMonths: number | null; // Actually stores days
  cancellationNoticeDays: number | null;
  cancellationFeeCents: number | null;
  // Editable per-plan cancellation procedure text. Renders inside the
  // contract's Cancellation block (between the box title and the
  // notice/fee rows) so admins can spell out exactly how a member is
  // supposed to cancel.
  cancellationProcedure: string | null;
  contractClauses: string | null;
  allowedStyles: string | null;
  // Access controls — surfaced on the contract only when the plan has
  // a value set (omit empties to keep the page clean).
  classesPerDay: number | null;
  classesPerWeek: number | null;
  classesPerMonth: number | null;
  promoCode: string | null;
  // Additional discount types attached at the plan level. None of these
  // change the at-signup price (that's the cart-modal discount only) —
  // they're surfaced on the contract as informational lines so the
  // member sees every discount applicable to their plan.
  familyDiscountPercent: number | null;
  rankPromotionDiscountPercent: number | null;
  rankPromotionDiscountFlatCents: number | null;
  otherDiscountPercent: number | null;
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

// Persisted Bundle from /api/pos/bundles. Only product-kind items are
// supported in v1 (kind stays a string so a Phase 2 can slot in
// "membership" / "service" without a schema change).
type BundleItemRow = {
  id: string;
  // "product" | "membership" | "service"
  kind: string;
  productId: string | null;
  membershipPlanId: string | null;
  servicePackageId: string | null;
  nameCached: string;
  quantity: number;
  selectedSize: string | null;
  selectedColor: string | null;
  sortOrder: number;
};

type Bundle = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  active: boolean;
  sortOrder: number;
  items: BundleItemRow[];
};

// The admin form's live state. `id: null` means "creating a new
// bundle"; a string id is "editing an existing bundle". `items` is
// mutable per-row (add/remove/reorder), keyed by cid so React
// reconciles a new row cleanly even before it's saved.
type BundleEditorDraftItem = {
  cid: string;
  kind: "product" | "membership" | "service";
  // Exactly one of these is set, matching `kind`.
  productId: string;
  membershipPlanId: string;
  servicePackageId: string;
  nameCached: string;
  quantity: number;
};
type BundleEditorState = {
  id: string | null;
  name: string;
  description: string;
  priceDollars: string;
  active: boolean;
  items: BundleEditorDraftItem[];
  saving: boolean;
  error: string | null;
};

// One row per variant-required product inside a bundle being added to
// the cart. `picks` holds the operator's per-row size / color choices.
// bundleItemId is the BundleItem.id so different rows referencing the
// same product still get independent slots.
type BundleAddPickerVariantRow = {
  bundleItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  sizes: string[];
  colors: string[];
  variantLabel1: string;
  variantLabel2: string;
};
type BundleAddPickerState = {
  bundle: Bundle;
  variantRows: BundleAddPickerVariantRow[];
  picks: Record<string, { size: string | null; color: string | null }>;
};

// Snapshot of one slot inside a bundle. Rides along on the bundle
// cart line so the server can process side effects per contained
// item (inventory decrement for products, Membership create for
// memberships, MemberServiceCredit create for services) without
// hitting the DB again to re-read the bundle.
type BundleCartContent = {
  kind: "product" | "membership" | "service";
  // Exactly one of these is set, matching `kind`.
  productId?: string;
  membershipPlanId?: string;
  servicePackageId?: string;
  nameCached: string;
  quantity: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
};

type CartItem = {
  id: string;
  type: "product" | "membership" | "credit" | "gift" | "service" | "bundle";
  // Bundle-only: source Bundle.id + the list of products this bundle
  // contains. The transactions route reads bundleContents on a
  // type:"bundle" line to decrement inventory for each product.
  bundleId?: string;
  bundleContents?: BundleCartContent[];
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
  // Per-sale override of the plan's recurring-vs-one-time behavior.
  // When set, the agreement modal + printable contract read from
  // THIS instead of plan.billingCycle -- so an admin toggling
  // "One Time" in the Configure popover on a normally-recurring plan
  // (or vice versa) gets contract wording that matches what they
  // actually chose for this sale. Undefined = use plan default.
  isRecurringOverride?: boolean;
  firstMonthDiscountOnly?: boolean;
  // Cents reduced by the discount control (not just a custom price change).
  // Lets the contract surface a discount line only when one was actually
  // applied via the discount input — a custom-priced plan with no
  // discount control use will leave this 0 / undefined.
  discountAppliedCents?: number;
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
  // Direct override for the FIRST payment (the amount charged now).
  // When empty string, first payment falls back to customPrice minus
  // discount (the original derived behavior). When populated it wins
  // over any discount math so the admin has a "make this charge $X"
  // escape hatch that doesn't require calculating a discount value.
  customFirstPayment: string;
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
  // Keyboard-nav highlight for the member search results dropdown.
  // -1 = no arrow key pressed yet; Enter still picks the top row.
  const [memberHighlightedIdx, setMemberHighlightedIdx] = useState<number>(-1);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [catalogTab, setCatalogTab] = useState<"products" | "memberships" | "bundles" | "credit" | "gift" | "services">("products");
  // Bundles: fetched once with the rest of the catalog, rendered as a
  // dedicated tile grid, and admin-editable inline from the same tab.
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [bundleEditor, setBundleEditor] = useState<BundleEditorState | null>(null);
  // Variant picker for a bundle being added to the cart: if any
  // included product has size/color variants, the operator picks them
  // HERE (not in the bundle definition), so inventory decrements land
  // on the right variant row for this specific sale.
  const [bundleAddPicker, setBundleAddPicker] = useState<BundleAddPickerState | null>(null);

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
    // COMP = the amount is comped (complimentary) — no external
    // payment processed. Recorded on the transaction so it shows up
    // in reporting as free-of-charge rather than blending into cash.
    method: "CASH" | "CARD" | "CHECK" | "ACCOUNT" | "SAVED_CARD" | "COMP";
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

  // Member-profile discounts. Fetched when a member is attached to the
  // sale; each row carries a scope (POS / MEMBERSHIP / PROMOTION / ALL)
  // and a percent + flat off. Applied on top of manual per-line and
  // per-section discounts so the cashier sees the true out-the-door
  // price the moment the member is selected. Server independently
  // re-applies these in /api/pos/transactions, so a tampered client
  // never gets a bigger discount than the DB actually allows.
  type MemberDiscountRow = {
    id: string;
    label: string | null;
    appliesTo: string;
    percentOff: number | null;
    flatCents: number | null;
    oneTime: boolean;
  };
  const [memberDiscountRows, setMemberDiscountRows] = useState<MemberDiscountRow[]>([]);

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
    customFirstPayment: "",
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

  // Helper: set last transaction and auto-email receipt
  // Holds the signed-contract payload between "member signed in the modal"
  // and "transaction actually saved". We POST to /api/contracts/sign only
  // after the transaction completes successfully, so if the admin backs
  // out mid-checkout no orphan SignedContract row is created.
  // Using a ref (not state) so set + read are synchronous across the async
  // checkout flow.
  const pendingContractRef = useRef<{
    memberId: string;
    memberName: string;
    planName: string;
    itemsSummary: string;
    contractContent: string;
    signatureData: string;
    pdfBase64: string;
  } | null>(null);

  function completeTransaction(txn: { id: string; transactionNumber: string }) {
    setLastTransaction(txn);

    // Email path. Two cases:
    //  A. Contract was signed in this checkout -- /api/contracts/sign
    //     will save the SignedContract AND fire ONE combined
    //     "Purchase Complete" email with BOTH the receipt PDF and the
    //     contract PDF attached. Skip /api/pos/send-receipt so the
    //     member doesn't receive two emails.
    //  B. No contract -- fire /api/pos/send-receipt to send the
    //     receipt-only "Purchase Complete" email.
    const pending = pendingContractRef.current;
    if (pending) {
      pendingContractRef.current = null;
      fetch("/api/contracts/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pending, transactionId: txn.id }),
      }).catch((err) => {
        console.error("Failed to save signed contract:", err);
      });
    } else {
      fetch("/api/pos/send-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txn.id }),
      }).catch(() => {}); // silent fail — receipt is optional
    }
  }

  // Payment processor integration
  const [activeProcessor, setActiveProcessor] = useState<string | null>(null);
  const [stripePolling, setStripePolling] = useState(false);
  const [savedCard, setSavedCard] = useState<{ brand: string; last4: string } | null>(null);
  // Publishable key + currency captured from the tenant's Settings so
  // the card modal can init Stripe.js Elements in DEFERRED mode --
  // Elements can now render the card fields without a PaymentIntent
  // client_secret. The PI itself is created only when the admin clicks
  // Pay Amount inside the modal, so cancelling before that click never
  // touches Stripe at all.
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [stripeCurrency, setStripeCurrency] = useState<string>("usd");
  const [cardPaymentData, setCardPaymentData] = useState<{
    publishableKey: string;
    currency: string;
    amountCents: number;
    memberName: string;
    lineItems: unknown[];
    memberId: string | null;
    metadata: Record<string, string>;
    existingTransactionId: string | null | undefined;
    existingTransactionNumber: string | null | undefined;
  } | null>(null);

  // Track if we've applied URL params
  const [urlParamsApplied, setUrlParamsApplied] = useState(false);

  // Contract signing state
  type ContractClause = { id: string; title: string; content: string };
  const [showContractSigning, setShowContractSigning] = useState(false);
  const [contractSigning, setContractSigning] = useState(false);
  const [globalContractClauses, setGlobalContractClauses] = useState<ContractClause[]>([]);

  // Kiosk lock state: when true, hide Cancel + side nav, go fullscreen so the
  // member can't navigate away while signing. Unlock requires the staff PIN.
  const [kioskLocked, setKioskLocked] = useState(false);
  const [kioskUnlockPin, setKioskUnlockPin] = useState("1234"); // loaded from Settings
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [unlockAttempt, setUnlockAttempt] = useState("");
  const [unlockError, setUnlockError] = useState("");
  // When a sale completes while locked, capture a snapshot of the member name
  // so we can show a success screen until staff unlocks. (selectedMember gets
  // cleared by resetAfterCheckout before staff gets the tablet back.)
  const [lockedSaleSummary, setLockedSaleSummary] = useState<{ memberName: string } | null>(null);
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [gymEmail, setGymEmail] = useState("");
  const [gymLogo, setGymLogo] = useState("");
  // Loaded HTMLImageElement form of the logo, ready to embed in contract
  // PDFs via the shared waiver-pdf lib.
  const [gymLogoImg, setGymLogoImg] = useState<HTMLImageElement | null>(null);
  // Style ID → name lookup so the contract can render real style names
  // for the plan's allowedStyles list (which stores cuids on the model).
  const [stylesById, setStylesById] = useState<Record<string, string>>({});
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

  // Load saved card when member is selected
  useEffect(() => {
    setSavedCard(null);
    if (!selectedMember) return;
    fetch(`/api/members/${selectedMember.id}/payment-methods`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.paymentMethods?.length > 0 && data.defaultId) {
          const def = data.paymentMethods.find((pm: { id: string; brand: string; last4: string }) => pm.id === data.defaultId);
          if (def) setSavedCard({ brand: def.brand, last4: def.last4 });
          else setSavedCard({ brand: data.paymentMethods[0].brand, last4: data.paymentMethods[0].last4 });
        }
      })
      .catch(() => {});
  }, [selectedMember]);

  // Load member-profile discounts on member select. Cleared to [] on
  // deselect so a lingering set from a previous member never applies
  // to the next sale.
  useEffect(() => {
    if (!selectedMember) {
      setMemberDiscountRows([]);
      return;
    }
    fetch(`/api/members/${selectedMember.id}/discounts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setMemberDiscountRows(Array.isArray(data?.discounts) ? data.discounts : []);
      })
      .catch(() => setMemberDiscountRows([]));
  }, [selectedMember]);

  async function fetchData() {
    setLoading(true);
    try {
      const [itemsRes, plansRes, membersRes, settingsRes, svcRes, stylesRes, bundlesRes] = await Promise.all([
        fetch("/api/pos/items"),
        fetch("/api/membership-plans"),
        fetch("/api/members"),
        fetch("/api/settings"),
        fetch("/api/service-packages"),
        fetch("/api/styles"),
        fetch("/api/pos/bundles"),
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
      if (bundlesRes.ok) {
        const data = await bundlesRes.json();
        setBundles(data.bundles || []);
      }
      if (stylesRes.ok) {
        const data = await stylesRes.json();
        const map: Record<string, string> = {};
        for (const s of data.styles || []) {
          if (s.id && s.name) map[s.id] = s.name;
        }
        setStylesById(map);
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
          const ga = settingsMap.get("gymAddress");
          if (ga) setGymAddress(ga);
          const gp = settingsMap.get("gymPhone");
          if (gp) setGymPhone(gp);
          const ge = settingsMap.get("gymEmail");
          if (ge) setGymEmail(ge);
          const gl = settingsMap.get("gymLogo");
          if (gl) {
            setGymLogo(gl);
            // Pre-load as HTMLImageElement so the contract PDF can embed
            // it via the shared waiver-pdf lib (which downsamples + JPEG-
            // compresses to keep PDF size sane).
            const img = new Image();
            img.onload = () => setGymLogoImg(img);
            img.src = gl;
          }
          // Load global contract clauses
          const cc = settingsMap.get("contract_clauses");
          if (cc) { try { setGlobalContractClauses(JSON.parse(cc)); } catch { /* ignore */ } }
          // Kiosk unlock PIN — defaults to 1234 if unset. Stored in Settings so
          // the user can change it from the SQL editor or a future settings UI.
          const pin = settingsMap.get("kiosk_unlock_pin");
          if (pin && /^\d{4,8}$/.test(pin)) setKioskUnlockPin(pin);
          // Grab Stripe publishable key + currency for the deferred
          // Elements init. Publishable keys are public by design, so
          // exposing them to the POS bundle isn't a leak. Env-var
          // fallback matches the create-payment-intent route's order.
          const pkFromDb = settingsMap.get("payment_stripe_publishable_key");
          if (pkFromDb) setStripePublishableKey(pkFromDb);
          const curFromDb = settingsMap.get("currency");
          if (curFromDb) setStripeCurrency(curFromDb.toLowerCase());
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

  // Filter bundles by search + only active ones show in the POS tile
  // grid (admin still sees all of them in the manage view).
  const filteredBundles = bundles.filter((b) => {
    if (!b.active) return false;
    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q) ||
        b.items.some((it) => it.nameCached.toLowerCase().includes(q))
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

  // Filter + rank members via the shared search helper so POS uses
  // the same behavior as the kiosk + /api/members?search=. Prefix
  // matches float above mid-word matches ("nic" -> Nick before
  // Dominick) instead of whatever insertion order the members array
  // arrived in.
  const filteredMembers = (memberSearch ? filterAndRankMembers(members, memberSearch) : members).slice(0, 10);

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

  // Add a Bundle to the cart as a single line at the bundle's fixed
  // price. The bundle line carries a snapshot of every contained
  // product (bundleContents) so the transactions route can decrement
  // inventory for each without re-fetching the bundle definition --
  // which also means an admin editing a bundle after the cart is
  // built doesn't retroactively change what's in this sale.
  function addBundleToCart(bundle: Bundle) {
    // Bundles that contain a membership require a selected member --
    // same rule as a bare membership sale. Same for services.
    const needsMember = bundle.items.some((it) => it.kind === "membership" || it.kind === "service");
    if (needsMember && !selectedMember) {
      alert("Please select a member first -- this bundle includes a membership or appointment.");
      return;
    }

    // Any variant-required products inside the bundle prompt the
    // operator for size / color at add-to-cart time. Picking variants
    // in the bundle definition would be wrong -- an operator might
    // want the same "New Student Special" bundle to include a
    // "Medium White Gi" for one sale and "Large Blue Gi" for the
    // next.
    const variantRows: BundleAddPickerVariantRow[] = [];
    for (const it of bundle.items) {
      if (it.kind !== "product" || !it.productId) continue;
      const prod = items.find((p) => p.id === it.productId);
      if (!prod || !hasVariants(prod)) continue;
      const sizes: string[] = prod.sizes ? (typeof prod.sizes === "string" ? JSON.parse(prod.sizes) : prod.sizes) : [];
      const colors: string[] = prod.colors ? (typeof prod.colors === "string" ? JSON.parse(prod.colors) : prod.colors) : [];
      variantRows.push({
        bundleItemId: it.id,
        productId: prod.id,
        productName: prod.name,
        quantity: it.quantity,
        sizes,
        colors,
        variantLabel1: prod.variantLabel1 || "Size",
        variantLabel2: prod.variantLabel2 || "Color",
      });
    }

    if (variantRows.length > 0) {
      const picks: Record<string, { size: string | null; color: string | null }> = {};
      for (const row of variantRows) {
        picks[row.bundleItemId] = {
          size: row.sizes[0] || null,
          color: row.colors[0] || null,
        };
      }
      setBundleAddPicker({ bundle, variantRows, picks });
      return;
    }

    finalizeBundleToCart(bundle, {});
  }

  // Actually push the bundle line into the cart, applying per-row
  // variant picks from the picker (if any).
  function finalizeBundleToCart(
    bundle: Bundle,
    picksByBundleItemId: Record<string, { size: string | null; color: string | null }>,
  ) {
    const contents: BundleCartContent[] = bundle.items
      .filter((it) => {
        if (it.kind === "product") return !!it.productId;
        if (it.kind === "membership") return !!it.membershipPlanId;
        if (it.kind === "service") return !!it.servicePackageId;
        return false;
      })
      .map((it) => {
        const pick = picksByBundleItemId[it.id];
        return {
          kind: it.kind as "product" | "membership" | "service",
          productId: it.productId || undefined,
          membershipPlanId: it.membershipPlanId || undefined,
          servicePackageId: it.servicePackageId || undefined,
          nameCached: it.nameCached,
          quantity: it.quantity,
          selectedSize: pick ? pick.size : it.selectedSize,
          selectedColor: pick ? pick.color : it.selectedColor,
        };
      });
    setCart((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "bundle",
        bundleId: bundle.id,
        itemName: bundle.name,
        unitPriceCents: bundle.priceCents,
        quantity: 1,
        bundleContents: contents,
      },
    ]);
    setBundleAddPicker(null);
  }

  // Bundle admin (create + edit). The editor state is a live draft;
  // Save commits to the API and re-fetches the bundle list. Cancel
  // discards without touching anything on the server.
  function openNewBundleEditor() {
    setBundleEditor({
      id: null,
      name: "",
      description: "",
      priceDollars: "",
      active: true,
      items: [],
      saving: false,
      error: null,
    });
  }
  function openEditBundleEditor(b: Bundle) {
    setBundleEditor({
      id: b.id,
      name: b.name,
      description: b.description || "",
      priceDollars: (b.priceCents / 100).toFixed(2),
      active: b.active,
      items: b.items.map((it) => ({
        cid: crypto.randomUUID(),
        kind: (it.kind === "membership" || it.kind === "service" ? it.kind : "product") as
          "product" | "membership" | "service",
        productId: it.productId || "",
        membershipPlanId: it.membershipPlanId || "",
        servicePackageId: it.servicePackageId || "",
        nameCached: it.nameCached,
        quantity: it.quantity,
      })),
      saving: false,
      error: null,
    });
  }
  function closeBundleEditor() { setBundleEditor(null); }

  async function refetchBundles() {
    try {
      const res = await fetch("/api/pos/bundles");
      if (res.ok) {
        const data = await res.json();
        setBundles(data.bundles || []);
      }
    } catch { /* leave the stale list; user can retry */ }
  }

  async function saveBundleEditor() {
    if (!bundleEditor) return;
    if (!bundleEditor.name.trim()) {
      setBundleEditor({ ...bundleEditor, error: "Give the bundle a name." });
      return;
    }
    const priceCents = parseCents(bundleEditor.priceDollars);
    if (priceCents < 0) {
      setBundleEditor({ ...bundleEditor, error: "Bundle price must be zero or more." });
      return;
    }
    // A row is valid iff its ref-id for its kind is filled in.
    const validItems = bundleEditor.items.filter((it) => {
      if (it.kind === "product") return !!it.productId;
      if (it.kind === "membership") return !!it.membershipPlanId;
      if (it.kind === "service") return !!it.servicePackageId;
      return false;
    });
    if (validItems.length === 0) {
      setBundleEditor({ ...bundleEditor, error: "Add at least one item to the bundle." });
      return;
    }
    setBundleEditor({ ...bundleEditor, saving: true, error: null });
    try {
      const payload = {
        name: bundleEditor.name.trim(),
        description: bundleEditor.description.trim() || null,
        priceCents,
        active: bundleEditor.active,
        items: validItems.map((it) => ({
          kind: it.kind,
          productId: it.kind === "product" ? it.productId : null,
          membershipPlanId: it.kind === "membership" ? it.membershipPlanId : null,
          servicePackageId: it.kind === "service" ? it.servicePackageId : null,
          nameCached: it.nameCached,
          quantity: Math.max(1, Math.floor(it.quantity)),
        })),
      };
      const res = await fetch(
        bundleEditor.id ? `/api/pos/bundles/${bundleEditor.id}` : "/api/pos/bundles",
        {
          method: bundleEditor.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBundleEditor((prev) => prev ? { ...prev, saving: false, error: data.error || "Failed to save bundle" } : prev);
        return;
      }
      await refetchBundles();
      closeBundleEditor();
    } catch (err) {
      console.error("Failed to save bundle:", err);
      setBundleEditor((prev) => prev ? { ...prev, saving: false, error: "Failed to save bundle" } : prev);
    }
  }

  async function handleDeleteBundle(b: Bundle) {
    if (!window.confirm(`Delete bundle "${b.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/pos/bundles/${b.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Failed to delete bundle.");
        return;
      }
      await refetchBundles();
    } catch {
      alert("Failed to delete bundle.");
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
      // Blank by default -- lets the derived "first payment = price -
      // discount" flow run unless the admin explicitly overrides it.
      customFirstPayment: "",
      customPrice: (totalPrice / 100).toFixed(2),
      discountType: "percent",
      discountValue: "",
      firstMonthDiscountOnly: false,
    });
    setShowMembershipModal(true);
  }

  // Calculate end date from start date and duration.
  // Rendered inline in the Configure Membership modal, so a mid-typing
  // startDate like "2026-08" (native date input's intermediate state
  // while the operator types the year/month) must NOT throw --
  // date.toISOString() on an invalid Date raises RangeError and takes
  // down the whole POS page. Guard: bail to "" on any parse failure.
  function calculateEndDate(startDate: string, value: number, unit: string): string {
    if (!startDate) return "";
    const date = new Date(startDate);
    if (isNaN(date.getTime())) return "";
    const n = Number.isFinite(value) && value > 0 ? value : 1;
    switch (unit) {
      case "days":
        date.setDate(date.getDate() + n);
        break;
      case "weeks":
        date.setDate(date.getDate() + n * 7);
        break;
      case "months":
        date.setMonth(date.getMonth() + n);
        break;
      case "years":
        date.setFullYear(date.getFullYear() + n);
        break;
    }
    // End date is EXCLUSIVE -- a 1-year membership starting Apr 1
    // runs through Mar 31 the following year, then the next billing
    // period picks up Apr 1. Without the -1 the membership shows an
    // extra day and looks identical to the next-payment date.
    date.setDate(date.getDate() - 1);
    if (isNaN(date.getTime())) return "";
    try {
      return date.toISOString().split("T")[0];
    } catch {
      return "";
    }
  }

  // Add membership to cart from modal.
  //
  // Price + Discount are independent inputs:
  //   - Price = the recurring amount the member will be billed every cycle
  //     (overrides the plan default for THIS signup only — the plan row in
  //     the DB is untouched).
  //   - Discount = subtracted from the first payment.
  //   - "First month discount only" checked → discount applies only to the
  //     first payment; recurring stays at Price.
  //   - Unchecked → discount applies every cycle; recurring also = Price - Discount.
  //
  // Lets the admin do things like "$80/mo recurring (down from $100) with
  // $20 off the first month" without one input clobbering the other.
  function addMembershipToCart() {
    if (!selectedPlanForConfig) return;

    const plan = selectedPlanForConfig;
    const basePriceCents = (plan.priceCents || 0) + (plan.setupFeeCents || 0);
    const priceCents = parseCents(membershipConfig.customPrice);

    let discountAppliedCents = 0;
    if (membershipConfig.discountValue) {
      if (membershipConfig.discountType === "percent") {
        const discountPct = parseFloat(membershipConfig.discountValue);
        if (!isNaN(discountPct) && discountPct > 0) {
          discountAppliedCents = Math.round(priceCents * discountPct / 100);
        }
      } else {
        const discountAmountCents = parseCents(membershipConfig.discountValue);
        if (discountAmountCents > 0) {
          discountAppliedCents = discountAmountCents;
        }
      }
    }
    discountAppliedCents = Math.max(0, Math.min(priceCents, discountAppliedCents));

    // Same precedence as the preview panel: an explicit First Payment
    // override wins over the derived (price - discount) amount. Blank
    // input falls through to the derivation. Recurring is always
    // computed from the plan's recurring price (± discount when the
    // "first payment only" flag is off), never from the first-payment
    // override -- that's what makes it an override "for this charge".
    const derivedFirstPaymentCents = Math.max(0, priceCents - discountAppliedCents);
    const firstPaymentOverrideCents = membershipConfig.customFirstPayment.trim()
      ? Math.max(0, parseCents(membershipConfig.customFirstPayment))
      : null;
    const firstPaymentCents = firstPaymentOverrideCents != null
      ? firstPaymentOverrideCents
      : derivedFirstPaymentCents;
    const recurringCents = membershipConfig.firstMonthDiscountOnly
      ? priceCents
      : derivedFirstPaymentCents;

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
        unitPriceCents: firstPaymentCents,
        quantity: 1,
        // customPriceCents drives recurring billing on the Membership row.
        // Only persist it when it differs from the plan's default, so plans
        // that weren't customized still pick up future plan-price changes.
        customPriceCents: recurringCents !== basePriceCents ? recurringCents : undefined,
        membershipStartDate: membershipConfig.startDate,
        membershipEndDate: endDate,
        // Persist the recurring/one-time toggle whenever it differs from
        // the plan's own billingCycle -- lets the contract wording
        // follow what the admin picked in Configure, not what the plan
        // template says. Matches plan default -> undefined so the cart
        // stays "clean" and future plan changes flow through.
        isRecurringOverride: (() => {
          const planIsRecurring = (plan.billingCycle?.toUpperCase() || "MONTHLY") !== "ONE_TIME";
          return membershipConfig.isRecurring !== planIsRecurring
            ? membershipConfig.isRecurring
            : undefined;
        })(),
        firstMonthDiscountOnly: membershipConfig.firstMonthDiscountOnly,
        discountAppliedCents: discountAppliedCents > 0 ? discountAppliedCents : undefined,
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
  // Bundles get their own bucket. Excluded from the product-section
  // discount (bundles are pre-priced) and from the sales-tax base
  // (Cruz's rule: buy the bundle, items are free with it, no tax).
  const bundleItems = cart.filter(item => item.type === "bundle");

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
  // Bundles are pre-priced -- no per-item or per-section discount
  // controls -- so calcSection with no discount is really just a
  // subtotal helper here.
  const bundleCalc = calcSection(bundleItems, "percent", "");

  // Member-profile discounts. Rules match the server (
  // app/api/pos/transactions/route.ts):
  //   - POS-scope rows apply to the non-membership subtotal (products,
  //     services, credit, gift).
  //   - MEMBERSHIP-scope rows apply to the membership subtotal (first
  //     payment at signup; recurring cycles are discounted separately
  //     by the billing job).
  //   - ALL-scope rows apply once to the whole cart -- routed here to
  //     the non-membership bucket if there ARE non-membership items,
  //     otherwise to the membership bucket. Prevents flat-cents ALL
  //     discounts from being counted twice.
  // Applied on top of manual per-line + per-section discounts (i.e.
  // against the post-manual-discount subtotals) so the two systems
  // stack rather than fight.
  function computeDiscountFromRows(
    rows: MemberDiscountRow[],
    base: number,
  ): number {
    if (rows.length === 0 || base <= 0) return 0;
    let percent = 0;
    let flat = 0;
    for (const r of rows) {
      percent += r.percentOff ?? 0;
      flat += r.flatCents ?? 0;
    }
    const fromPct = Math.round((base * Math.min(percent, 100)) / 100);
    return Math.min(base, fromPct + flat);
  }

  const membershipCartTotal = serviceItems
    .filter((i) => i.type === "membership")
    .reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const nonMembershipCartTotal = serviceCalc.total + productCalc.total - membershipCartTotal;

  const posDiscountRows = memberDiscountRows.filter((r) => r.appliesTo === "POS");
  const membershipDiscountRows = memberDiscountRows.filter((r) => r.appliesTo === "MEMBERSHIP");
  const allScopeRows = memberDiscountRows.filter((r) => r.appliesTo === "ALL");

  // ALL-scope goes to whichever bucket has room. Prefer non-membership
  // when there is any, so a "10% off everything" discount visibly
  // reduces the products total (the more common ask).
  const posBucketRows =
    nonMembershipCartTotal > 0
      ? [...posDiscountRows, ...allScopeRows]
      : posDiscountRows;
  const membershipBucketRows =
    nonMembershipCartTotal > 0
      ? membershipDiscountRows
      : [...membershipDiscountRows, ...allScopeRows];

  const memberDiscountPosCents = computeDiscountFromRows(posBucketRows, nonMembershipCartTotal);
  const memberDiscountMembershipCents = computeDiscountFromRows(
    membershipBucketRows,
    membershipCartTotal,
  );
  const memberDiscountCents = memberDiscountPosCents + memberDiscountMembershipCents;

  // Human-readable label for the summary line. Prefers the actual
  // NAMES of the applied discounts (from MemberDiscount.label -- for
  // template-spawned rows this is the template name like "Family
  // Discount"). If no rows carry a label at all, falls back to the
  // math summary ("10% + -$5.00") so the line is never bare.
  const memberDiscountLabel = (() => {
    if (memberDiscountCents <= 0) return "";
    const names = memberDiscountRows
      .map((r) => (r.label || "").trim())
      .filter(Boolean);
    if (names.length > 0) {
      return Array.from(new Set(names)).join(", ");
    }
    const totalPct = memberDiscountRows.reduce((s, r) => s + (r.percentOff ?? 0), 0);
    const totalFlat = memberDiscountRows.reduce((s, r) => s + (r.flatCents ?? 0), 0);
    const parts: string[] = [];
    if (totalPct > 0) parts.push(`${Math.min(totalPct, 100)}%`);
    if (totalFlat > 0) parts.push(`-$${(totalFlat / 100).toFixed(2)}`);
    return parts.join(" + ");
  })();

  const subtotalCents = serviceCalc.subtotal + productCalc.subtotal + bundleCalc.subtotal;
  // Manual discounts (per-item + per-section). Sent to the server as
  // `discountCents`; member-profile discounts are OMITTED here because
  // /api/pos/transactions re-computes them from the DB independently
  // as the source of truth. If we also sent them in this bag they'd
  // get double-applied at the server.
  const discountCents =
    serviceCalc.itemDisc +
    serviceCalc.sectionDisc +
    productCalc.itemDisc +
    productCalc.sectionDisc;
  // Tax is on the POST-member-discount product total. Same treatment
  // as manual section discounts -- discounts always reduce the tax
  // base, otherwise a "10% off" promotion accidentally taxes the
  // original price.
  const productTotalAfterMemberDisc = Math.max(0, productCalc.total - memberDiscountPosCents);
  const taxCents = taxRate > 0 ? Math.round((productTotalAfterMemberDisc * taxRate) / 100) : 0;
  const totalCents =
    serviceCalc.total +
    productCalc.total +
    bundleCalc.total -
    memberDiscountCents +
    taxCents;

  // Process checkout
  async function processCheckout() {
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }

    // Check if membership, credit, or service items require a member.
    // Bundle lines count too when they contain a membership or a
    // service -- both need a member to attach the Membership /
    // MemberServiceCredit records to on the server.
    const hasMembership = cart.some((c) => c.type === "membership");
    const hasCredit = cart.some((c) => c.type === "credit");
    const hasService = cart.some((c) => c.type === "service");
    const hasBundleNeedingMember = cart.some(
      (c) => c.type === "bundle" && (c.bundleContents || []).some((bc) => bc.kind === "membership" || bc.kind === "service"),
    );
    const hasAccountPayment = paymentSplits.some((s) => s.method === "ACCOUNT");
    if ((hasMembership || hasCredit || hasService || hasBundleNeedingMember || hasAccountPayment) && !selectedMember) {
      alert("Please select a member to assign the membership, account credit, appointment, or account payment to.");
      return;
    }

    // Prompt to apply available account credit BEFORE running the
    // selected payment method. Skipped when the cashier already
    // picked ACCOUNT, is in split mode (they're managing methods
    // themselves), is comping the sale, or the member has no credit.
    if (
      selectedMember &&
      !isSplitMode &&
      selectedMember.accountCreditCents > 0 &&
      paymentSplits[0]?.method !== "ACCOUNT" &&
      paymentSplits[0]?.method !== "COMP"
    ) {
      const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
      if (effectiveTotal > 0) {
        const credit = selectedMember.accountCreditCents;
        const toApply = Math.min(credit, effectiveTotal);
        const remainder = effectiveTotal - toApply;
        const originalMethod = paymentSplits[0]?.method || "CASH";
        const useCredit = confirm(
          `${selectedMember.firstName} has $${(credit / 100).toFixed(2)} in account credit.\n\n` +
          `Apply $${(toApply / 100).toFixed(2)} of it to this sale first?\n\n` +
          `Yes: charge $${(remainder / 100).toFixed(2)} to ${originalMethod} + $${(toApply / 100).toFixed(2)} to account credit.\n` +
          `No: charge the full $${(effectiveTotal / 100).toFixed(2)} to ${originalMethod}.`
        );
        if (useCredit) {
          if (remainder === 0) {
            // Credit covers everything -- switch to single ACCOUNT
            // payment instead of splitting to a $0 second method.
            setPaymentSplits([
              { id: crypto.randomUUID(), method: "ACCOUNT", amountCents: toApply, label: "" },
            ]);
            setIsSplitMode(false);
          } else {
            setPaymentSplits([
              { id: crypto.randomUUID(), method: "ACCOUNT", amountCents: toApply, label: "" },
              { id: crypto.randomUUID(), method: originalMethod, amountCents: remainder, label: "" },
            ]);
            setIsSplitMode(true);
          }
          alert(
            `Payment updated: $${(toApply / 100).toFixed(2)} account credit${remainder > 0 ? ` + $${(remainder / 100).toFixed(2)} ${originalMethod}` : ""}.\n\n` +
            `Click Checkout again to complete the sale.`
          );
          return;
        }
      }
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

    // Show the signing screen for:
    //   - membership / service sales (contract agreement), OR
    //   - any card charge (CARD or SAVED_CARD) on a chosen member so
    //     the signature captures consent for that charge -- same way
    //     a card receipt is signed at retail.
    const hasCardCharge = paymentSplits.some((s) => s.method === "CARD" || s.method === "SAVED_CARD");
    if ((hasMembership || hasService || hasCardCharge) && selectedMember) {
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
        // Per-sale one-time override wins over the plan's billingCycle
        // -- same rule the modal + printable contract use.
        const cycleUpper = plan?.billingCycle?.toUpperCase() || "MONTHLY";
        const isOneTime = item.isRecurringOverride != null
          ? item.isRecurringOverride === false
          : cycleUpper === "ONE_TIME";
        lines.push(`--- Membership: ${item.itemName} ---`);
        // One-time plans read "Price: $X (one time)" instead of the
        // recurring "Price: $X/one_time" that fell out of the raw enum.
        lines.push(
          isOneTime
            ? `Price: ${formatCents(item.unitPriceCents)} (one time)`
            : `Price: ${formatCents(item.unitPriceCents)}/${plan?.billingCycle?.toLowerCase() || "month"}`,
        );
        if (plan?.contractLengthMonths) {
          const days = plan.contractLengthMonths;
          if (days >= 365 && days % 365 === 0) lines.push(`Contract: ${days / 365} year(s)`);
          else if (days >= 30 && days % 30 === 0) lines.push(`Contract: ${days / 30} month(s)`);
          else lines.push(`Contract: ${days} days`);
        }
        if (item.membershipStartDate) lines.push(`Start Date: ${parseLocalDate(item.membershipStartDate).toLocaleDateString()}`);
        // Same rule as the info-block version: no cancellation lines
        // on a plan with nothing to cancel.
        if (!isOneTime) {
          if (plan?.cancellationNoticeDays) lines.push(`Cancellation Notice: ${plan.cancellationNoticeDays} days`);
          if (plan?.cancellationFeeCents) lines.push(`Early Termination Fee: ${formatCents(plan.cancellationFeeCents)}`);
        }
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

      // Format a contractLengthMonths value (which actually stores days)
      // into a human-friendly "X month(s)" / "Y year(s)" string.
      function formatContractDuration(days: number): string {
        if (days >= 365 && days % 365 === 0) return `${days / 365} year(s)`;
        if (days >= 30 && days % 30 === 0) return `${days / 30} month(s)`;
        return `${days} day(s)`;
      }

      // Match the billing cycle to a readable suffix on price lines:
      // "MONTHLY" → "/month", "YEARLY" → "/year", etc.
      function billingSuffix(cycle: string | undefined | null): string {
        if (!cycle) return "/month";
        const c = cycle.toUpperCase();
        if (c === "WEEKLY") return "/week";
        if (c === "MONTHLY") return "/month";
        if (c === "QUARTERLY") return "/quarter";
        if (c === "YEARLY" || c === "ANNUAL" || c === "ANNUALLY") return "/year";
        return `/${c.toLowerCase()}`;
      }

      // Format "Payment Due" line from a start date: returns something
      // like "11th of each month" — the ordinal day-of-month repeats on
      // every recurring billing cycle.
      function ordinalSuffix(n: number): string {
        const v = n % 100;
        if (v >= 11 && v <= 13) return "th";
        switch (n % 10) {
          case 1: return "st";
          case 2: return "nd";
          case 3: return "rd";
          default: return "th";
        }
      }
      function paymentDueLine(startDateStr: string | undefined, cycle: string | null | undefined): string {
        if (!startDateStr) return "";
        const d = parseLocalDate(startDateStr);
        const day = d.getDate();
        const cadence = (cycle || "MONTHLY").toUpperCase();
        // Match the modal helper -- ONE_TIME is a single dated charge,
        // not a recurring pattern.
        if (cadence === "ONE_TIME") return `${d.toLocaleDateString()} (single charge)`;
        if (cadence === "WEEKLY") return `Every ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
        if (cadence === "YEARLY" || cadence === "ANNUAL" || cadence === "ANNUALLY") {
          return `${day}${ordinalSuffix(day)} of ${d.toLocaleString(undefined, { month: "long" })} each year`;
        }
        return `${day}${ordinalSuffix(day)} of each month`;
      }

      // Render the cart's payment split(s) into a contract-ready string.
      // Single split → just the method ("Visa ····4242", "Cash"). Multi
      // split → method+amount joined with " + " so the contract reflects
      // exactly what the member paid.
      function describePaymentMethod(): string {
        if (paymentSplits.length === 0) return "";
        const labelFor = (method: string): string => {
          switch (method) {
            case "CASH": return "Cash";
            case "CHECK": return "Check";
            case "ACCOUNT": return "Account Credit";
            case "CARD": return "Credit Card";
            case "COMP": return "Comp (Complimentary)";
            case "SAVED_CARD":
              return savedCard
                ? `${savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1)} ····${savedCard.last4}`
                : "Card on file";
            default: return method;
          }
        };
        if (paymentSplits.length === 1 || !isSplitMode) {
          return labelFor(paymentSplits[0].method);
        }
        return paymentSplits.map((s) => `${labelFor(s.method)} ${formatCents(s.amountCents)}`).join(" + ");
      }

      // Build per-item info blocks. Each membership renders as:
      //   • body section "Membership: [Plan Name]" with the description
      //   • info block "Plan Terms" with all the financial + access rows
      //   • info block "Cancellation" grouping notice + early termination
      //   • body sections for plan-specific clauses
      const itemBlocks: InfoBlock[] = [];
      const itemSections: BodySection[] = [];
      for (const item of cart) {
        if (item.type === "membership") {
          const plan = membershipPlans.find((p) => p.id === item.membershipPlanId);
          const planDefaultCents = (plan?.priceCents || 0) + (plan?.setupFeeCents || 0);
          const firstMonthCents = item.unitPriceCents;
          // Recurring is what's stored on the Membership row (item.customPriceCents).
          // Falls back to the plan default when the admin didn't override Price.
          // Previously this used the plan default whenever first-month-only was
          // checked — clobbering any custom recurring price the admin had set.
          const recurringCents = item.customPriceCents ?? planDefaultCents;
          const discountAppliedCents = item.discountAppliedCents || 0;
          const showDiscount = discountAppliedCents > 0;
          const suffix = billingSuffix(plan?.billingCycle);
          // Same one-time / auto-renew rules as the on-screen modal --
          // per-sale Configure toggle wins over the plan's own
          // billingCycle so the printed contract matches what the
          // admin actually sold.
          const cycleUpper = plan?.billingCycle?.toUpperCase() || "MONTHLY";
          const isOneTime = item.isRecurringOverride != null
            ? item.isRecurringOverride === false
            : cycleUpper === "ONE_TIME";
          const isAutoRenew = !isOneTime && plan?.autoRenew !== false;
          const billingCycleLabel = plan?.billingCycle
            ? plan.billingCycle.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
            : "Monthly";

          // Allowed styles → comma-separated list of NAMES (resolved
          // from the stylesById map; falls back to whatever the entry is
          // if the lookup misses — usually only on stale browser caches).
          let allowedStylesStr = "";
          if (plan?.allowedStyles) {
            try {
              const arr = JSON.parse(plan.allowedStyles);
              if (Array.isArray(arr) && arr.length > 0) {
                allowedStylesStr = arr.map((id: string) => stylesById[id] || id).join(", ");
              }
            } catch { /* ignore */ }
          }

          // Build a single "Discount Applied" line that lists every
          // discount kind the plan + this signup carry — labeled inline
          // ("(first payment only)", "(family)", etc.) so the member
          // sees all applicable discounts together. The lib's value
          // wrapper handles long strings.
          const discountSegments: string[] = [];
          if (showDiscount) {
            discountSegments.push(`−${formatCents(discountAppliedCents)}${item.firstMonthDiscountOnly ? " (first payment only)" : " (manual)"}`);
          }
          if (plan?.familyDiscountPercent) {
            discountSegments.push(`${plan.familyDiscountPercent}% (family)`);
          }
          if (plan?.rankPromotionDiscountPercent) {
            discountSegments.push(`${plan.rankPromotionDiscountPercent}% (rank promotion fee)`);
          }
          if (plan?.rankPromotionDiscountFlatCents) {
            discountSegments.push(`−${formatCents(plan.rankPromotionDiscountFlatCents)} (rank promotion fee)`);
          }
          if (plan?.otherDiscountPercent) {
            discountSegments.push(`${plan.otherDiscountPercent}% (other)`);
          }
          const discountLine = discountSegments.join(", ");

          // Build the rows in the order the admin requested. Empty
          // values get filtered out by the lib, so unset access controls
          // / promo code don't render — keeps the contract tight.
          const paymentMethodStr = describePaymentMethod();
          const planTermsRows: Array<{ label: string; value?: string | null }> = [
            { label: "Start Date", value: item.membershipStartDate ? parseLocalDate(item.membershipStartDate).toLocaleDateString() : "" },
            ...(item.firstMonthDiscountOnly || showDiscount
              ? [{ label: "First Payment", value: formatCents(firstMonthCents) }]
              : []),
            { label: "Contract Length", value: plan?.contractLengthMonths ? formatContractDuration(plan.contractLengthMonths) : "" },
            {
              label: isOneTime ? "Price" : item.firstMonthDiscountOnly ? "Recurring (after first payment)" : "Price",
              value: `${formatCents(recurringCents)}${isOneTime ? "" : suffix}`,
            },
            ...(discountLine ? [{ label: "Discount Applied", value: discountLine }] : []),
            ...(plan?.promoCode ? [{ label: "Promo Code", value: plan.promoCode }] : []),
            { label: "Billing Cycle", value: billingCycleLabel },
            {
              label: "Recurring Payments",
              value: isOneTime
                ? "No — single one-time charge, no auto-renew"
                : isAutoRenew
                  ? "Yes — auto-charged each billing cycle until cancelled"
                  : "No — manual renewal each cycle, not auto-charged",
            },
            { label: isOneTime ? "Charge Date" : "Payment Due", value: paymentDueLine(item.membershipStartDate, plan?.billingCycle) },
            ...(paymentMethodStr ? [{ label: "Payment Method", value: paymentMethodStr }] : []),
            // Access controls — only render if the plan has values set.
            ...(plan?.classesPerDay ? [{ label: "Classes per Day", value: String(plan.classesPerDay) }] : []),
            ...(plan?.classesPerWeek ? [{ label: "Classes per Week", value: String(plan.classesPerWeek) }] : []),
            ...(plan?.classesPerMonth ? [{ label: "Classes per Month", value: String(plan.classesPerMonth) }] : []),
            // Styles: clarify that picking a style includes every class
            // taught under that style — no hidden per-class restrictions.
            ...(allowedStylesStr
              ? [{ label: "Styles Included", value: `${allowedStylesStr} — all classes under these styles` }]
              : []),
          ];

          // Plan Terms info block. The plan description renders inside
          // this block (between the title and the rows) so it stays
          // grouped with the plan's terms instead of getting bumped to
          // the bottom of the document.
          itemBlocks.push({
            title: `${item.itemName} — Plan Terms`,
            description: plan?.description ? plan.description.trim() : undefined,
            rows: planTermsRows,
          });

          // Cancellation block — only render if the plan has any
          // cancellation policy OR a custom cancellation procedure set,
          // AND the plan actually has an ongoing billing cycle to
          // cancel. One-time charges have nothing to cancel, so we
          // suppress the whole block for them regardless of whether
          // stale cancellation fields still linger on the plan record.
          if (!isOneTime && (plan?.cancellationNoticeDays || plan?.cancellationFeeCents || plan?.cancellationProcedure)) {
            itemBlocks.push({
              title: `${item.itemName} — Cancellation`,
              description: plan?.cancellationProcedure ? plan.cancellationProcedure.trim() : undefined,
              rows: [
                { label: "Cancellation Notice", value: plan?.cancellationNoticeDays ? `${plan.cancellationNoticeDays} day(s) before next billing cycle` : "" },
                { label: "Early Termination Fee", value: plan?.cancellationFeeCents ? formatCents(plan.cancellationFeeCents) : "" },
              ],
            });
          }

          // Plan-specific clauses render as body sections after the info
          // blocks.
          if (plan?.contractClauses) {
            try {
              const planClauses: ContractClause[] = JSON.parse(plan.contractClauses);
              for (const clause of planClauses) {
                itemSections.push({ title: clause.title, content: clause.content });
              }
            } catch { /* ignore */ }
          }
        } else if (item.type === "service") {
          const pkg = servicePackages.find((p) => p.id === item.servicePackageId);
          itemBlocks.push({
            title: `${item.itemName} — Service Terms`,
            description: pkg?.description ? pkg.description.trim() : undefined,
            rows: [
              { label: "Price", value: formatCents(item.unitPriceCents) },
              { label: "Sessions Included", value: pkg?.sessionsIncluded ? String(pkg.sessionsIncluded) : "" },
              { label: "Expires", value: pkg?.expirationDays ? `${pkg.expirationDays} days from purchase` : "" },
            ],
          });
        }
      }

      // Member info block always renders first.
      const memberBlock: InfoBlock = {
        title: "Member Information",
        rows: [
          { label: "Name", value: `${selectedMember.firstName} ${selectedMember.lastName}` },
          { label: "Member #", value: selectedMember.memberNumber ? String(selectedMember.memberNumber) : "" },
          { label: "Email", value: selectedMember.email || "" },
          { label: "Phone", value: selectedMember.phone || "" },
          { label: "Date", value: new Date().toLocaleDateString() },
        ],
      };

      const bodySections: BodySection[] = [
        ...itemSections,
        ...globalContractClauses.map((c) => ({ title: c.title, content: c.content })),
      ];

      const pdfBase64 = generateWaiverPdf({
        gym: { name: gymName, address: gymAddress, phone: gymPhone, email: gymEmail },
        logoImage: gymLogoImg,
        waiverTitle: "Membership / Service Agreement",
        infoBlocks: [memberBlock, ...itemBlocks],
        sections: bodySections,
        signatures: [
          {
            title: "Member Signature",
            signaturePng: canvas && hasSignature ? signatureDataUrl : undefined,
            name: `${selectedMember.firstName} ${selectedMember.lastName}`,
            date: new Date().toLocaleDateString(),
          },
        ],
        electronicallySignedAt: new Date().toLocaleString(),
      });

      // 2. Stash the signed contract — DON'T save yet. We hold it in
      // pendingContractRef and only POST after the transaction actually
      // completes. This way, if the admin backs out mid-checkout (e.g.
      // changes the cart and re-signs), no duplicate SignedContract row
      // is created. completeTransaction reads the ref and saves it once.
      const itemsSummary = cart
        .filter(c => c.type === "membership" || c.type === "service")
        .map(c => ({ name: c.itemName, type: c.type, priceCents: c.unitPriceCents }));
      const memberName = `${selectedMember.firstName} ${selectedMember.lastName}`;
      pendingContractRef.current = {
        memberId: selectedMember.id,
        memberName,
        planName: itemsSummary.map(i => i.name).join(", "),
        itemsSummary: JSON.stringify(itemsSummary),
        contractContent: contractText,
        signatureData: signatureDataUrl,
        pdfBase64,
      };

      // 5. Continue with checkout. If we're in kiosk lock mode, keep the modal
      // and lock active and show a Sale Completed screen until staff unlocks.
      // Otherwise close the modal as before.
      setHasSignature(false);
      const wasLocked = kioskLocked;
      const memberNameSnapshot = memberName;

      if (!wasLocked) {
        setShowContractSigning(false);
      }

      // Now continue with the actual checkout (bypass the contract check by calling inner logic directly)
      await executeCheckout();

      if (wasLocked) {
        // executeCheckout resets cart + selectedMember, so we snapshot the name
        // beforehand. The modal will switch to the success screen because of
        // lockedSaleSummary being set.
        setLockedSaleSummary({ memberName: memberNameSnapshot });
      }
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
        // Bundle carrier line: bundleId identifies the source bundle
        // and bundleContents lets the server decrement inventory for
        // each contained product without re-fetching the bundle.
        bundleId: item.bundleId || null,
        bundleContents: item.bundleContents || null,
      }));

      // Saved card — charge directly, no card entry needed
      const isSavedCardPayment = !isSplitMode && paymentSplits[0]?.method === "SAVED_CARD";
      if (isSavedCardPayment && selectedMember) {
        const chargeAmount = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
        const chargeRes = await fetch("/api/pos/charge-saved-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMember.id,
            amountCents: chargeAmount,
            metadata: { cartItems: JSON.stringify(lineItems) },
          }),
        });
        const chargeData = await chargeRes.json();
        if (!chargeData.success) {
          throw new Error(chargeData.error || "Saved card charge failed");
        }
        // Create transaction record
        const txnRes = await fetch("/api/pos/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memberId: selectedMember.id,
            memberName: `${selectedMember.firstName} ${selectedMember.lastName}`,
            lineItems,
            paymentMethod: "CARD",
            notes: notes || null,
            discountCents: (redeemedGift?.appliedCents || 0) + discountCents,
            taxCents,
            serviceDiscountCents: serviceCalc.itemDisc + serviceCalc.sectionDisc,
            productDiscountCents: productCalc.itemDisc + productCalc.sectionDisc,
            paymentIntentId: chargeData.paymentIntentId,
            paymentProcessor: "stripe",
            redeemedGiftCode: redeemedGift?.code || null,
            redeemedGiftAmountCents: redeemedGift?.appliedCents || 0,
          }),
        });
        if (txnRes.ok) {
          const txnData = await txnRes.json();
          completeTransaction({ id: txnData.transaction.id, transactionNumber: txnData.transaction.transactionNumber });
        }
        resetAfterCheckout();
        return;
      }

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

        // Open the card modal WITHOUT creating a Stripe PaymentIntent.
        // Elements initializes in DEFERRED mode so the card fields render
        // off the tenant's publishable key alone; the PI (or SetupIntent
        // for $0 saves) is created only when the admin clicks Pay Amount
        // inside the modal. Cancelling before that click never touches
        // Stripe -- nothing exists there yet.
        if (!stripePublishableKey) throw new Error("Stripe publishable key not configured");
        setCardPaymentData({
          publishableKey: stripePublishableKey,
          currency: stripeCurrency,
          amountCents: cardAmountCents || totalCents,
          memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : "",
          lineItems,
          memberId: selectedMember?.id || null,
          metadata: {
            source: "admin_pos",
            cartItems: JSON.stringify(lineItems),
            ...(selectedMember?.id ? { memberId: selectedMember.id } : {}),
            ...(notes ? { notes } : {}),
            ...(existingTransactionId ? { transactionId: existingTransactionId } : {}),
          },
          existingTransactionId,
          existingTransactionNumber,
        });
        setProcessing(false);
        return;
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
      completeTransaction({ id: data.transaction.id, transactionNumber: data.transaction.transactionNumber });
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
                <div className="flex gap-2 flex-wrap items-center">
                  {([
                    { key: "products" as const, label: `Products (${filteredItems.length})` },
                    { key: "memberships" as const, label: `Memberships (${filteredPlans.length})` },
                    { key: "bundles" as const, label: `Bundles (${filteredBundles.length})` },
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
                  {/* Contextual admin action: manage the CATALOG for the
                      current tab. Products -> full item CRUD page.
                      Bundles -> inline modal in this tab so a coach can
                      spin up a package deal without navigating away. */}
                  {catalogTab === "products" && (
                    <Link
                      href="/pos/items"
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Add Item
                    </Link>
                  )}
                  {catalogTab === "bundles" && (
                    <button
                      type="button"
                      onClick={() => openNewBundleEditor()}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Add Bundle
                    </button>
                  )}
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
                    {filteredPlans.map(plan => {
                      // First payment = recurring price + one-off setup
                      // fee. Recurring = the plan's price alone (what
                      // gets auto-charged next cycle). The two diverge
                      // only when the plan has a setup fee; otherwise
                      // the tile collapses to a single line.
                      const recurringCents = plan.priceCents || 0;
                      const firstPaymentCents = recurringCents + (plan.setupFeeCents || 0);
                      const cycleUpper = plan.billingCycle?.toUpperCase() || "MONTHLY";
                      const isOneTime = cycleUpper === "ONE_TIME";
                      const billingCycleLabel = plan.billingCycle
                        ? plan.billingCycle.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
                        : "Monthly";
                      return (
                        <button
                          key={plan.id}
                          onClick={() => openMembershipConfig(plan)}
                          className="p-3 border border-gray-200 rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors"
                        >
                          <p className="font-medium text-sm">{plan.name}</p>
                          {plan.membershipId && (
                            <p className="text-xs text-gray-500">#{plan.membershipId}</p>
                          )}
                          {/* Price line. One-time plans show a single
                              amount labeled "one-time". Recurring plans
                              show BOTH the "today" charge and the
                              recurring rate whenever a setup fee makes
                              them differ; otherwise a single "$X /
                              cycle" line keeps the tile clean. */}
                          {isOneTime ? (
                            <p className="text-sm font-semibold text-primary mt-1">
                              {formatCents(firstPaymentCents)}{" "}
                              <span className="text-xs font-normal text-gray-500">one-time</span>
                            </p>
                          ) : firstPaymentCents !== recurringCents ? (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-sm font-semibold text-primary">
                                {formatCents(firstPaymentCents)}{" "}
                                <span className="text-xs font-normal text-gray-500">today</span>
                              </p>
                              <p className="text-xs text-gray-600">
                                then {formatCents(recurringCents)} / {billingCycleLabel.toLowerCase()}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-primary mt-1">
                              {formatCents(recurringCents)}{" "}
                              <span className="text-xs font-normal text-gray-500">/ {billingCycleLabel.toLowerCase()}</span>
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">{billingCycleLabel}</p>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {catalogTab === "bundles" && (
                filteredBundles.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No bundles yet. Use <button type="button" onClick={() => openNewBundleEditor()} className="text-primary hover:underline">Add Bundle</button> to package products together at one price.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredBundles.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors flex flex-col gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => addBundleToCart(b)}
                          className="text-left"
                        >
                          <p className="font-medium text-sm truncate">{b.name}</p>
                          {b.description && (
                            <p className="text-xs text-gray-500 truncate">{b.description}</p>
                          )}
                          <p className="text-sm font-semibold text-primary mt-1">
                            {formatCents(b.priceCents)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Includes:{" "}
                            {b.items
                              .map((it) => (it.quantity > 1 ? `${it.quantity}× ${it.nameCached}` : it.nameCached))
                              .join(", ")}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Tax-free</p>
                        </button>
                        <div className="flex justify-end gap-1 pt-1 border-t border-gray-100">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditBundleEditor(b); }}
                            className="text-[10px] font-semibold text-gray-500 hover:text-primary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteBundle(b); }}
                            className="text-[10px] font-semibold text-gray-500 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
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
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      setMemberHighlightedIdx(-1);
                    }}
                    onKeyDown={(e) => {
                      if (!memberSearch || filteredMembers.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMemberHighlightedIdx((prev) => (prev + 1) % filteredMembers.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMemberHighlightedIdx((prev) =>
                          prev <= 0 ? filteredMembers.length - 1 : prev - 1,
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const idx = memberHighlightedIdx >= 0 ? memberHighlightedIdx : 0;
                        setSelectedMember(filteredMembers[idx]);
                        setMemberSearch("");
                        setMemberHighlightedIdx(-1);
                      }
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {memberSearch && filteredMembers.length > 0 && (
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {filteredMembers.map((member, idx) => {
                        const isKeyboardActive = memberHighlightedIdx === idx;
                        const isImplicitDefault = memberHighlightedIdx === -1 && idx === 0;
                        return (
                        <button
                          key={member.id}
                          onClick={() => {
                            setSelectedMember(member);
                            setMemberSearch("");
                            setMemberHighlightedIdx(-1);
                          }}
                          onMouseEnter={() => setMemberHighlightedIdx(idx)}
                          className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${isKeyboardActive ? "bg-primary/10" : isImplicitDefault ? "bg-gray-50" : "hover:bg-gray-50"}`}
                        >
                          <p className="font-medium text-sm">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.memberNumber ? `#${member.memberNumber}` : member.email || member.phone || "No contact"}
                          </p>
                        </button>
                        );
                      })}
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

                  {/* Bundles Section -- shown BEFORE regular products so
                      the "package deal" is the most prominent line in
                      the cart. One row per bundle: name, fixed price,
                      remove. No discount / no quantity control (bundles
                      are single-transaction promos). No tax. */}
                  {bundleItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bundles</span>
                        <span className="text-xs text-gray-400">({bundleItems.length})</span>
                      </div>
                      <div className="space-y-3 pl-2 border-l-2 border-purple-200">
                        {bundleItems.map((item) => (
                          <div key={item.id} className="pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{item.itemName}</p>
                                {item.bundleContents && item.bundleContents.length > 0 && (
                                  <p className="text-xs text-gray-500 truncate">
                                    Includes:{" "}
                                    {item.bundleContents
                                      .map((c) => (c.quantity > 1 ? `${c.quantity}× ${c.nameCached}` : c.nameCached))
                                      .join(", ")}
                                  </p>
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
                          <span>Bundles subtotal</span>
                          <span>{formatCents(bundleCalc.total)}</span>
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
                            // Auto-fill COMP with the remaining balance — comping
                            // is normally "cover whatever's left" so this saves
                            // the admin from typing the amount.
                            if (m === "COMP") {
                              const effectiveTotal = Math.max(0, totalCents - (redeemedGift?.appliedCents || 0));
                              const otherAllocated = prev.filter(o => o.id !== s.id).reduce((sum, o) => sum + o.amountCents, 0);
                              newAmount = Math.max(0, effectiveTotal - otherAllocated);
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
                        <option value="COMP">COMP (Complimentary)</option>
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
                    {(savedCard
                      ? ["SAVED_CARD", "CASH", "CARD", "CHECK", "ACCOUNT", "GIFT", "COMP"] as const
                      : ["CASH", "CARD", "CHECK", "ACCOUNT", "GIFT", "COMP"] as const
                    ).map(method => (
                      <button
                        key={method}
                        onClick={() => {
                          if (method === "ACCOUNT" && !selectedMember) {
                            alert("Please select a member first to use Account payment.");
                            return;
                          }
                          if (method === "GIFT") {
                            setShowRedeemGift(true);
                            return;
                          }
                          setPaymentSplits([{ id: paymentSplits[0]?.id || crypto.randomUUID(), method, amountCents: 0, label: "" }]);
                        }}
                        disabled={method === "ACCOUNT" && !selectedMember}
                        className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          method === "GIFT" && redeemedGift
                            ? "border border-green-500 bg-green-50 text-green-700"
                            : paymentSplits[0]?.method === method
                            ? "border border-primary bg-primary/10 text-primary"
                            : method === "ACCOUNT" && !selectedMember
                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                              : "bg-primary text-white hover:bg-primaryDark"
                        }`}
                      >
                        {method === "SAVED_CARD" && savedCard
                          ? `${savedCard.brand.toUpperCase()} ····${savedCard.last4}`
                          : method === "CARD" && activeProcessor
                          ? `NEW CARD`
                          : method === "GIFT"
                          ? redeemedGift ? `GIFT (-${formatCents(redeemedGift.appliedCents)})` : "GIFT CERT"
                          : method === "ACCOUNT" && selectedMember
                            ? `ACCOUNT (${selectedMember.accountCreditCents >= 0 ? "$" : "-$"}${(Math.abs(selectedMember.accountCreditCents) / 100).toFixed(2)})`
                            : method === "COMP"
                              ? "COMP"
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
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm font-medium">Code: {redeemedGift.code}</p>
                      <p className="text-sm text-green-700 font-semibold">-{formatCents(redeemedGift.appliedCents)}</p>
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
                ) : null}
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
                {memberDiscountCents > 0 && (
                  <div className="flex justify-between text-green-600 pl-3 text-xs">
                    <span>
                      &nbsp;• {memberDiscountLabel || "Member discount"}
                    </span>
                    <span>-{formatCents(memberDiscountCents)}</span>
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
              {(() => {
                const planDefaultCents = (selectedPlanForConfig.priceCents || 0) + (selectedPlanForConfig.setupFeeCents || 0);
                const enteredPriceCents = parseCents(membershipConfig.customPrice);
                const enteredDiscountCents = membershipConfig.discountValue
                  ? membershipConfig.discountType === "percent"
                    ? Math.round(enteredPriceCents * (parseFloat(membershipConfig.discountValue) || 0) / 100)
                    : parseCents(membershipConfig.discountValue)
                  : 0;
                const cappedDiscount = Math.max(0, Math.min(enteredPriceCents, enteredDiscountCents));
                // Derived first payment = recurring - discount. When
                // the admin fills in the First Payment override input
                // below, that wins over the derivation so they can just
                // say "charge $80 today" without doing discount math.
                const derivedFirstPaymentCents = Math.max(0, enteredPriceCents - cappedDiscount);
                const overrideFirstPaymentCents = membershipConfig.customFirstPayment.trim()
                  ? parseCents(membershipConfig.customFirstPayment)
                  : null;
                const firstPaymentCents = overrideFirstPaymentCents != null
                  ? overrideFirstPaymentCents
                  : derivedFirstPaymentCents;
                // One-time plans have no recurring charge -- surface as
                // $0.00 in the preview so the admin can see at a glance
                // that nothing will re-bill. When recurring, either the
                // full plan price (first-payment-only discount) or the
                // discounted amount (discount carried into recurring).
                // The First Payment override does NOT carry into
                // recurring -- it only touches the "charged now" leg.
                const recurringCents = !membershipConfig.isRecurring
                  ? 0
                  : membershipConfig.firstMonthDiscountOnly
                    ? enteredPriceCents
                    : derivedFirstPaymentCents;

                return (
                  <>
                    {/* First Payment override input -- ONLY makes sense
                        for recurring plans, where "first payment" is a
                        separate leg from "every cycle after that". On
                        a one-time plan there's only one charge and it
                        IS the Price, so this input is hidden and the
                        Price input alone drives the amount. */}
                    {membershipConfig.isRecurring && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          First payment
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <input
                            type="text"
                            value={membershipConfig.customFirstPayment}
                            onChange={(e) => setMembershipConfig({ ...membershipConfig, customFirstPayment: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder={(derivedFirstPaymentCents / 100).toFixed(2)}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {overrideFirstPaymentCents != null
                            ? `Overrides the derived amount (${formatCents(derivedFirstPaymentCents)}). Leave blank to auto-derive from Price − Discount.`
                            : `Auto-derived: ${formatCents(derivedFirstPaymentCents)}. Type a dollar amount to override the charge for this sale only.`}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {membershipConfig.isRecurring ? "Price (recurring)" : "Price"}
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
                        Plan price: {formatCents(enteredPriceCents)}
                        {enteredPriceCents !== planDefaultCents && (
                          <span className="ml-1 text-gray-400">(plan default {formatCents(planDefaultCents)})</span>
                        )}
                      </p>
                    </div>

                    {/* Discount -- label + help text adapt to whether
                        the plan has future payments. On a one-time
                        plan there's only one payment, so the "first
                        payment only" wording is misleading. */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {membershipConfig.isRecurring ? "Discount on first payment" : "Discount"}
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
                      <p className="text-xs text-gray-500 mt-1">
                        {membershipConfig.isRecurring
                          ? "Applied on top of Price — does not change the recurring amount unless you uncheck the box below."
                          : "Subtracted from Price to give the amount charged."}
                      </p>
                    </div>

                    {/* First-payment-only checkbox -- only meaningful
                        when there IS a future payment to compare
                        against. Hidden for one-time. */}
                    {membershipConfig.isRecurring && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={membershipConfig.firstMonthDiscountOnly}
                          onChange={(e) => setMembershipConfig({ ...membershipConfig, firstMonthDiscountOnly: e.target.checked })}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-gray-700">First payment discount only (don't carry the discount into recurring)</span>
                      </label>
                    )}

                    {/* Calculated price preview -- always shown so the
                        admin sees both the initial charge AND the
                        recurring amount for every plan, whether or not
                        a custom price / discount was applied. Recurring
                        reads $0.00 on one-time plans by design. */}
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">First payment (charged now):</span>
                        <span className="font-bold text-primary">{formatCents(firstPaymentCents)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          Recurring{membershipConfig.isRecurring ? " (every cycle)" : ""}:
                        </span>
                        <span className={`font-bold ${membershipConfig.isRecurring ? "text-gray-800" : "text-gray-400"}`}>
                          {formatCents(recurringCents)}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
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

      {/* Contract Signing Overlay. In kiosk-lock mode, stays open after the
          sale completes (to show the Sale Completed screen) even though
          selectedMember has been cleared by resetAfterCheckout. */}
      {showContractSigning && (selectedMember || lockedSaleSummary) && (
        <div
          className={`fixed inset-0 z-50 flex items-start justify-center overflow-auto ${kioskLocked ? "bg-black z-[100]" : "bg-black/50"}`}
          onContextMenu={kioskLocked ? (e) => e.preventDefault() : undefined}
        >
          <div className={`w-full bg-white shadow-2xl ${kioskLocked ? "h-full max-w-none rounded-none flex flex-col" : "max-w-2xl mx-4 my-8 rounded-lg"}`}>
            {/* Header */}
            <div className="bg-primary px-6 py-4 rounded-t-lg text-center">
              <h2 className="text-lg font-bold text-white">{gymName || "Martial Arts School"}</h2>
              <p className="text-sm text-white/80">
                {lockedSaleSummary ? "Thank you!" : "Membership / Service Agreement"}
              </p>
            </div>

            {/* Sale Completed screen — shown after a successful sale while
                still in kiosk lock. Replaces the contract body until staff
                unlocks. */}
            {lockedSaleSummary ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
                  <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Sale Completed</h1>
                <p className="text-base text-gray-600 mb-1">Thanks, {lockedSaleSummary.memberName}!</p>
                <p className="text-sm text-gray-500">Please hand the tablet back to the front desk.</p>
              </div>
            ) : selectedMember ? (
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

              {/* Items — mirrors the contract PDF layout: plan description
                  up top, then Terms grid (with conditional discount and
                  payment-due date), then a dedicated Cancellation block
                  when the plan has any cancellation policy. */}
              {cart.filter(c => c.type === "membership" || c.type === "service").map((item) => {
                const plan = item.type === "membership" ? membershipPlans.find(p => p.id === item.membershipPlanId) : null;
                const pkg = item.type === "service" ? servicePackages.find(p => p.id === item.servicePackageId) : null;

                // Helpers reused from the PDF generator.
                function ordinalSuffix(n: number): string {
                  const v = n % 100;
                  if (v >= 11 && v <= 13) return "th";
                  switch (n % 10) {
                    case 1: return "st";
                    case 2: return "nd";
                    case 3: return "rd";
                    default: return "th";
                  }
                }
                function paymentDueLine(startDateStr: string | undefined, cycle: string | null | undefined): string {
                  if (!startDateStr) return "";
                  const d = parseLocalDate(startDateStr);
                  const day = d.getDate();
                  const cadence = (cycle || "MONTHLY").toUpperCase();
                  // One-time plans have exactly one payment on the start
                  // date -- return that as a one-off due date instead of
                  // falling through to the recurring "Nth of each month"
                  // wording. Kept here so the modal + printable can both
                  // rely on the same helper.
                  if (cadence === "ONE_TIME") return `${d.toLocaleDateString()} (single charge)`;
                  if (cadence === "WEEKLY") return `Every ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
                  if (cadence === "YEARLY" || cadence === "ANNUAL" || cadence === "ANNUALLY") {
                    return `${day}${ordinalSuffix(day)} of ${d.toLocaleString(undefined, { month: "long" })} each year`;
                  }
                  return `${day}${ordinalSuffix(day)} of each month`;
                }
                function describePaymentMethodLocal(): string {
                  if (paymentSplits.length === 0) return "";
                  const labelFor = (method: string): string => {
                    switch (method) {
                      case "CASH": return "Cash";
                      case "CHECK": return "Check";
                      case "ACCOUNT": return "Account Credit";
                      case "CARD": return "Credit Card";
                      case "SAVED_CARD":
                        return savedCard
                          ? `${savedCard.brand.charAt(0).toUpperCase() + savedCard.brand.slice(1)} ····${savedCard.last4}`
                          : "Card on file";
                      default: return method;
                    }
                  };
                  if (paymentSplits.length === 1 || !isSplitMode) {
                    return labelFor(paymentSplits[0].method);
                  }
                  return paymentSplits.map((s) => `${labelFor(s.method)} ${formatCents(s.amountCents)}`).join(" + ");
                }
                function billingSfx(cycle: string | undefined | null): string {
                  if (!cycle) return "/month";
                  const c = cycle.toUpperCase();
                  if (c === "WEEKLY") return "/week";
                  if (c === "MONTHLY") return "/month";
                  if (c === "QUARTERLY") return "/quarter";
                  if (c === "YEARLY" || c === "ANNUAL" || c === "ANNUALLY") return "/year";
                  return `/${c.toLowerCase()}`;
                }
                function formatDuration(days: number): string {
                  if (days >= 365 && days % 365 === 0) return `${days / 365} year(s)`;
                  if (days >= 30 && days % 30 === 0) return `${days / 30} month(s)`;
                  return `${days} day(s)`;
                }

                const planDefaultCents = (plan?.priceCents || 0) + (plan?.setupFeeCents || 0);
                const firstMonthCents = item.unitPriceCents;
                // Recurring = the price stored on the cart item; only falls back
                // to the plan default when the admin didn't override Price.
                const recurringCents = item.customPriceCents ?? planDefaultCents;
                const discountAppliedCents = item.discountAppliedCents || 0;
                const showDiscount = discountAppliedCents > 0;
                const suffix = billingSfx(plan?.billingCycle);

                let allowedStylesStr = "";
                if (plan?.allowedStyles) {
                  try {
                    const arr = JSON.parse(plan.allowedStyles);
                    if (Array.isArray(arr) && arr.length > 0) {
                      allowedStylesStr = arr.map((id: string) => stylesById[id] || id).join(", ");
                    }
                  } catch { /* ignore */ }
                }

                const description = item.type === "membership" ? plan?.description : pkg?.description;
                // Recurring/one-time detection prefers the per-sale
                // override set from the Configure popover (item.isRecurringOverride).
                // When absent, falls back to the plan's own billingCycle so
                // pre-override cart items still read correctly.
                const cycleUpper = plan?.billingCycle?.toUpperCase() || "MONTHLY";
                const isOneTime = item.isRecurringOverride != null
                  ? item.isRecurringOverride === false
                  : cycleUpper === "ONE_TIME";
                const isAutoRenew = !isOneTime && plan?.autoRenew !== false;
                // Prettier billing-cycle label than the raw enum string;
                // "one_time" -> "One Time" rather than "One_time".
                const billingCycleLabel = plan?.billingCycle
                  ? plan.billingCycle.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
                  : "Monthly";
                // Cancellation block only makes sense on recurring plans
                // -- there's nothing to cancel on a one-time charge.
                const hasCancellationBlock = !isOneTime
                  && !!(plan?.cancellationNoticeDays || plan?.cancellationFeeCents || plan?.cancellationProcedure);

                // Multi-discount: one row with each discount labeled
                // individually so the member sees every discount that
                // applies to this plan.
                const discountSegments: string[] = [];
                if (showDiscount) {
                  discountSegments.push(`−${formatCents(discountAppliedCents)}${item.firstMonthDiscountOnly ? " (first payment only)" : " (manual)"}`);
                }
                if (plan?.familyDiscountPercent) {
                  discountSegments.push(`${plan.familyDiscountPercent}% (family)`);
                }
                if (plan?.rankPromotionDiscountPercent) {
                  discountSegments.push(`${plan.rankPromotionDiscountPercent}% (rank promotion fee)`);
                }
                if (plan?.rankPromotionDiscountFlatCents) {
                  discountSegments.push(`−${formatCents(plan.rankPromotionDiscountFlatCents)} (rank promotion fee)`);
                }
                if (plan?.otherDiscountPercent) {
                  discountSegments.push(`${plan.otherDiscountPercent}% (other)`);
                }
                const discountLine = discountSegments.join(", ");

                return (
                  <div key={item.id} className="rounded-md border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">
                      {item.type === "membership" ? "Membership" : "Service"}: {item.itemName}
                    </h3>
                    {description && description.trim() && (
                      <p className="text-xs text-gray-600 mb-3 whitespace-pre-wrap">{description.trim()}</p>
                    )}

                    {item.type === "membership" ? (
                      <>
                        <div className="rounded bg-gray-50 border border-gray-200 px-2 py-2 mb-2">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1">Plan Terms</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                            {item.membershipStartDate && (
                              <div><span className="font-medium">Start Date:</span> {parseLocalDate(item.membershipStartDate).toLocaleDateString()}</div>
                            )}
                            {/* First Payment: always shown so the member can
                                verify what will actually be charged today,
                                whether it's the plan default, a manual price
                                override, or a discounted first payment. */}
                            <div><span className="font-medium">First Payment:</span> {formatCents(firstMonthCents)}</div>
                            {plan?.contractLengthMonths && (
                              <div><span className="font-medium">Contract Length:</span> {formatDuration(plan.contractLengthMonths)}</div>
                            )}
                            <div>
                              <span className="font-medium">
                                {isOneTime ? "Price:" : item.firstMonthDiscountOnly ? "Recurring (after first payment):" : "Price:"}
                              </span> {formatCents(recurringCents)}{isOneTime ? "" : suffix}
                            </div>
                            {discountLine && (
                              <div className="text-green-700 col-span-2"><span className="font-medium">Discount Applied:</span> {discountLine}</div>
                            )}
                            {plan?.promoCode && (
                              <div><span className="font-medium">Promo Code:</span> {plan.promoCode}</div>
                            )}
                            <div><span className="font-medium">Billing Cycle:</span> {billingCycleLabel}</div>
                            <div className="col-span-2">
                              <span className="font-medium">Recurring Payments:</span>{" "}
                              {isOneTime
                                ? "No — single one-time charge, no auto-renew"
                                : isAutoRenew
                                  ? "Yes — auto-charged each billing cycle until cancelled"
                                  : "No — manual renewal each cycle, not auto-charged"}
                            </div>
                            {item.membershipStartDate && (
                              <div><span className="font-medium">{isOneTime ? "Charge Date:" : "Payment Due:"}</span> {paymentDueLine(item.membershipStartDate, plan?.billingCycle)}</div>
                            )}
                            {describePaymentMethodLocal() && (
                              <div className="col-span-2"><span className="font-medium">Payment Method:</span> {describePaymentMethodLocal()}</div>
                            )}
                            {plan?.classesPerDay && (
                              <div><span className="font-medium">Classes per Day:</span> {plan.classesPerDay}</div>
                            )}
                            {plan?.classesPerWeek && (
                              <div><span className="font-medium">Classes per Week:</span> {plan.classesPerWeek}</div>
                            )}
                            {plan?.classesPerMonth && (
                              <div><span className="font-medium">Classes per Month:</span> {plan.classesPerMonth}</div>
                            )}
                            {allowedStylesStr && (
                              <div className="col-span-2"><span className="font-medium">Styles Included:</span> {allowedStylesStr} — all classes under these styles</div>
                            )}
                          </div>
                        </div>

                        {hasCancellationBlock && (
                          <div className="rounded bg-amber-50 border border-amber-200 px-2 py-2 mb-2">
                            <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 mb-1">Cancellation</p>
                            {plan?.cancellationProcedure && (
                              <p className="text-xs text-gray-700 whitespace-pre-wrap mb-1.5">{plan.cancellationProcedure.trim()}</p>
                            )}
                            <div className="space-y-0.5 text-xs text-gray-700">
                              {plan?.cancellationNoticeDays && (
                                <div><span className="font-medium">Cancellation Notice:</span> {plan.cancellationNoticeDays} day(s) before next billing cycle</div>
                              )}
                              {plan?.cancellationFeeCents && (
                                <div><span className="font-medium">Early Termination Fee:</span> {formatCents(plan.cancellationFeeCents)}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                        <div><span className="font-medium text-gray-700">Price:</span> {formatCents(item.unitPriceCents)}</div>
                        {pkg?.sessionsIncluded != null && <div><span className="font-medium text-gray-700">Sessions:</span> {pkg.sessionsIncluded}</div>}
                        {pkg?.expirationDays && <div><span className="font-medium text-gray-700">Expires:</span> {pkg.expirationDays} days from purchase</div>}
                      </div>
                    )}

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
            ) : null}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              {/* Left side: lock control (always visible while locked, including
                  on the Sale Completed screen). */}
              <div>
                {!kioskLocked ? (
                  <button
                    onClick={() => {
                      setKioskLocked(true);
                      if (typeof document !== "undefined" && document.documentElement?.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      }
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    title="Lock the screen so the member can sign without accessing other parts of the app"
                  >
                    🔒 Hand to Member
                  </button>
                ) : (
                  <button
                    onClick={() => { setShowUnlockPrompt(true); setUnlockAttempt(""); setUnlockError(""); }}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  >
                    Staff Unlock
                  </button>
                )}
              </div>

              {/* Right side: only sign/cancel while contract is being read,
                  not on the Sale Completed screen. */}
              <div className="flex items-center gap-2">
                {!lockedSaleSummary && (
                  <button
                    onClick={handleSignContract}
                    disabled={!hasSignature || contractSigning}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {contractSigning ? "Processing..." : "Sign & Complete Sale"}
                  </button>
                )}
                {!kioskLocked && !lockedSaleSummary && (
                  <button
                    onClick={() => { setShowContractSigning(false); setHasSignature(false); }}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Staff PIN unlock prompt */}
          {kioskLocked && showUnlockPrompt && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70" onClick={() => setShowUnlockPrompt(false)}>
              <div className="bg-white rounded-lg shadow-2xl p-6 w-80" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Staff Unlock</h3>
                <p className="text-xs text-gray-500 mb-3">Enter the unlock PIN to exit kiosk mode.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={unlockAttempt}
                  onChange={(e) => { setUnlockAttempt(e.target.value); setUnlockError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (unlockAttempt === kioskUnlockPin) {
                        setKioskLocked(false);
                        setShowUnlockPrompt(false);
                        setUnlockAttempt("");
                        if (typeof document !== "undefined" && document.exitFullscreen && document.fullscreenElement) {
                          document.exitFullscreen().catch(() => {});
                        }
                        // If unlocking after a completed sale, also dismiss
                        // the success screen + the contract modal entirely.
                        if (lockedSaleSummary) {
                          setLockedSaleSummary(null);
                          setShowContractSigning(false);
                        }
                      } else {
                        setUnlockError("Incorrect PIN");
                      }
                    }
                  }}
                  placeholder="• • • •"
                  className="w-full text-center text-lg tracking-widest border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {unlockError && <p className="text-xs text-red-600 mt-2">{unlockError}</p>}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <button
                    onClick={() => { setShowUnlockPrompt(false); setUnlockAttempt(""); setUnlockError(""); }}
                    className="text-xs text-gray-500 px-3 py-1 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (unlockAttempt === kioskUnlockPin) {
                        setKioskLocked(false);
                        setShowUnlockPrompt(false);
                        setUnlockAttempt("");
                        if (typeof document !== "undefined" && document.exitFullscreen && document.fullscreenElement) {
                          document.exitFullscreen().catch(() => {});
                        }
                        // If unlocking after a completed sale, also dismiss
                        // the success screen + the contract modal entirely.
                        if (lockedSaleSummary) {
                          setLockedSaleSummary(null);
                          setShowContractSigning(false);
                        }
                      } else {
                        setUnlockError("Incorrect PIN");
                      }
                    }}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                  >
                    Unlock
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Embedded Card Payment Modal */}
      {cardPaymentData && (
        <PosCardPaymentModal
          data={cardPaymentData}
          memberId={selectedMember?.id}
          onClose={() => {
            // Member backed out of card entry — discard the pending
            // contract too so we don't save it on a future attempt
            // with possibly different cart contents. Nothing to
            // cancel in Stripe: the deferred flow only creates the
            // PaymentIntent when the admin clicks Pay Amount, so
            // backing out here is a pure client-side dismiss.
            pendingContractRef.current = null;
            setCardPaymentData(null);
          }}
          onSuccess={async (paymentIntentId) => {
            // Create transaction record
            const d = cardPaymentData;
            if (!d.existingTransactionId) {
              const txnRes = await fetch("/api/pos/transactions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  memberId: selectedMember?.id || null,
                  memberName: selectedMember ? `${selectedMember.firstName} ${selectedMember.lastName}` : null,
                  lineItems: d.lineItems,
                  paymentMethod: isSplitMode
                    ? serializePaymentMethod(paymentSplits.map(s => ({ method: s.method, amountCents: s.amountCents, ...(s.label ? { label: s.label } : {}) })))
                    : "CARD",
                  notes: notes || null,
                  discountCents: (redeemedGift?.appliedCents || 0) + discountCents,
                  taxCents,
                  paymentIntentId,
                  paymentProcessor: "stripe",
                }),
              });
              if (txnRes.ok) {
                const txnData = await txnRes.json();
                completeTransaction({ id: txnData.transaction.id, transactionNumber: txnData.transaction.transactionNumber });
              }
            } else {
              completeTransaction({ id: d.existingTransactionId!, transactionNumber: d.existingTransactionNumber! });
            }
            setCardPaymentData(null);
            resetAfterCheckout();
          }}
        />
      )}

      {/* BUNDLE ADD-TO-CART VARIANT PICKER. Opens when any of the
          products inside the bundle being added has size / color
          variants. Operator picks per-row; on confirm we push the
          bundle line with those picks so inventory decrements land on
          the right variant. Same size/color grid style as the
          single-product variant picker. */}
      {bundleAddPicker && (() => {
        const state = bundleAddPicker;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold">Pick variants — {state.bundle.name}</h2>
                <button
                  type="button"
                  onClick={() => setBundleAddPicker(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 space-y-5">
                {state.variantRows.map((row) => {
                  const pick = state.picks[row.bundleItemId] || { size: null, color: null };
                  return (
                    <div key={row.bundleItemId} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{row.productName}</p>
                        {row.quantity > 1 && (
                          <span className="text-[11px] font-medium text-gray-500">×{row.quantity}</span>
                        )}
                      </div>
                      {row.sizes.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">{row.variantLabel1}</label>
                          <div className="flex flex-wrap gap-2">
                            {row.sizes.map((size) => (
                              <button
                                key={size}
                                type="button"
                                onClick={() =>
                                  setBundleAddPicker({
                                    ...state,
                                    picks: { ...state.picks, [row.bundleItemId]: { ...pick, size } },
                                  })
                                }
                                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                  pick.size === size
                                    ? "border-primary bg-primary text-white font-semibold"
                                    : "border-gray-300 hover:border-primary text-gray-700"
                                }`}
                              >
                                {size}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {row.colors.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">{row.variantLabel2}</label>
                          <div className="flex flex-wrap gap-2">
                            {row.colors.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() =>
                                  setBundleAddPicker({
                                    ...state,
                                    picks: { ...state.picks, [row.bundleItemId]: { ...pick, color } },
                                  })
                                }
                                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                                  pick.color === color
                                    ? "border-primary bg-primary text-white font-semibold"
                                    : "border-gray-300 hover:border-primary text-gray-700"
                                }`}
                              >
                                {color}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBundleAddPicker(null)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => finalizeBundleToCart(state.bundle, state.picks)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* BUNDLE EDITOR MODAL */}
      {bundleEditor && (() => {
        const draft = bundleEditor;
        const productPickerOptions = items.filter((it) => it.isActive !== false);
        const membershipPickerOptions = membershipPlans.filter((p) => p.isActive);
        const servicePickerOptions = servicePackages;
        // Sum of the retail prices of every item currently in the
        // draft, across all three kinds, shown as a reference next to
        // the bundle price so the operator sees the promo's savings.
        // For memberships we use first-payment (price + setup fee) so
        // the number matches what a normal signup would charge today.
        const componentSum = draft.items.reduce((sum, it) => {
          const qty = Math.max(1, it.quantity);
          if (it.kind === "product") {
            const prod = productPickerOptions.find((p) => p.id === it.productId);
            return sum + (prod ? prod.priceCents * qty : 0);
          }
          if (it.kind === "membership") {
            const plan = membershipPickerOptions.find((p) => p.id === it.membershipPlanId);
            return sum + (plan ? ((plan.priceCents || 0) + (plan.setupFeeCents || 0)) * qty : 0);
          }
          if (it.kind === "service") {
            const svc = servicePickerOptions.find((s) => s.id === it.servicePackageId);
            return sum + (svc ? (svc.priceCents || 0) * qty : 0);
          }
          return sum;
        }, 0);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-bold">{draft.id ? "Edit Bundle" : "New Bundle"}</h2>
                <button
                  type="button"
                  onClick={closeBundleEditor}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">Bundle Name</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setBundleEditor({ ...draft, name: e.target.value })}
                    placeholder="e.g. New Student Special"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-700">Description (optional)</label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => setBundleEditor({ ...draft, description: e.target.value })}
                    placeholder="Short blurb shown on the POS tile"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700">Bundle Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.priceDollars}
                        onChange={(e) => setBundleEditor({ ...draft, priceDollars: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-md border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    {componentSum > 0 && (
                      <p className="text-[10px] text-gray-500">
                        Items add up to {formatCents(componentSum)} at retail
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-700">Active</label>
                    <label className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => setBundleEditor({ ...draft, active: e.target.checked })}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">Show in POS</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">Included Items</label>
                    <div className="flex gap-1">
                      {(["product", "membership", "service"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() =>
                            setBundleEditor({
                              ...draft,
                              items: [
                                ...draft.items,
                                {
                                  cid: crypto.randomUUID(),
                                  kind: k,
                                  productId: "",
                                  membershipPlanId: "",
                                  servicePackageId: "",
                                  nameCached: "",
                                  quantity: 1,
                                },
                              ],
                            })
                          }
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          + {k.charAt(0).toUpperCase() + k.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Buying this bundle covers the first payment for included memberships (recurring
                    ones continue at their normal cycle afterward). Services get added as prepaid
                    credits; products drop from inventory. No sales tax on any of it.
                  </p>
                  {draft.items.length === 0 && (
                    <p className="text-xs text-gray-400 italic">
                      No items yet. Add at least one before saving.
                    </p>
                  )}
                  {draft.items.map((row, idx) => (
                    <div key={row.cid} className="flex items-center gap-2">
                      {row.kind === "product" && (
                        <select
                          value={row.productId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const prod = productPickerOptions.find((p) => p.id === pid);
                            const nextItems = [...draft.items];
                            nextItems[idx] = {
                              ...row,
                              productId: pid,
                              nameCached: prod ? prod.name : "",
                            };
                            setBundleEditor({ ...draft, items: nextItems });
                          }}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">— pick a product —</option>
                          {productPickerOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatCents(p.priceCents)})
                            </option>
                          ))}
                        </select>
                      )}
                      {row.kind === "membership" && (
                        <select
                          value={row.membershipPlanId}
                          onChange={(e) => {
                            const mid = e.target.value;
                            const plan = membershipPickerOptions.find((p) => p.id === mid);
                            const nextItems = [...draft.items];
                            nextItems[idx] = {
                              ...row,
                              membershipPlanId: mid,
                              nameCached: plan ? plan.name : "",
                            };
                            setBundleEditor({ ...draft, items: nextItems });
                          }}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">— pick a membership plan —</option>
                          {membershipPickerOptions.map((p) => {
                            const totalCents = (p.priceCents || 0) + (p.setupFeeCents || 0);
                            const cycle = (p.billingCycle || "").toUpperCase() === "ONE_TIME"
                              ? "one-time"
                              : `${p.billingCycle || "monthly"}`.toLowerCase();
                            return (
                              <option key={p.id} value={p.id}>
                                {p.name} ({formatCents(totalCents)} {cycle})
                              </option>
                            );
                          })}
                        </select>
                      )}
                      {row.kind === "service" && (
                        <select
                          value={row.servicePackageId}
                          onChange={(e) => {
                            const sid = e.target.value;
                            const svc = servicePickerOptions.find((s) => s.id === sid);
                            const nextItems = [...draft.items];
                            nextItems[idx] = {
                              ...row,
                              servicePackageId: sid,
                              nameCached: svc ? svc.name : "",
                            };
                            setBundleEditor({ ...draft, items: nextItems });
                          }}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">— pick an appointment —</option>
                          {servicePickerOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({formatCents(s.priceCents)})
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="text-[10px] font-semibold uppercase text-gray-400 w-14 text-center">
                        {row.kind}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => {
                          const q = parseInt(e.target.value, 10);
                          const nextItems = [...draft.items];
                          nextItems[idx] = { ...row, quantity: isNaN(q) || q < 1 ? 1 : q };
                          setBundleEditor({ ...draft, items: nextItems });
                        }}
                        className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setBundleEditor({
                            ...draft,
                            items: draft.items.filter((r) => r.cid !== row.cid),
                          })
                        }
                        className="text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {draft.error && (
                  <p className="text-xs text-red-600">{draft.error}</p>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeBundleEditor}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveBundleEditor}
                  disabled={draft.saving}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {draft.saving ? "Saving..." : draft.id ? "Save Changes" : "Create Bundle"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppLayout>
  );
}

function PosCardPaymentModal({ data, memberId, onClose, onSuccess }: {
  data: {
    publishableKey: string;
    currency: string;
    amountCents: number;
    memberName: string;
    memberId: string | null;
    metadata: Record<string, string>;
  };
  memberId?: string | null;
  onClose: () => void;
  onSuccess: (paymentIntentId: string) => void;
}) {
  const [stripe, setStripe] = useState<import("@stripe/stripe-js").Stripe | null>(null);
  const [elements, setElements] = useState<import("@stripe/stripe-js").StripeElements | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  // Start blank -- Cruz doesn't want the member's name pre-filled since
  // a family member's card is a common case and the auto-fill nudged
  // operators into leaving the wrong name on the transaction. Placeholder
  // still shows the member's name as a hint; submit falls back to it if
  // the operator leaves it empty.
  const [cardholderName, setCardholderName] = useState("");
  // $0 sales still need to save the card (recurring will bill against
  // it later), so the modal always opens in "payment" mode UNLESS the
  // total is zero -- in which case we flip to Stripe's SetupIntent
  // path via `mode: "setup"`. Either way NO Stripe call happens until
  // the admin clicks Pay Amount below.
  const isSetupIntent = data.amountCents === 0;
  const cardNumberRef = useRef<HTMLDivElement>(null);
  const cardExpiryRef = useRef<HTMLDivElement>(null);
  const cardCvcRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    import("@stripe/stripe-js").then(({ loadStripe }) => {
      loadStripe(data.publishableKey).then(s => {
        if (!mounted || !s) return;
        setStripe(s);
        // DEFERRED init -- Elements can render the card fields off
        // the publishable key + mode + amount, without a
        // client_secret. The PaymentIntent (or SetupIntent) is
        // created only when handleSubmit fires. Cancelling before
        // that point never touches Stripe. Split by mode so the
        // Stripe TS overload picks the right shape ("payment"
        // requires amount, "setup" doesn't accept it).
        const el = isSetupIntent
          ? s.elements({
              mode: "setup",
              currency: data.currency || "usd",
              paymentMethodCreation: "manual",
            })
          : s.elements({
              mode: "payment",
              amount: data.amountCents,
              currency: data.currency || "usd",
              paymentMethodCreation: "manual",
            });
        setElements(el);
        const baseStyle = {
          base: { fontSize: "14px", color: "#1f2937", "::placeholder": { color: "#9ca3af" } },
          invalid: { color: "#ef4444" },
        };
        const num = el.create("cardNumber", { style: baseStyle, showIcon: true });
        const exp = el.create("cardExpiry", { style: baseStyle });
        const cvc = el.create("cardCvc", { style: baseStyle });
        if (cardNumberRef.current) num.mount(cardNumberRef.current);
        if (cardExpiryRef.current) exp.mount(cardExpiryRef.current);
        if (cardCvcRef.current) cvc.mount(cardCvcRef.current);
      });
    });
    return () => { mounted = false; };
  }, [data.publishableKey, data.amountCents, data.currency, isSetupIntent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    setError("");

    // Only NOW do we call our backend to create the Stripe
    // PaymentIntent / SetupIntent. If this fails we never even try
    // to charge -- nothing lingers in Stripe as incomplete.
    let clientSecret: string | null = null;
    let paymentIntentId: string | null = null;
    try {
      const res = await fetch("/api/pos/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: data.amountCents,
          memberId: data.memberId,
          memberName: data.memberName || undefined,
          metadata: data.metadata,
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Failed to create payment intent");
      const j = await res.json();
      clientSecret = j.clientSecret || null;
      paymentIntentId = j.paymentIntentId || null;
      if (!clientSecret) throw new Error(j.error || "No client secret returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach payment processor");
      setSaving(false);
      return;
    }

    // SetupIntent path: $0 total. We collect + save the card without
    // charging it; recurring billing will hit the saved card later.
    if (isSetupIntent) {
      const { error: setupError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: elements.getElement("cardNumber")!,
          billing_details: { name: cardholderName.trim() || data.memberName || undefined },
        },
      });
      if (setupError) {
        setError(setupError.message || "Card save failed");
        setSaving(false);
        return;
      }
      if (setupIntent?.status === "succeeded") {
        if (memberId && setupIntent.payment_method) {
          const pmId = typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method.id;
          await fetch(`/api/members/${memberId}/payment-methods/${pmId}/default`, { method: "PUT" }).catch(() => {});
        }
        onSuccess("");
      } else {
        setError("Card was not saved");
        setSaving(false);
      }
      return;
    }

    // Standard PaymentIntent path: actually charges the card.
    const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: elements.getElement("cardNumber")!,
        billing_details: { name: cardholderName.trim() || data.memberName || undefined },
      },
    });

    if (confirmError) {
      setError(confirmError.message || "Payment failed");
      setSaving(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      // AWAIT the save so the request actually completes -- the fetch
      // was fire-and-forget and onSuccess would unmount this modal
      // before the PUT even finished, cancelling the "attach + set
      // default" round-trip and leaving the member's card unsaved.
      if (saveCard && memberId && paymentIntent.payment_method) {
        const pmId = typeof paymentIntent.payment_method === "string" ? paymentIntent.payment_method : paymentIntent.payment_method.id;
        try {
          const saveRes = await fetch(`/api/members/${memberId}/payment-methods/${pmId}/default`, { method: "PUT" });
          if (!saveRes.ok) {
            const body = await saveRes.json().catch(() => ({}));
            console.warn("[POS] save-card failed:", body?.error || saveRes.statusText);
            // Charge already succeeded; surface a soft note but still
            // hand back to the caller so the sale completes.
            setError(`Charge succeeded, but saving the card failed: ${body?.error || saveRes.statusText}`);
          }
        } catch (err) {
          console.warn("[POS] save-card threw:", err);
          setError("Charge succeeded, but saving the card failed. Try attaching it from the member's profile.");
        }
      }
      onSuccess(paymentIntent.id || paymentIntentId || "");
    } else {
      setError("Payment was not completed");
      setSaving(false);
    }
  }

  return (
    // Backdrop click INTENTIONALLY does NOT close the modal -- one
    // accidental tap outside the card panel used to wipe everything
    // the admin had already entered (name, card number, expiry, CVC)
    // and force them to start over. The only ways out now are the X
    // in the header, the Cancel button, or a successful Pay Amount.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-bold text-gray-900">
            {isSetupIntent
              ? "Save Card — $0.00 today"
              : `Card Payment — $${(data.amountCents / 100).toFixed(2)}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name on card. Prefilled with the member so the common
              case (member paying for themselves) is one-tap; editable
              because a parent or spouse paying with THEIR card would
              otherwise trip issuing-bank name-mismatch checks. Falls
              back to the member's name at submit time if left blank. */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name on Card</label>
            <input
              type="text"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
              placeholder={data.memberName || "Cardholder name"}
              autoComplete="cc-name"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {data.memberName && cardholderName.trim() && cardholderName.trim().toLowerCase() !== data.memberName.trim().toLowerCase() && (
              <p className="mt-1 text-[11px] text-gray-500">
                Paying on behalf of <span className="font-medium">{data.memberName}</span>
              </p>
            )}
          </div>
          {isSetupIntent && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              No charge today. Your card will be saved on file and used for any
              recurring membership payments.
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Card Number
              <span className="ml-2 text-[10px] font-normal text-gray-400">
                (tap to scan with camera on mobile)
              </span>
            </label>
            <div ref={cardNumberRef} className="rounded-md border border-gray-300 px-3 py-2.5" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Expiry</label>
              <div ref={cardExpiryRef} className="rounded-md border border-gray-300 px-3 py-2.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CVC</label>
              <div ref={cardCvcRef} className="rounded-md border border-gray-300 px-3 py-2.5" />
            </div>
          </div>
          {/* Save-as-default is implicit in the SetupIntent flow — no checkbox needed. */}
          {memberId && !isSetupIntent && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveCard}
                onChange={e => setSaveCard(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-primary"
              />
              <span className="text-xs text-gray-700">Save card as default for future payments</span>
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving || !stripe} className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">
              {saving
                ? "Processing..."
                : isSetupIntent
                  ? "Save Card"
                  : `Pay $${(data.amountCents / 100).toFixed(2)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
