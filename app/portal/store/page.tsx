"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface ContractDetails {
  setupFeeCents: number | null;
  contractLengthMonths: number | null;
  autoRenew: boolean;
  trialDays: number | null;
  cancellationNoticeDays: number | null;
  cancellationFeeCents: number | null;
  classesPerDay: number | null;
  classesPerWeek: number | null;
  classesPerMonth: number | null;
  allowedStyles: string | null;
}

interface StoreItemVariant {
  size: string | null;
  color: string | null;
  quantity: number;
}

interface StoreItem {
  id: string;
  type: "product" | "membership";
  name: string;
  description: string | null;
  priceCents: number;
  quantity: number;
  category: string | null;
  sizes: string | null;
  colors: string | null;
  variantLabel1?: string | null;
  variantLabel2?: string | null;
  itemType: string | null;
  variants?: StoreItemVariant[];
  billingCycle: string | null;
  contractDetails: ContractDetails | null;
}

interface CartItem {
  itemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
}

function parseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

function variantKey(ci: { itemId: string; selectedSize?: string; selectedColor?: string }): string {
  return `${ci.itemId}|${ci.selectedSize || ""}|${ci.selectedColor || ""}`;
}

/** Get stock for a specific variant selection. If item has variant inventory, look up the matching variant. */
function getVariantStock(item: StoreItem, size?: string, color?: string): number {
  if (!item.variants || item.variants.length === 0) return item.quantity;
  const match = item.variants.find(v =>
    (v.size || null) === (size || null) && (v.color || null) === (color || null)
  );
  return match ? match.quantity : 0;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function billingLabel(cycle: string | null): string {
  if (!cycle) return "";
  switch (cycle) {
    case "MONTHLY": return "/mo";
    case "YEARLY": return "/yr";
    case "WEEKLY": return "/wk";
    case "QUARTERLY": return "/qtr";
    default: return "";
  }
}

function billingCycleFull(cycle: string | null): string {
  if (!cycle) return "";
  switch (cycle) {
    case "MONTHLY": return "Monthly";
    case "YEARLY": return "Yearly";
    case "WEEKLY": return "Weekly";
    case "QUARTERLY": return "Quarterly";
    default: return cycle;
  }
}

function formatContractLength(days: number): string {
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

export default function PortalStorePage() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [selectedTab, setSelectedTab] = useState<"goods" | "services">("goods");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({ store_goods: true, store_services: true });

  // Variant selections per item (keyed by item id)
  const [variantSelections, setVariantSelections] = useState<Record<string, { size?: string; color?: string }>>({});

  // Contract modal state
  const [selectedPlan, setSelectedPlan] = useState<StoreItem | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [signatureName, setSignatureName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load items and features
  useEffect(() => {
    Promise.all([
      fetch("/api/portal/store/items").then((r) => r.json()),
      fetch("/api/portal/features").then((r) => r.json()),
    ]).then(([itemsData, featuresData]) => {
      setItems(itemsData.items || []);
      const f = featuresData.features || {};
      setFeatures(f);
      // Auto-select the first enabled tab
      if (f.store_goods === false && f.store_services !== false) {
        setSelectedTab("services");
      }
      setLoading(false);
    });
  }, []);

  // Load cart from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal-store-cart");
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem("portal-store-cart", JSON.stringify(cart));
  }, [cart]);

  const goodsEnabled = features.store_goods !== false;
  const servicesEnabled = features.store_services !== false;
  const tabItems = selectedTab === "goods"
    ? items.filter((i) => i.type === "product")
    : items.filter((i) => i.type === "membership");
  const categories = Array.from(new Set(tabItems.map((i) => i.category).filter(Boolean))) as string[];
  const filtered = selectedCategory
    ? tabItems.filter((i) => i.category === selectedCategory)
    : tabItems;

  const cartTotal = cart.reduce((sum, ci) => sum + ci.priceCents * ci.quantity, 0);
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0);

  function addToCart(item: StoreItem, size?: string, color?: string) {
    setCart((prev) => {
      const newEntry = { itemId: item.id, selectedSize: size, selectedColor: color };
      const key = variantKey(newEntry);
      const existing = prev.find((ci) => variantKey(ci) === key);
      const varStock = getVariantStock(item, size, color);
      if (existing) {
        if (item.type === "membership") return prev;
        if (existing.quantity >= varStock) return prev;
        return prev.map((ci) =>
          variantKey(ci) === key ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      const label = [item.name, size, color].filter(Boolean).join(" - ");
      return [...prev, { itemId: item.id, name: label, priceCents: item.priceCents, quantity: 1, selectedSize: size, selectedColor: color }];
    });
  }

  function updateCartQuantity(key: string, delta: number) {
    setCart((prev) => {
      return prev
        .map((ci) => {
          if (variantKey(ci) !== key) return ci;
          const newQty = ci.quantity + delta;
          if (newQty <= 0) return null;
          const storeItem = items.find((i) => i.id === ci.itemId);
          if (storeItem?.type === "membership" && newQty > 1) return ci;
          if (storeItem && storeItem.type === "product") {
            const varStock = getVariantStock(storeItem, ci.selectedSize, ci.selectedColor);
            if (newQty > varStock) return ci;
          }
          return { ...ci, quantity: newQty };
        })
        .filter(Boolean) as CartItem[];
    });
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((ci) => variantKey(ci) !== key));
    // Remove stored signature if removing a plan
    if (key.startsWith("plan_")) {
      localStorage.removeItem(`portal-contract-sig-${key.split("|")[0]}`);
    }
  }

  async function handleCheckout() {
    setCheckingOut(true);
    setError("");
    try {
      const res = await fetch("/api/portal/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((ci) => ({
            itemId: ci.itemId,
            quantity: ci.quantity,
            selectedSize: ci.selectedSize || null,
            selectedColor: ci.selectedColor || null,
          })),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start checkout");
        setCheckingOut(false);
      }
    } catch {
      setError("Connection error. Please try again.");
      setCheckingOut(false);
    }
  }

  // --- Contract Modal Signature Functions ---

  function openContractModal(item: StoreItem) {
    setSelectedPlan(item);
    setAgreedToTerms(false);
    setHasSignature(false);
    setSignatureName("");
    // Reset canvas on next tick after render
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, 50);
  }

  function closeContractModal() {
    setSelectedPlan(null);
    setAgreedToTerms(false);
    setHasSignature(false);
    setSignatureName("");
  }

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    isDrawingRef.current = false;
  }, []);

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  // Native touch handlers for canvas — non-passive so preventDefault() works
  // This allows the rest of the modal to scroll normally while drawing works on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      setIsDrawing(true);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      const y = (e.touches[0].clientY - rect.top) * scaleY;
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      const y = (e.touches[0].clientY - rect.top) * scaleY;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasSignature(true);
    };

    const handleTouchEnd = () => {
      isDrawingRef.current = false;
      setIsDrawing(false);
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [selectedPlan]); // Re-attach when modal opens (canvas mounts)

  function handleConfirmContract() {
    if (!selectedPlan) return;

    // Save signature data to localStorage
    const sigData = {
      type: hasSignature ? "drawn" : "typed",
      value: hasSignature
        ? canvasRef.current?.toDataURL("image/png") || ""
        : signatureName,
      agreedAt: new Date().toISOString(),
      planName: selectedPlan.name,
    };
    localStorage.setItem(`portal-contract-sig-${selectedPlan.id}`, JSON.stringify(sigData));

    // Add to cart
    addToCart(selectedPlan);
    closeContractModal();
  }

  const canConfirm = agreedToTerms && (hasSignature || signatureName.trim().length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-40 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Store</h1>

      {/* Goods / Services Toggle — only show if both are enabled */}
      {goodsEnabled && servicesEnabled && (
      <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
        <button
          onClick={() => { setSelectedTab("goods"); setSelectedCategory(null); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            selectedTab === "goods"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Goods
        </button>
        <button
          onClick={() => { setSelectedTab("services"); setSelectedCategory(null); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
            selectedTab === "services"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500"
          }`}
        >
          Services
        </button>
      </div>
      )}

      {/* Category Filter */}
      {categories.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !selectedCategory
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Product Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <p className="text-gray-500">No items available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => {
            const isMembership = item.type === "membership";
            const sizes = parseJsonArray(item.sizes);
            const colors = parseJsonArray(item.colors);
            const hasVariants = sizes.length > 0 || colors.length > 0;
            const sel = variantSelections[item.id] || {};
            const currentKey = variantKey({ itemId: item.id, selectedSize: sel.size, selectedColor: sel.color });
            const inCart = cart.find((ci) => variantKey(ci) === currentKey);
            const varStock = getVariantStock(item, sel.size, sel.color);
            const needsSelection = hasVariants && ((sizes.length > 0 && !sel.size) || (colors.length > 0 && !sel.color));
            // For the + button: check stock of the currently selected variant
            const inCartQtyForVariant = inCart ? inCart.quantity : 0;
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 flex flex-col"
              >
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  {item.itemType && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-medium rounded">
                      {item.itemType}
                    </span>
                  )}
                  {isMembership && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded">
                      Membership
                    </span>
                  )}
                </div>

                {/* Variant selectors */}
                {hasVariants && !isMembership && (
                  <div className="mt-2 space-y-1.5">
                    {sizes.length > 0 && (
                      <select
                        value={sel.size || ""}
                        onChange={(e) => setVariantSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], size: e.target.value || undefined } }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="">Select {item.variantLabel1 || "size"}</option>
                        {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {colors.length > 0 && (
                      <select
                        value={sel.color || ""}
                        onChange={(e) => setVariantSelections((prev) => ({ ...prev, [item.id]: { ...prev[item.id], color: e.target.value || undefined } }))}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="">Select {item.variantLabel2 || "color"}</option>
                        {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </div>
                )}

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-primary font-semibold text-sm">
                    {formatCents(item.priceCents)}
                    {isMembership && (
                      <span className="text-xs font-normal text-gray-500">{billingLabel(item.billingCycle)}</span>
                    )}
                  </span>
                  {!isMembership && !hasVariants && item.quantity <= 0 ? (
                    <span className="text-xs text-gray-400 font-medium">Out of stock</span>
                  ) : needsSelection ? (
                    <span className="text-[10px] text-gray-400">Select options</span>
                  ) : !isMembership && varStock <= 0 ? (
                    <span className="text-xs text-gray-400 font-medium">Out of stock</span>
                  ) : inCart ? (
                    isMembership ? (
                      <button
                        onClick={() => removeFromCart(variantKey({ itemId: item.id }))}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full"
                      >
                        Added
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateCartQuantity(currentKey, -1)}
                          className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium w-5 text-center">{inCart.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(currentKey, 1)}
                          disabled={inCartQtyForVariant >= varStock}
                          className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      onClick={() => isMembership ? openContractModal(item) : addToCart(item, sel.size, sel.color)}
                      className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-full active:scale-[0.96] transition-all"
                    >
                      {isMembership ? "View Plan" : "Add"}
                    </button>
                  )}
                </div>
                {!isMembership && !needsSelection && varStock > 0 && varStock <= 3 && (
                  <p className="text-[10px] text-orange-500 mt-1">{varStock} left</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cart Bottom Bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
          <div className="max-w-lg mx-auto">
            {showCart && (
              <div className="bg-white rounded-t-2xl border border-gray-200 shadow-lg p-4 mb-[-1px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Your Cart</h3>
                  <button
                    onClick={() => setShowCart(false)}
                    className="text-sm text-gray-400"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {cart.map((ci) => (
                    <div key={variantKey(ci)} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{ci.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatCents(ci.priceCents)} x {ci.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCents(ci.priceCents * ci.quantity)}
                        </span>
                        <button
                          onClick={() => removeFromCart(variantKey(ci))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <p className="text-sm text-red-600 mt-2">{error}</p>
                )}

                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="w-full mt-3 bg-primary text-white py-3 rounded-xl font-semibold active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {checkingOut ? "Redirecting..." : `Checkout — ${formatCents(cartTotal)}`}
                </button>
              </div>
            )}

            {!showCart && (
              <button
                onClick={() => setShowCart(true)}
                className="w-full bg-primary text-white rounded-2xl py-3 px-4 flex items-center justify-between shadow-lg active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="font-semibold">{cartCount} {cartCount === 1 ? "item" : "items"}</span>
                </div>
                <span className="font-semibold">{formatCents(cartTotal)}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contract Detail Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl h-[92dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Membership Agreement</h2>
              <button
                onClick={closeContractModal}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
              {/* Plan Name & Price */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h3 className="text-xl font-bold text-gray-900">{selectedPlan.name}</h3>
                {selectedPlan.description && (
                  <p className="text-sm text-gray-600 mt-1">{selectedPlan.description}</p>
                )}
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-primary">
                    {formatCents(selectedPlan.priceCents)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {billingCycleFull(selectedPlan.billingCycle)}
                  </span>
                </div>
              </div>

              {/* Contract Terms */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wide">
                  Contract Terms
                </h4>
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  <ContractRow
                    label="Billing Cycle"
                    value={billingCycleFull(selectedPlan.billingCycle)}
                  />
                  {selectedPlan.contractDetails?.contractLengthMonths && (
                    <ContractRow
                      label="Contract Length"
                      value={formatContractLength(selectedPlan.contractDetails.contractLengthMonths)}
                    />
                  )}
                  {!selectedPlan.contractDetails?.contractLengthMonths && (
                    <ContractRow label="Contract Length" value="No commitment — cancel anytime" />
                  )}
                  <ContractRow
                    label="Auto-Renewal"
                    value={selectedPlan.contractDetails?.autoRenew ? "Yes — renews automatically" : "No — must renew manually"}
                  />
                  {selectedPlan.contractDetails?.setupFeeCents != null && selectedPlan.contractDetails.setupFeeCents > 0 && (
                    <ContractRow
                      label="Setup Fee"
                      value={formatCents(selectedPlan.contractDetails.setupFeeCents)}
                    />
                  )}
                  {selectedPlan.contractDetails?.trialDays != null && selectedPlan.contractDetails.trialDays > 0 && (
                    <ContractRow
                      label="Free Trial"
                      value={`${selectedPlan.contractDetails.trialDays} day${selectedPlan.contractDetails.trialDays !== 1 ? "s" : ""}`}
                    />
                  )}
                </div>
              </div>

              {/* Class Access */}
              {(selectedPlan.contractDetails?.classesPerDay || selectedPlan.contractDetails?.classesPerWeek || selectedPlan.contractDetails?.classesPerMonth) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wide">
                    Class Access
                  </h4>
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {selectedPlan.contractDetails.classesPerDay && (
                      <ContractRow
                        label="Classes Per Day"
                        value={`${selectedPlan.contractDetails.classesPerDay}`}
                      />
                    )}
                    {selectedPlan.contractDetails.classesPerWeek && (
                      <ContractRow
                        label="Classes Per Week"
                        value={`${selectedPlan.contractDetails.classesPerWeek}`}
                      />
                    )}
                    {selectedPlan.contractDetails.classesPerMonth && (
                      <ContractRow
                        label="Classes Per Month"
                        value={`${selectedPlan.contractDetails.classesPerMonth}`}
                      />
                    )}
                    {selectedPlan.contractDetails.allowedStyles && (
                      <ContractRow
                        label="Included Styles"
                        value={selectedPlan.contractDetails.allowedStyles}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Cancellation Policy */}
              {(selectedPlan.contractDetails?.cancellationNoticeDays || selectedPlan.contractDetails?.cancellationFeeCents) && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wide">
                    Cancellation Policy
                  </h4>
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {selectedPlan.contractDetails.cancellationNoticeDays != null && (
                      <ContractRow
                        label="Notice Required"
                        value={`${selectedPlan.contractDetails.cancellationNoticeDays} day${selectedPlan.contractDetails.cancellationNoticeDays !== 1 ? "s" : ""}`}
                      />
                    )}
                    {selectedPlan.contractDetails.cancellationFeeCents != null && selectedPlan.contractDetails.cancellationFeeCents > 0 && (
                      <ContractRow
                        label="Cancellation Fee"
                        value={formatCents(selectedPlan.contractDetails.cancellationFeeCents)}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Agreement */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                  />
                  <span className="text-xs text-gray-700">
                    I have read and agree to the membership terms above. I understand this is a binding agreement
                    {selectedPlan.contractDetails?.contractLengthMonths
                      ? ` for a period of ${formatContractLength(selectedPlan.contractDetails.contractLengthMonths)}`
                      : ""
                    }
                    {selectedPlan.contractDetails?.autoRenew
                      ? " and will automatically renew unless cancelled"
                      : ""
                    }.
                  </span>
                </label>
              </div>

              {/* Signature */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase tracking-wide">
                  Your Signature
                </h4>
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white relative">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full cursor-crosshair"
                    style={{ height: "120px" }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                  />
                  {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-gray-300 text-lg select-none">Sign Here</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-gray-400">Use your finger or stylus</span>
                  {hasSignature && (
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="text-xs text-primary font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400">OR</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>

                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Type your full legal name"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-primary/50 italic"
                  style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
                />
              </div>

              <p className="text-[10px] text-gray-400 text-center">
                Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>

            {/* Fixed Bottom Button */}
            <div className="p-4 border-t border-gray-200 shrink-0 pb-safe">
              <button
                onClick={handleConfirmContract}
                disabled={!canConfirm}
                className="w-full bg-primary text-white py-3.5 rounded-xl font-semibold active:scale-[0.98] transition-all disabled:opacity-40"
              >
                Agree & Add to Cart — {formatCents(selectedPlan.priceCents)}{billingLabel(selectedPlan.billingCycle)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}
