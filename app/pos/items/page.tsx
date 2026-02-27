"use client";

import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";

type POSItemVariant = {
  id: string;
  itemId: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  quantity: number;
};

type POSItem = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  priceCents: number;
  quantity: number;
  category: string | null;
  sizes: string | null;
  colors: string | null;
  variantLabel1: string | null;
  variantLabel2: string | null;
  itemType: string | null;
  isActive: boolean;
  availableOnline: boolean;
  reorderThreshold: number | null;
  variants: POSItemVariant[];
  createdAt: string;
  updatedAt: string;
};

function parseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

function vKey(size: string | null, color: string | null): string {
  return `${size || ""}|${color || ""}`;
}

/** Total stock: sum of variant quantities if variants exist, otherwise base quantity */
function totalStock(item: POSItem): number {
  if (item.variants.length > 0) {
    return item.variants.reduce((sum, v) => sum + v.quantity, 0);
  }
  return item.quantity;
}

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function getItemThreshold(item: POSItem): number {
  return item.reorderThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseCents(dollars: string): number {
  const num = parseFloat(dollars.replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num * 100);
}

export default function POSItemsPage() {
  const [items, setItems] = useState<POSItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  // Edit/Create modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<POSItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    price: "",
    quantity: "0",
    category: "",
    sizes: "",
    colors: "",
    variantLabel1: "",
    variantLabel2: "",
    itemType: "",
    isActive: true,
    availableOnline: false,
    reorderThreshold: "",
  });
  // Variant quantities keyed by "size|color"
  const [variantQty, setVariantQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/items");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories
  const categories = [...new Set(items.filter(i => i.category).map(i => i.category!))].sort();

  // Filter items
  const filteredItems = items.filter(item => {
    const stock = totalStock(item);
    if (!showInactive && !item.isActive) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (stockFilter === "out" && stock > 0) return false;
    if (stockFilter === "low" && (stock <= 0 || stock > getItemThreshold(item))) return false;
    if (stockFilter === "online" && !item.availableOnline) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(searchLower) ||
        item.sku?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  // Derive sizes/colors arrays from form text for the variant grid
  const formSizes = useMemo(() => formData.sizes.split(",").map(s => s.trim()).filter(Boolean), [formData.sizes]);
  const formColors = useMemo(() => formData.colors.split(",").map(s => s.trim()).filter(Boolean), [formData.colors]);
  const hasFormVariants = formSizes.length > 0 || formColors.length > 0;

  function openCreateModal() {
    setEditingItem(null);
    setFormData({
      name: "",
      description: "",
      sku: "",
      price: "",
      quantity: "0",
      category: "",
      sizes: "",
      colors: "",
      variantLabel1: "",
      variantLabel2: "",
      itemType: "",
      isActive: true,
      availableOnline: false,
      reorderThreshold: "",
    });
    setVariantQty({});
    setShowModal(true);
  }

  function openEditModal(item: POSItem) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      sku: item.sku || "",
      price: (item.priceCents / 100).toFixed(2),
      quantity: item.quantity.toString(),
      category: item.category || "",
      sizes: parseJsonArray(item.sizes).join(", "),
      colors: parseJsonArray(item.colors).join(", "),
      variantLabel1: item.variantLabel1 || "",
      variantLabel2: item.variantLabel2 || "",
      itemType: item.itemType || "",
      isActive: item.isActive,
      availableOnline: item.availableOnline,
      reorderThreshold: item.reorderThreshold !== null ? String(item.reorderThreshold) : "",
    });
    // Populate variant quantities from DB
    const vq: Record<string, number> = {};
    for (const v of item.variants) {
      vq[vKey(v.size, v.color)] = v.quantity;
    }
    setVariantQty(vq);
    setShowModal(true);
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert("Name is required");
      return;
    }
    if (!formData.price || parseCents(formData.price) <= 0) {
      alert("Valid price is required");
      return;
    }

    setSaving(true);
    try {
      const sizesArr = formData.sizes.split(",").map(s => s.trim()).filter(Boolean);
      const colorsArr = formData.colors.split(",").map(s => s.trim()).filter(Boolean);
      const hasVariants = sizesArr.length > 0 || colorsArr.length > 0;

      // Build variants array from the grid
      let variants: Array<{ size: string | null; color: string | null; quantity: number; sku: string | null }> | undefined;
      if (hasVariants) {
        variants = [];
        if (sizesArr.length > 0 && colorsArr.length > 0) {
          for (const s of sizesArr) {
            for (const c of colorsArr) {
              variants.push({ size: s, color: c, quantity: variantQty[vKey(s, c)] || 0, sku: null });
            }
          }
        } else if (sizesArr.length > 0) {
          for (const s of sizesArr) {
            variants.push({ size: s, color: null, quantity: variantQty[vKey(s, null)] || 0, sku: null });
          }
        } else {
          for (const c of colorsArr) {
            variants.push({ size: null, color: c, quantity: variantQty[vKey(null, c)] || 0, sku: null });
          }
        }
      }

      // Total quantity = sum of variants or manual entry
      const totalQty = variants
        ? variants.reduce((sum, v) => sum + v.quantity, 0)
        : parseInt(formData.quantity) || 0;

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        sku: formData.sku.trim() || null,
        priceCents: parseCents(formData.price),
        quantity: totalQty,
        category: formData.category.trim() || null,
        sizes: sizesArr.length > 0 ? JSON.stringify(sizesArr) : null,
        colors: colorsArr.length > 0 ? JSON.stringify(colorsArr) : null,
        variantLabel1: formData.variantLabel1.trim() || null,
        variantLabel2: formData.variantLabel2.trim() || null,
        itemType: formData.itemType.trim() || null,
        isActive: formData.isActive,
        availableOnline: formData.availableOnline,
        reorderThreshold: formData.reorderThreshold ? parseInt(formData.reorderThreshold) : null,
        ...(variants !== undefined && { variants }),
      };

      const url = editingItem
        ? `/api/pos/items/${editingItem.id}`
        : "/api/pos/items";

      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save item");
      }

      setShowModal(false);
      fetchItems();
    } catch (error) {
      console.error("Error saving item:", error);
      alert(error instanceof Error ? error.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: POSItem) {
    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/pos/items/${item.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete item");
      }

      fetchItems();
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item");
    }
  }

  async function toggleActive(item: POSItem) {
    try {
      const res = await fetch(`/api/pos/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });

      if (!res.ok) {
        throw new Error("Failed to update item");
      }

      fetchItems();
    } catch (error) {
      console.error("Error updating item:", error);
      alert("Failed to update item");
    }
  }

  async function toggleOnline(item: POSItem) {
    try {
      const res = await fetch(`/api/pos/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availableOnline: !item.availableOnline }),
      });

      if (!res.ok) {
        throw new Error("Failed to update item");
      }

      fetchItems();
    } catch (error) {
      console.error("Error updating item:", error);
      alert("Failed to update item");
    }
  }

  // Summary stats using totalStock
  const activeItems = items.filter(i => i.isActive);
  const outOfStockCount = activeItems.filter(i => totalStock(i) <= 0).length;
  const lowStockCount = activeItems.filter(i => { const s = totalStock(i); return s > 0 && s <= getItemThreshold(i); }).length;
  const onlineCount = activeItems.filter(i => i.availableOnline).length;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading items...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">POS Items</h1>
            <p className="text-sm text-gray-600">Manage your inventory and product catalog</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/pos"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Back to Checkout
            </Link>
            <button
              onClick={openCreateModal}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primaryDark"
            >
              Add Item
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => setStockFilter("all")}
            className={`bg-white border rounded-lg p-3 text-left transition-colors ${stockFilter === "all" ? "border-primary ring-1 ring-primary" : "border-gray-200"}`}
          >
            <p className="text-xs text-gray-500">Total Items</p>
            <p className="text-xl font-bold">{items.length}</p>
          </button>
          <button
            onClick={() => setStockFilter("all")}
            className={`bg-white border rounded-lg p-3 text-left transition-colors ${stockFilter === "all" ? "border-primary ring-1 ring-primary" : "border-gray-200"}`}
          >
            <p className="text-xs text-gray-500">Active</p>
            <p className="text-xl font-bold">{activeItems.length}</p>
          </button>
          <button
            onClick={() => setStockFilter("online")}
            className={`bg-white border rounded-lg p-3 text-left transition-colors ${stockFilter === "online" ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}
          >
            <p className="text-xs text-gray-500">Online Store</p>
            <p className="text-xl font-bold text-blue-600">{onlineCount}</p>
          </button>
          <button
            onClick={() => setStockFilter("low")}
            className={`bg-white border rounded-lg p-3 text-left transition-colors ${stockFilter === "low" ? "border-yellow-500 ring-1 ring-yellow-500" : "border-gray-200"}`}
          >
            <p className="text-xs text-gray-500">Low Stock</p>
            <p className={`text-xl font-bold ${lowStockCount > 0 ? "text-yellow-600" : ""}`}>{lowStockCount}</p>
          </button>
          <button
            onClick={() => setStockFilter("out")}
            className={`bg-white border rounded-lg p-3 text-left transition-colors ${stockFilter === "out" ? "border-red-500 ring-1 ring-red-500" : "border-gray-200"}`}
          >
            <p className="text-xs text-gray-500">Out of Stock</p>
            <p className={`text-xl font-bold ${outOfStockCount > 0 ? "text-red-600" : ""}`}>{outOfStockCount}</p>
          </button>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Inventory Value</p>
            <p className="text-xl font-bold">
              {formatCents(items.reduce((sum, i) => sum + i.priceCents * totalStock(i), 0))}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
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
            {stockFilter !== "all" && (
              <button
                onClick={() => setStockFilter("all")}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
              >
                Clear filter
                <span className="text-xs">&times;</span>
              </button>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-gray-700">Show inactive</span>
            </label>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {items.length === 0 ? (
                <>
                  <p>No items yet.</p>
                  <button
                    onClick={openCreateModal}
                    className="mt-2 text-primary hover:underline"
                  >
                    Add your first item
                  </button>
                </>
              ) : (
                <p>No items match your filters.</p>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Online
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map(item => {
                  const stock = totalStock(item);
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= getItemThreshold(item);
                  const hasVariants = item.variants.length > 0;
                  return (
                    <tr
                      key={item.id}
                      className={
                        !item.isActive
                          ? "bg-gray-50"
                          : isOutOfStock
                          ? "bg-red-50/50"
                          : isLowStock
                          ? "bg-yellow-50/50"
                          : ""
                      }
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className={`font-medium ${!item.isActive ? "text-gray-400" : ""}`}>
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="text-xs text-gray-500 truncate max-w-xs">
                              {item.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.itemType && (
                              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded">
                                {item.itemType}
                              </span>
                            )}
                            {parseJsonArray(item.sizes).length > 0 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded">
                                {parseJsonArray(item.sizes).join(", ")}
                              </span>
                            )}
                            {parseJsonArray(item.colors).length > 0 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded">
                                {parseJsonArray(item.colors).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.sku || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.category || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {formatCents(item.priceCents)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-center">
                          <span className={`text-sm font-medium ${
                            isOutOfStock
                              ? "text-red-600"
                              : isLowStock
                              ? "text-yellow-600"
                              : ""
                          }`}>
                            {stock}
                          </span>
                          {hasVariants && (
                            <p className="text-[10px] text-gray-400">{item.variants.length} variants</p>
                          )}
                          {isOutOfStock && item.isActive && (
                            <p className="text-[10px] text-red-500 mt-0.5">Out of stock</p>
                          )}
                          {isLowStock && item.isActive && (
                            <p className="text-[10px] text-yellow-600 mt-0.5">Low stock</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleActive(item)}
                          className={`px-2 py-1 text-xs rounded-full ${
                            item.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleOnline(item)}
                          className={`px-2 py-1 text-xs rounded-full ${
                            item.availableOnline
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {item.availableOnline ? "Online" : "Off"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(item)}
                            className="text-primary hover:text-primary/80 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="text-primary hover:text-primaryDark text-sm"
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
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-bold">
                {editingItem ? "Edit Item" : "Add New Item"}
              </h2>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Item name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              {/* SKU and Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="SKU-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Apparel"
                    list="categories"
                  />
                  <datalist id="categories">
                    {categories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Price and Quantity (quantity only when no variants) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="text"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {!hasFormVariants && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                )}
              </div>

              {/* Variants: Type, Sizes, Colors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Type
                </label>
                <input
                  type="text"
                  value={formData.itemType}
                  onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="e.g. Gi, Gloves, T-Shirt"
                />
              </div>

              {/* Variant Dimensions */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                <p className="text-sm font-medium text-gray-700">Variants</p>
                <p className="text-[10px] text-gray-400 -mt-2">Add up to two variant dimensions (e.g. Size, Color, Material, Weight)</p>

                {/* Variant 1 */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Variant 1 Label</label>
                    <input
                      type="text"
                      value={formData.variantLabel1}
                      onChange={(e) => setFormData({ ...formData, variantLabel1: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Size"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{formData.variantLabel1 || "Variant 1"} Options</label>
                    <input
                      type="text"
                      value={formData.sizes}
                      onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="S, M, L, XL"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Comma-separated</p>
                  </div>
                </div>

                {/* Variant 2 */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Variant 2 Label</label>
                    <input
                      type="text"
                      value={formData.variantLabel2}
                      onChange={(e) => setFormData({ ...formData, variantLabel2: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Color"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{formData.variantLabel2 || "Variant 2"} Options</label>
                    <input
                      type="text"
                      value={formData.colors}
                      onChange={(e) => setFormData({ ...formData, colors: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="White, Black, Blue"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Comma-separated</p>
                  </div>
                </div>
              </div>

              {/* Variant Inventory Grid */}
              {hasFormVariants && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variant Inventory
                  </label>
                  {formSizes.length > 0 && formColors.length > 0 ? (
                    // Grid: rows = sizes, columns = colors
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500">{formData.variantLabel1 || "Variant 1"} / {formData.variantLabel2 || "Variant 2"}</th>
                            {formColors.map(c => (
                              <th key={c} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {formSizes.map(s => (
                            <tr key={s}>
                              <td className="px-2 py-1.5 text-xs font-medium text-gray-700">{s}</td>
                              {formColors.map(c => {
                                const key = vKey(s, c);
                                return (
                                  <td key={c} className="px-1 py-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={variantQty[key] || 0}
                                      onChange={(e) => setVariantQty(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                                      className="w-full text-center border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    // Single list: sizes only or colors only
                    <div className="space-y-1.5">
                      {(formSizes.length > 0 ? formSizes : formColors).map(label => {
                        const key = formSizes.length > 0 ? vKey(label, null) : vKey(null, label);
                        return (
                          <div key={label} className="flex items-center gap-2">
                            <span className="text-xs text-gray-700 w-20 truncate">{label}</span>
                            <input
                              type="number"
                              min="0"
                              value={variantQty[key] || 0}
                              onChange={(e) => setVariantQty(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                              className="w-20 text-center border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    Total: {Object.values(variantQty).reduce((sum, q) => sum + q, 0)} units
                  </p>
                </div>
              )}

              {/* Toggles */}
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-700">Active (visible in POS checkout)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.availableOnline}
                    onChange={(e) => setFormData({ ...formData, availableOnline: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Available in online store (member portal)</span>
                </label>
              </div>

              {/* Reorder Threshold */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Low Stock Alert Threshold
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={formData.reorderThreshold}
                    onChange={(e) => setFormData({ ...formData, reorderThreshold: e.target.value })}
                    placeholder={String(DEFAULT_LOW_STOCK_THRESHOLD)}
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                  <span className="text-xs text-gray-500">units (default: {DEFAULT_LOW_STOCK_THRESHOLD})</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex gap-3 justify-end shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 text-xs font-semibold bg-primary text-white rounded-md hover:bg-primaryDark disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : editingItem ? "Save Changes" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
