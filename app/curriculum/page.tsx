"use client";

import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";
import { RichTextInput, parseHtmlForPdf } from "@/components/rich-text-input";
import jsPDF from "jspdf";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Style = {
  id: string;
  name: string;
  ranks?: Rank[];
};

type Rank = {
  id: string;
  name: string;
  order: number;
};

type RankTestItem = {
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
  showTitleInPdf?: boolean;
};

type RankTestCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  items: RankTestItem[];
};

type RankTest = {
  id: string;
  name: string;
  description?: string | null;
  rankId: string;
  styleId: string;
  sortOrder: number;
  isActive: boolean;
  rank: {
    id: string;
    name: string;
    order: number;
  };
  categories: RankTestCategory[];
};

const ITEM_TYPES = [
  { value: "skill", label: "Skill/Technique" },
  { value: "form", label: "Form/Kata" },
  { value: "workout", label: "Workout/Exercise" },
  { value: "sparring", label: "Sparring" },
  { value: "self_defense", label: "Self-Defense" },
  { value: "breaking", label: "Board Breaking" },
  { value: "knowledge", label: "Knowledge/Theory" },
  { value: "other", label: "Other" },
];

// Sortable Item Component for drag and drop
function SortableItem({
  item,
  categoryId,
  getTypeColor,
  getTypeLabel,
  openEditItem,
  handleDeleteItem,
}: {
  item: RankTestItem;
  categoryId: string;
  getTypeColor: (type: string) => string;
  getTypeLabel: (type: string) => string;
  openEditItem: (item: RankTestItem, categoryId: string) => void;
  handleDeleteItem: (itemId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100"
    >
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 touch-none"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </button>
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getTypeColor(item.type)}`}>
          {getTypeLabel(item.type)}
        </span>
        <div>
          {item.name && <span className="font-medium">{item.name}</span>}
          {!item.required && (
            <span className={`${item.name ? "ml-2" : ""} text-xs text-gray-400`}>(optional)</span>
          )}
          {item.showTitleInPdf === false && (
            <span className="ml-2 text-xs text-amber-500">(title hidden in PDF)</span>
          )}
          {item.description && (
            <p className="text-xs text-gray-500" dangerouslySetInnerHTML={{ __html: item.description }} />
          )}
          {(item.reps || item.sets || item.duration || item.distance || item.timeLimit) && (
            <p className="text-xs text-gray-500 mt-1">
              {item.sets && `${item.sets} sets`}
              {item.sets && item.reps && " × "}
              {item.reps && `${item.reps} reps`}
              {item.duration && ` • ${item.duration}`}
              {item.distance && ` • ${item.distance}`}
              {item.timeLimit && ` • ${(item.timeLimitOperator || "lte") === "lte" ? "≤" : item.timeLimitOperator === "lt" ? "<" : item.timeLimitOperator === "gte" ? "≥" : item.timeLimitOperator === "gt" ? ">" : "≤"} ${item.timeLimit}`}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.videoUrl && (
          <a
            href={item.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primaryDark text-xs"
          >
            Video
          </a>
        )}
        <button
          onClick={() => openEditItem(item, categoryId)}
          className="text-primary hover:text-primaryDark text-xs"
        >
          Edit
        </button>
        <button
          onClick={() => handleDeleteItem(item.id)}
          className="text-primary hover:text-primaryDark text-xs"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Sortable Category Component for drag and drop
function SortableCategory({
  category,
  children,
  openAddItem,
  openEditCategory,
  handleDeleteCategory,
}: {
  category: RankTestCategory;
  children: React.ReactNode;
  openAddItem: (categoryId: string) => void;
  openEditCategory: (category: RankTestCategory) => void;
  handleDeleteCategory: (categoryId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 touch-none"
            title="Drag to reorder category"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
            </svg>
          </button>
          <div>
            <h3 className="font-semibold text-lg">{category.name}</h3>
            {category.description && (
              <p className="text-sm text-gray-500" dangerouslySetInnerHTML={{ __html: category.description }} />
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openAddItem(category.id)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Add Item
          </button>
          <button
            onClick={() => openEditCategory(category)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Edit
          </button>
          <button
            onClick={() => handleDeleteCategory(category.id)}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
          >
            Delete
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function CurriculumPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("curriculum_selectedStyleId") || "";
    return "";
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Rank tests - all tests for the selected style
  const [rankTests, setRankTests] = useState<RankTest[]>([]);

  // Expanded ranks - which rank sections are expanded
  const [expandedRanks, setExpandedRanks] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("curriculum_expandedRanks");
        if (saved) return new Set(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    return new Set();
  });

  // Currently editing test
  const [editingTestId, setEditingTestId] = useState<string | null>(null);

  // Modals
  const [showTestModal, setShowTestModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [showBulkItemModal, setShowBulkItemModal] = useState(false);
  const [showBulkRemoveCategoryModal, setShowBulkRemoveCategoryModal] = useState(false);
  const [showBulkRemoveItemModal, setShowBulkRemoveItemModal] = useState(false);
  const [bulkItemCategoryName, setBulkItemCategoryName] = useState("");
  const [bulkRemoveCategoryName, setBulkRemoveCategoryName] = useState("");
  const [bulkRemoveItemName, setBulkRemoveItemName] = useState("");
  const [selectedRankIds, setSelectedRankIds] = useState<Set<string>>(new Set());

  // Form states
  const [testName, setTestName] = useState("");
  const [testDescription, setTestDescription] = useState("");
  const [testRankId, setTestRankId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryTestId, setEditingCategoryTestId] = useState<string | null>(null);

  // Item form states
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemType, setItemType] = useState("skill");
  const [itemRequired, setItemRequired] = useState(true);
  const [itemReps, setItemReps] = useState("");
  const [itemSets, setItemSets] = useState("");
  const [itemDuration, setItemDuration] = useState("");
  const [itemDistance, setItemDistance] = useState("");
  const [itemTimeLimit, setItemTimeLimit] = useState("");
  const [itemTimeLimitOperator, setItemTimeLimitOperator] = useState("lte");
  const [itemVideoUrl, setItemVideoUrl] = useState("");
  const [itemShowTitleInPdf, setItemShowTitleInPdf] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemCategoryId, setEditingItemCategoryId] = useState<string | null>(null);
  const [editingItemTestId, setEditingItemTestId] = useState<string | null>(null);

  // Spreadsheet view mode
  const [spreadsheetView, setSpreadsheetView] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("curriculum_spreadsheetView");
      if (saved !== null) return saved === "true";
    }
    return true;
  });

  // Publishing
  const [publishing, setPublishing] = useState(false);
  const [gymSettings, setGymSettings] = useState({
    name: "Martial Arts School",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    website: "",
    logo: "",
  });

  const loadStyles = useCallback(async () => {
    try {
      const res = await fetch("/api/styles");
      if (res.ok) {
        const data = await res.json();
        const loadedStyles = data.styles || [];
        setStyles(loadedStyles);
        // Only default to first style if no saved selection (or saved one no longer exists)
        if (loadedStyles.length > 0) {
          const saved = typeof window !== "undefined" ? localStorage.getItem("curriculum_selectedStyleId") : null;
          const savedExists = saved && loadedStyles.some((s: Style) => s.id === saved);
          if (!savedExists) {
            setSelectedStyleId(loadedStyles[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Error loading styles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRankTests = useCallback(async () => {
    if (!selectedStyleId) return;

    try {
      const res = await fetch(`/api/rank-tests?styleId=${selectedStyleId}`);
      if (res.ok) {
        const data = await res.json();
        setRankTests(data.rankTests || []);
      }
    } catch (err) {
      console.error("Error loading rank tests:", err);
    }
  }, [selectedStyleId]);

  useEffect(() => {
    loadStyles();
    // Load gym settings for PDF header
    fetch("/api/settings")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings && Array.isArray(data.settings)) {
          const map: Record<string, string> = {};
          for (const s of data.settings) map[s.key] = s.value;
          setGymSettings({
            name: map.gymName || "Martial Arts School",
            address: map.gymAddress || "",
            city: map.gymCity || "",
            state: map.gymState || "",
            zipCode: map.gymZipCode || "",
            phone: map.gymPhone || "",
            email: map.gymEmail || "",
            website: map.gymWebsite || "",
            logo: map.gymLogo || "",
          });
        }
      })
      .catch(() => { /* ignore */ });
  }, [loadStyles]);

  useEffect(() => {
    if (selectedStyleId) {
      loadRankTests();
    }
  }, [selectedStyleId, loadRankTests]);

  // Persist selections to localStorage
  useEffect(() => {
    if (selectedStyleId) localStorage.setItem("curriculum_selectedStyleId", selectedStyleId);
  }, [selectedStyleId]);

  useEffect(() => {
    localStorage.setItem("curriculum_spreadsheetView", String(spreadsheetView));
  }, [spreadsheetView]);

  useEffect(() => {
    localStorage.setItem("curriculum_expandedRanks", JSON.stringify([...expandedRanks]));
  }, [expandedRanks]);

  const selectedStyle = styles.find(s => s.id === selectedStyleId);
  const sortedRanks = selectedStyle?.ranks?.sort((a, b) => a.order - b.order) || [];

  // Group tests by rank
  const testsByRank: Record<string, RankTest[]> = {};
  rankTests.forEach(test => {
    if (!testsByRank[test.rankId]) {
      testsByRank[test.rankId] = [];
    }
    testsByRank[test.rankId].push(test);
  });

  const toggleRankExpanded = (rankId: string) => {
    setExpandedRanks(prev => {
      const next = new Set(prev);
      if (next.has(rankId)) {
        next.delete(rankId);
      } else {
        next.add(rankId);
      }
      return next;
    });
  };

  const handleCreateTest = async () => {
    if (!testName || !testRankId || !selectedStyleId) {
      alert("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/rank-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: testName,
          description: testDescription,
          rankId: testRankId,
          styleId: selectedStyleId,
        }),
      });

      if (res.ok) {
        setShowTestModal(false);
        setTestName("");
        setTestDescription("");
        setTestRankId("");
        await loadRankTests();
        // Expand the rank that just got a test
        setExpandedRanks(prev => new Set(prev).add(testRankId));
      } else {
        const errorText = await res.text();
        console.error("Failed to create test:", errorText);
        alert("Failed to create test: " + errorText);
      }
    } catch (err) {
      console.error("Error creating test:", err);
      alert("Error creating test. Please check the console for details.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm("Delete this test curriculum? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/rank-tests/${testId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadRankTests();
        if (editingTestId === testId) {
          setEditingTestId(null);
        }
      }
    } catch (err) {
      console.error("Error deleting test:", err);
    }
  };

  const handleUpdateTest = async () => {
    if (!testName || !editingTestId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/rank-tests/${editingTestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: testName,
          description: testDescription,
        }),
      });

      if (res.ok) {
        setEditingTestId(null);
        setTestName("");
        setTestDescription("");
        await loadRankTests();
      } else {
        const errorText = await res.text();
        console.error("Failed to update test:", errorText);
        alert("Failed to update test: " + errorText);
      }
    } catch (err) {
      console.error("Error updating test:", err);
    } finally {
      setSaving(false);
    }
  };

  const openEditTest = (test: RankTest) => {
    setEditingTestId(test.id);
    setTestName(test.name);
    setTestDescription(test.description || "");
  };

  const cancelEditTest = () => {
    setEditingTestId(null);
    setTestName("");
    setTestDescription("");
  };

  const MAX_CATEGORIES_PER_RANK = 10;

  const handleCreateCategory = async () => {
    if (!categoryName || !editingCategoryTestId) return;

    // Enforce category cap
    const test = rankTests.find(t => t.id === editingCategoryTestId);
    if (test && test.categories.length >= MAX_CATEGORIES_PER_RANK) {
      alert(`Maximum of ${MAX_CATEGORIES_PER_RANK} categories per rank.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/rank-tests/${editingCategoryTestId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryName,
          description: categoryDescription,
        }),
      });

      if (res.ok) {
        setShowCategoryModal(false);
        setCategoryName("");
        setCategoryDescription("");
        setEditingCategoryId(null);
        setEditingCategoryTestId(null);
        await loadRankTests();
      }
    } catch (err) {
      console.error("Error creating category:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCategory = async () => {
    if (!categoryName || !editingCategoryTestId || !editingCategoryId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/rank-tests/${editingCategoryTestId}/categories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: editingCategoryId,
          name: categoryName,
          description: categoryDescription,
        }),
      });

      if (res.ok) {
        setShowCategoryModal(false);
        setCategoryName("");
        setCategoryDescription("");
        setEditingCategoryId(null);
        setEditingCategoryTestId(null);
        await loadRankTests();
      }
    } catch (err) {
      console.error("Error updating category:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategoryToSelectedRanks = async () => {
    if (!categoryName || selectedRankIds.size === 0) return;

    setSaving(true);
    try {
      const ranksToAdd = sortedRanks.filter(r => selectedRankIds.has(r.id));
      let successCount = 0;

      for (const rank of ranksToAdd) {
        // Check if a test exists for this rank
        let testId = rankTests.find(t => t.rankId === rank.id)?.id;

        // Create test if it doesn't exist
        if (!testId) {
          const createRes = await fetch("/api/rank-tests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `${rank.name} Test`,
              description: "",
              rankId: rank.id,
              styleId: selectedStyleId,
            }),
          });

          if (createRes.ok) {
            const data = await createRes.json();
            testId = data.rankTest.id;
          }
        }

        // Add category to the test (skip if at cap)
        if (testId) {
          const existingTest = rankTests.find(t => t.id === testId);
          if (existingTest && existingTest.categories.length >= MAX_CATEGORIES_PER_RANK) {
            continue; // skip this rank, already at cap
          }
          const res = await fetch(`/api/rank-tests/${testId}/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: categoryName,
              description: categoryDescription,
            }),
          });

          if (res.ok) {
            successCount++;
          }
        }
      }

      setShowBulkCategoryModal(false);
      setCategoryName("");
      setCategoryDescription("");
      setSelectedRankIds(new Set());
      await loadRankTests();

      if (successCount < ranksToAdd.length) {
        alert(`Added category to ${successCount} of ${ranksToAdd.length} ranks. Some may have failed.`);
      }
    } catch (err) {
      console.error("Error adding category to ranks:", err);
      alert("Error adding category to ranks");
    } finally {
      setSaving(false);
    }
  };

  // Get unique category names across all tests
  const uniqueCategoryNames = [...new Set(
    rankTests.flatMap(t => t.categories.map(c => c.name))
  )].sort();

  // Get unique item names across all tests (for bulk remove)
  const uniqueItemNames = [...new Set(
    rankTests.flatMap(t => t.categories.flatMap(c => c.items.map(i => i.name).filter(n => n)))
  )].sort();

  const handleAddItemToSelectedCategories = async () => {
    if (!bulkItemCategoryName || selectedRankIds.size === 0) return;

    setSaving(true);
    try {
      let successCount = 0;
      let totalCategories = 0;

      // Only process tests for selected ranks
      const testsToProcess = rankTests.filter(t => selectedRankIds.has(t.rankId));

      for (const test of testsToProcess) {
        for (const category of test.categories) {
          if (category.name === bulkItemCategoryName) {
            totalCategories++;
            const res = await fetch(`/api/rank-tests/${test.id}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                categoryId: category.id,
                name: itemName,
                description: itemDescription,
                type: itemType,
                required: itemRequired,
                reps: itemReps ? parseInt(itemReps) : null,
                sets: itemSets ? parseInt(itemSets) : null,
                duration: itemDuration,
                distance: itemDistance,
                timeLimit: itemTimeLimit,
                timeLimitOperator: itemTimeLimit ? itemTimeLimitOperator : null,
                videoUrl: itemVideoUrl,
              }),
            });

            if (res.ok) {
              successCount++;
            }
          }
        }
      }

      setShowBulkItemModal(false);
      setBulkItemCategoryName("");
      setItemName("");
      setItemDescription("");
      setItemType("skill");
      setItemRequired(true);
      setItemReps("");
      setItemSets("");
      setItemDuration("");
      setItemDistance("");
      setItemTimeLimit("");
      setItemTimeLimitOperator("lte");
      setItemVideoUrl("");
      setSelectedRankIds(new Set());
      await loadRankTests();

      if (successCount < totalCategories) {
        alert(`Added item to ${successCount} of ${totalCategories} categories. Some may have failed.`);
      }
    } catch (err) {
      console.error("Error adding item to categories:", err);
      alert("Error adding item to categories");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkRemoveCategory = async () => {
    if (!bulkRemoveCategoryName || selectedRankIds.size === 0) return;

    setSaving(true);
    try {
      let successCount = 0;
      let totalFound = 0;

      const testsToProcess = rankTests.filter(t => selectedRankIds.has(t.rankId));

      for (const test of testsToProcess) {
        const categoryToRemove = test.categories.find(c => c.name === bulkRemoveCategoryName);
        if (categoryToRemove) {
          totalFound++;
          const res = await fetch(`/api/rank-tests/${test.id}/categories?categoryId=${categoryToRemove.id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            successCount++;
          }
        }
      }

      setShowBulkRemoveCategoryModal(false);
      setBulkRemoveCategoryName("");
      setSelectedRankIds(new Set());
      await loadRankTests();

      if (totalFound === 0) {
        alert("No matching categories found in selected ranks.");
      } else if (successCount < totalFound) {
        alert(`Removed ${successCount} of ${totalFound} categories. Some may have failed.`);
      }
    } catch (err) {
      console.error("Error removing categories:", err);
      alert("Error removing categories");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkRemoveItem = async () => {
    if (!bulkItemCategoryName || selectedRankIds.size === 0) return;

    setSaving(true);
    try {
      let successCount = 0;
      let totalFound = 0;

      const testsToProcess = rankTests.filter(t => selectedRankIds.has(t.rankId));

      for (const test of testsToProcess) {
        for (const category of test.categories) {
          if (category.name === bulkItemCategoryName) {
            // Find items matching the name (or all items if no name specified)
            const itemsToRemove = bulkRemoveItemName
              ? category.items.filter(i => i.name === bulkRemoveItemName)
              : [];

            for (const item of itemsToRemove) {
              totalFound++;
              const res = await fetch(`/api/rank-tests/${test.id}/items?itemId=${item.id}`, {
                method: "DELETE",
              });
              if (res.ok) {
                successCount++;
              }
            }
          }
        }
      }

      setShowBulkRemoveItemModal(false);
      setBulkRemoveItemName("");
      setBulkItemCategoryName("");
      setSelectedRankIds(new Set());
      await loadRankTests();

      if (totalFound === 0) {
        alert("No matching items found in selected ranks.");
      } else if (successCount < totalFound) {
        alert(`Removed ${successCount} of ${totalFound} items. Some may have failed.`);
      }
    } catch (err) {
      console.error("Error removing items:", err);
      alert("Error removing items");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (testId: string, categoryId: string) => {
    if (!confirm("Delete this category and all its items?")) return;

    try {
      const res = await fetch(`/api/rank-tests/${testId}/categories?categoryId=${categoryId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadRankTests();
      }
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  const handleCreateItem = async () => {
    if (!editingItemTestId || !editingItemCategoryId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/rank-tests/${editingItemTestId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: editingItemCategoryId,
          name: itemName,
          description: itemDescription,
          type: itemType,
          required: itemRequired,
          reps: itemReps ? parseInt(itemReps) : null,
          sets: itemSets ? parseInt(itemSets) : null,
          duration: itemDuration,
          distance: itemDistance,
          timeLimit: itemTimeLimit,
          timeLimitOperator: itemTimeLimit ? itemTimeLimitOperator : null,
          videoUrl: itemVideoUrl,
          showTitleInPdf: itemShowTitleInPdf,
        }),
      });

      if (res.ok) {
        closeItemModal();
        await loadRankTests();
      }
    } catch (err) {
      console.error("Error creating item:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItemTestId || !editingItemId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/rank-tests/${editingItemTestId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editingItemId,
          name: itemName,
          description: itemDescription,
          type: itemType,
          required: itemRequired,
          reps: itemReps ? parseInt(itemReps) : null,
          sets: itemSets ? parseInt(itemSets) : null,
          duration: itemDuration,
          distance: itemDistance,
          timeLimit: itemTimeLimit,
          timeLimitOperator: itemTimeLimit ? itemTimeLimitOperator : null,
          videoUrl: itemVideoUrl,
          showTitleInPdf: itemShowTitleInPdf,
        }),
      });

      if (res.ok) {
        closeItemModal();
        await loadRankTests();
      }
    } catch (err) {
      console.error("Error updating item:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (testId: string, itemId: string) => {
    if (!confirm("Delete this item?")) return;

    try {
      const res = await fetch(`/api/rank-tests/${testId}/items?itemId=${itemId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadRankTests();
      }
    } catch (err) {
      console.error("Error deleting item:", err);
    }
  };

  const openAddCategory = (testId: string) => {
    setEditingCategoryId(null);
    setEditingCategoryTestId(testId);
    setCategoryName("");
    setCategoryDescription("");
    setShowCategoryModal(true);
  };

  // Add category to a rank - auto-creates test if needed
  const openAddCategoryForRank = async (rankId: string, rankName: string) => {
    // Check if a test exists for this rank
    const existingTest = rankTests.find(t => t.rankId === rankId);

    if (existingTest) {
      // Enforce category cap
      if (existingTest.categories.length >= MAX_CATEGORIES_PER_RANK) {
        alert(`Maximum of ${MAX_CATEGORIES_PER_RANK} categories per rank.`);
        return;
      }
      // Use existing test
      openAddCategory(existingTest.id);
    } else {
      // Create a test first, then open the category modal
      try {
        const res = await fetch("/api/rank-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${rankName} Test`,
            description: "",
            rankId: rankId,
            styleId: selectedStyleId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          await loadRankTests();
          // Open add category modal for the new test
          setEditingCategoryId(null);
          setEditingCategoryTestId(data.rankTest.id);
          setCategoryName("");
          setCategoryDescription("");
          setShowCategoryModal(true);
        }
      } catch (err) {
        console.error("Error creating test:", err);
        alert("Failed to create test for this rank");
      }
    }
  };

  const openEditCategory = (testId: string, category: RankTestCategory) => {
    setEditingCategoryId(category.id);
    setEditingCategoryTestId(testId);
    setCategoryName(category.name);
    setCategoryDescription(category.description || "");
    setShowCategoryModal(true);
  };

  const openAddItem = (testId: string, categoryId: string) => {
    setEditingItemId(null);
    setEditingItemTestId(testId);
    setEditingItemCategoryId(categoryId);
    setItemName("");
    setItemDescription("");
    setItemType("skill");
    setItemRequired(true);
    setItemReps("");
    setItemSets("");
    setItemDuration("");
    setItemDistance("");
    setItemTimeLimit("");
    setItemTimeLimitOperator("lte");
    setItemVideoUrl("");
    setItemShowTitleInPdf(true);
    setShowItemModal(true);
  };

  const openEditItem = (testId: string, item: RankTestItem, categoryId: string) => {
    setEditingItemId(item.id);
    setEditingItemTestId(testId);
    setEditingItemCategoryId(categoryId);
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemType(item.type);
    setItemRequired(item.required);
    setItemReps(item.reps?.toString() || "");
    setItemSets(item.sets?.toString() || "");
    setItemDuration(item.duration || "");
    setItemDistance(item.distance || "");
    setItemTimeLimit(item.timeLimit || "");
    setItemTimeLimitOperator(item.timeLimitOperator || "lte");
    setItemVideoUrl(item.videoUrl || "");
    setItemShowTitleInPdf(item.showTitleInPdf !== false);
    setShowItemModal(true);
  };

  const closeItemModal = () => {
    setShowItemModal(false);
    setEditingItemId(null);
    setEditingItemTestId(null);
    setEditingItemCategoryId(null);
    setItemName("");
    setItemDescription("");
    setItemType("skill");
    setItemRequired(true);
    setItemReps("");
    setItemSets("");
    setItemDuration("");
    setItemDistance("");
    setItemTimeLimit("");
    setItemTimeLimitOperator("lte");
    setItemVideoUrl("");
    setItemShowTitleInPdf(true);
  };

  // Inline item field update for spreadsheet view
  const updateItemFieldInline = async (
    testId: string,
    itemId: string,
    field: keyof RankTestItem,
    value: string | number | null
  ) => {
    // Optimistically update the UI
    setRankTests(prev => prev.map(test => {
      if (test.id !== testId) return test;
      return {
        ...test,
        categories: test.categories.map(cat => ({
          ...cat,
          items: cat.items.map(item => {
            if (item.id !== itemId) return item;
            return { ...item, [field]: value };
          }),
        })),
      };
    }));
  };

  const commitItemFieldInline = async (
    testId: string,
    itemId: string,
    updates: Partial<RankTestItem>
  ) => {
    try {
      await fetch(`/api/rank-tests/${testId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          ...updates,
        }),
      });
    } catch (err) {
      console.error("Error updating item:", err);
      // Reload to revert on error
      await loadRankTests();
    }
  };

  const handleInlineKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    testId: string,
    itemId: string,
    field: keyof RankTestItem,
    value: string | number | null
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };

  const handleInlineBlur = async (
    testId: string,
    itemId: string,
    field: keyof RankTestItem,
    value: string | number | null
  ) => {
    const updates: Partial<RankTestItem> = {};
    if (field === "reps" || field === "sets") {
      updates[field] = value === "" || value === null ? null : Number(value) || null;
    } else {
      (updates as Record<string, unknown>)[field] = value === "" ? null : value;
    }

    // Auto-set timeLimitOperator when timeLimit is entered and operator is not set
    if (field === "timeLimit" && value && value !== "") {
      const test = rankTests.find(t => t.id === testId);
      const item = test?.categories.flatMap(c => c.items).find(i => i.id === itemId);
      if (item && !item.timeLimitOperator) {
        (updates as Record<string, unknown>).timeLimitOperator = "lte";
        updateItemFieldInline(testId, itemId, "timeLimitOperator", "lte");
      }
    }
    // Clear timeLimitOperator when timeLimit is removed
    if (field === "timeLimit" && (!value || value === "")) {
      (updates as Record<string, unknown>).timeLimitOperator = null;
      updateItemFieldInline(testId, itemId, "timeLimitOperator", null as any);
    }

    await commitItemFieldInline(testId, itemId, updates);
  };

  const getTypeLabel = (type: string) => {
    return ITEM_TYPES.find(t => t.value === type)?.label || type;
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "skill": return "bg-blue-100 text-blue-800";
      case "form": return "bg-purple-100 text-purple-800";
      case "workout": return "bg-orange-100 text-orange-800";
      case "sparring": return "bg-red-100 text-red-800";
      case "self_defense": return "bg-green-100 text-green-800";
      case "breaking": return "bg-yellow-100 text-yellow-800";
      case "knowledge": return "bg-indigo-100 text-indigo-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering items
  const handleDragEnd = async (event: DragEndEvent, testId: string, categoryId: string, items: RankTestItem[]) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const newItems = arrayMove(items, oldIndex, newIndex);

      // Optimistically update the UI
      setRankTests(prev => prev.map(test => {
        if (test.id !== testId) return test;
        return {
          ...test,
          categories: test.categories.map(cat => {
            if (cat.id !== categoryId) return cat;
            return { ...cat, items: newItems };
          }),
        };
      }));

      // Persist the new order to the database
      try {
        const updatePromises = newItems.map((item, index) =>
          fetch(`/api/rank-tests/${testId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId: item.id,
              sortOrder: index,
            }),
          })
        );
        await Promise.all(updatePromises);
      } catch (err) {
        console.error("Error updating item order:", err);
        await loadRankTests();
      }
    }
  };

  // Handle drag end for reordering categories
  const handleCategoryDragEnd = async (event: DragEndEvent, testId: string, categories: RankTestCategory[]) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((cat) => cat.id === active.id);
    const newIndex = categories.findIndex((cat) => cat.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newCategories = arrayMove(categories, oldIndex, newIndex);

    // Optimistically update the UI
    setRankTests(prev => prev.map(test => {
      if (test.id !== testId) return test;
      return { ...test, categories: newCategories };
    }));

    // Persist the new order to the database
    try {
      const updatePromises = newCategories.map((category, index) =>
        fetch(`/api/rank-tests/${testId}/categories`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryId: category.id,
            sortOrder: index,
          }),
        })
      );
      await Promise.all(updatePromises);
    } catch (err) {
      console.error("Error updating category order:", err);
      await loadRankTests();
    }
  };

  // Color helpers for PDF generation
  function hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [200, 200, 200];
    return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  }

  function lightenColor(rgb: [number, number, number], amount: number): [number, number, number] {
    return [
      Math.round(rgb[0] + (255 - rgb[0]) * amount),
      Math.round(rgb[1] + (255 - rgb[1]) * amount),
      Math.round(rgb[2] + (255 - rgb[2]) * amount),
    ];
  }

  function isLightColor(rgb: [number, number, number]): boolean {
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.5;
  }

  // Generate a curriculum PDF for a single rank (matches belt color, fills full page)
  function generateCurriculumPdf(styleName: string, rankName: string, tests: RankTest[], beltColor: string, logoImg?: HTMLImageElement): Blob {
    const rawRgb = hexToRgb(beltColor);

    // Detect near-white and near-black belts for special treatment
    const isWhiteBelt = rawRgb[0] > 240 && rawRgb[1] > 240 && rawRgb[2] > 240;
    const isBlackBelt = rawRgb[0] < 30 && rawRgb[1] < 30 && rawRgb[2] < 30;

    // Color scheme: rank color for title bars, tint for alternating content rows, white for the rest
    let rgb: [number, number, number];
    let veryLightTint: [number, number, number];
    let useWhiteText: boolean;

    if (isWhiteBelt) {
      rgb = [180, 180, 180];           // medium grey for title bars
      veryLightTint = [228, 228, 228]; // light grey for alternating rows
      useWhiteText = false;
    } else if (isBlackBelt) {
      rgb = [25, 25, 25];              // near-black for title bars
      veryLightTint = [220, 220, 220]; // light grey for alternating rows
      useWhiteText = true;
    } else {
      rgb = rawRgb;
      veryLightTint = lightenColor(rgb, 0.78);
      useWhiteText = !isLightColor(rgb);
    }

    const pdf = new jsPDF({ orientation: "landscape", format: "letter" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const cw = pw - margin * 2;
    const footerY = ph - 12; // footer starts here
    const disclaimerY = footerY - 6; // disclaimer text above footer
    const rowH = 5.5;

    // Gather all categories sorted
    const allCategories = tests.flatMap(t => t.categories).sort((a, b) => a.sortOrder - b.sortOrder);

    // Separate: knowledge categories (Q&A text) vs table categories
    const knowledgeCategories = allCategories.filter(c =>
      c.items.length > 0 && c.items.every(i => i.type === "knowledge")
    );
    const tableCategories = allCategories.filter(c =>
      c.items.length > 0 && !c.items.every(i => i.type === "knowledge")
    );

    // Helper: draw a filled+bordered cell
    function drawCell(x: number, cy: number, w: number, h: number, fillRgb: [number, number, number]) {
      pdf.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
      pdf.rect(x, cy, w, h, "F");
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.2);
      pdf.rect(x, cy, w, h, "S");
    }

    // Helper: set text color for belt-colored backgrounds
    function setBeltTextColor() {
      pdf.setTextColor(useWhiteText ? 255 : 0, useWhiteText ? 255 : 0, useWhiteText ? 255 : 0);
    }

    // ============================================================
    // PAGE RENDERING
    // ============================================================
    let y = margin;

    // === HEADER BOX (belt color, rank title + gym info together) ===
    // Format phone number: (XXX) XXX-XXXX
    function formatPhone(phone: string): string {
      const digits = phone.replace(/\D/g, "");
      if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
      if (digits.length === 11 && digits[0] === "1") {
        return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
      }
      return phone; // return as-is if not a standard US number
    }

    // Build gym info lines in order: style/name, address, city/state/zip, phone
    const cityStateZip = [gymSettings.city, gymSettings.state, gymSettings.zipCode].filter(Boolean).join(", ");
    const infoTitle = `${styleName} / ${gymSettings.name}`;
    const infoLines: { text: string; bold?: boolean }[] = [{ text: infoTitle, bold: true }];
    if (gymSettings.address) infoLines.push({ text: gymSettings.address });
    if (cityStateZip) infoLines.push({ text: cityStateZip });
    if (gymSettings.phone) infoLines.push({ text: formatPhone(gymSettings.phone) });

    const lineH = 3;
    const infoBlockH = infoLines.length * lineH;
    const logoH = 16;
    const headerBoxH = Math.max(logoH + 2, infoBlockH + 2);

    // Calculate left edge of info block (find widest line, position block so it sits on the right)
    pdf.setFontSize(8);
    let maxInfoW = 0;
    for (const line of infoLines) {
      pdf.setFont("helvetica", line.bold ? "bold" : "normal");
      const w = pdf.getTextWidth(line.text);
      if (w > maxInfoW) maxInfoW = w;
    }
    const infoLeftX = pw - margin - maxInfoW;

    // Logo (top-left, fixed 16mm height)
    if (logoImg) {
      const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
      const logoW = logoH * aspect;
      pdf.addImage(logoImg, margin, y + (headerBoxH - logoH) / 2, logoW, logoH);
    }

    // Rank title (centered, large)
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${rankName} Techniques`, pw / 2, y + headerBoxH / 2 + 1, { align: "center" });

    // Gym info (left-aligned text block on the right side)
    pdf.setFontSize(8);
    pdf.setTextColor(0, 0, 0);
    let hry = y + (headerBoxH - infoBlockH) / 2 + 2.5;
    for (const line of infoLines) {
      pdf.setFont("helvetica", line.bold ? "bold" : "normal");
      pdf.text(line.text, infoLeftX, hry);
      hry += lineH;
    }
    y += headerBoxH + 0.5;

    // === KNOWLEDGE SECTION (Q&A in bordered area) ===
    // Pre-render knowledge text to calculate height, then draw bordered background
    type KnowledgeBlock = { catName: string; items: Array<{ name: string; desc: string; videoUrl?: string; showTitle: boolean }> };
    const knowledgeBlocks: KnowledgeBlock[] = [];
    for (const cat of knowledgeCategories) {
      const block: KnowledgeBlock = {
        catName: cat.name,
        items: cat.items.map(item => ({
          name: item.name,
          desc: item.description || "",
          videoUrl: item.videoUrl || undefined,
          showTitle: item.showTitleInPdf !== false,
        })),
      };
      knowledgeBlocks.push(block);
    }

    if (knowledgeBlocks.length > 0) {
      // Measure knowledge section height
      const knowledgeStartY = y;
      let measY = y;
      for (const block of knowledgeBlocks) {
        measY += 6; // category header bar
        for (const item of block.items) {
          measY += 4; // top padding per item (room above text)
          if (item.showTitle) {
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            const nameLines = pdf.splitTextToSize(item.name, cw - 6);
            measY += nameLines.length * 3.5;
          }
          if (item.desc) {
            pdf.setFontSize(9);
            const segments = parseHtmlForPdf(item.desc);
            // Flatten segments into one text stream to avoid duplicate structural newlines
            let fullDescText = "";
            const boldRanges: Array<{ start: number; end: number }> = [];
            let pos = 0;
            for (const seg of segments) {
              if (seg.bold) boldRanges.push({ start: pos, end: pos + seg.text.length });
              fullDescText += seg.text;
              pos += seg.text.length;
            }
            const descLines = fullDescText.split("\n");
            let charPos = 0;
            for (const line of descLines) {
              const lineStart = charPos;
              const lineEnd = charPos + line.length;
              charPos = lineEnd + 1;
              if (!line.trim()) { measY += 3.5; continue; }
              const isBold = boldRanges.some(r => r.start < lineEnd && r.end > lineStart);
              pdf.setFont("helvetica", isBold ? "bold" : "normal");
              const wrapped = pdf.splitTextToSize(line, cw - 6);
              measY += wrapped.length * 3.5;
            }
          }
          if (item.videoUrl) measY += 3.5;
          measY += 1;
        }
      }
      const knowledgeH = measY - knowledgeStartY;

      // Render knowledge text with alternating tint per item
      y = knowledgeStartY;
      for (const block of knowledgeBlocks) {
        // Category title bar (rank color)
        drawCell(margin, y, cw, 6, rgb);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        setBeltTextColor();
        pdf.text(block.catName, pw / 2, y + 4.2, { align: "center" });
        pdf.setTextColor(0, 0, 0);
        y += 6;

        for (let ii = 0; ii < block.items.length; ii++) {
          const item = block.items[ii];

          // Measure this item's height first
          let itemH = 4; // top padding (room above text)
          if (item.showTitle) {
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            const nameLinesMeas = pdf.splitTextToSize(item.name, cw - 6);
            itemH += nameLinesMeas.length * 3.5;
          }
          if (item.desc) {
            pdf.setFontSize(9);
            const segments = parseHtmlForPdf(item.desc);
            let fullDescText = "";
            const boldRanges2: Array<{ start: number; end: number }> = [];
            let pos2 = 0;
            for (const seg of segments) {
              if (seg.bold) boldRanges2.push({ start: pos2, end: pos2 + seg.text.length });
              fullDescText += seg.text;
              pos2 += seg.text.length;
            }
            const descLines = fullDescText.split("\n");
            let charPos2 = 0;
            for (const line of descLines) {
              const lineStart = charPos2;
              const lineEnd = charPos2 + line.length;
              charPos2 = lineEnd + 1;
              if (!line.trim()) { itemH += 3.5; continue; }
              const isBold = boldRanges2.some(r => r.start < lineEnd && r.end > lineStart);
              pdf.setFont("helvetica", isBold ? "bold" : "normal");
              const wrapped = pdf.splitTextToSize(line, cw - 6);
              itemH += wrapped.length * 3.5;
            }
          }
          if (item.videoUrl) itemH += 3.5;
          itemH += 1; // bottom spacing

          // Draw tint/white background for this item
          const itemBg: [number, number, number] = ii % 2 === 0 ? veryLightTint : [255, 255, 255];
          drawCell(margin, y, cw, itemH, itemBg);

          // Render item content
          y += 4; // top padding (room above text)
          if (item.showTitle) {
            pdf.setFontSize(9);
            pdf.setFont("helvetica", "bold");
            pdf.setTextColor(0, 0, 0);
            const nameLines = pdf.splitTextToSize(item.name, cw - 6);
            for (const nl of nameLines) {
              pdf.text(nl, margin + 3, y);
              y += 3.5;
            }
          }

          if (item.desc) {
            const segments = parseHtmlForPdf(item.desc);
            // Flatten segments into one text stream to avoid duplicate structural newlines
            let fullDescText = "";
            const boldRanges3: Array<{ start: number; end: number }> = [];
            let pos3 = 0;
            for (const seg of segments) {
              if (seg.bold) boldRanges3.push({ start: pos3, end: pos3 + seg.text.length });
              fullDescText += seg.text;
              pos3 += seg.text.length;
            }
            const descLines = fullDescText.split("\n");
            let charPos3 = 0;
            for (const textLine of descLines) {
              const lineStart = charPos3;
              const lineEnd = charPos3 + textLine.length;
              charPos3 = lineEnd + 1;
              if (!textLine.trim()) { y += 3.5; continue; }
              const isBold = boldRanges3.some(r => r.start < lineEnd && r.end > lineStart);
              pdf.setFont("helvetica", isBold ? "bold" : "normal");
              pdf.setFontSize(9);
              const wrapped = pdf.splitTextToSize(textLine, cw - 6);
              for (const wl of wrapped) {
                pdf.text(wl, margin + 3, y);
                y += 3.5;
              }
            }
          }

          // Link after all text
          if (item.videoUrl) {
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 200);
            pdf.text("Link", margin + 3, y);
            const linkW = pdf.getTextWidth("Link");
            pdf.setDrawColor(0, 0, 200);
            pdf.setLineWidth(0.15);
            pdf.line(margin + 3, y + 0.5, margin + 3 + linkW, y + 0.5);
            pdf.link(margin + 3, y - 3, linkW + 1, 4, { url: item.videoUrl });
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0);
            pdf.setDrawColor(0, 0, 0);
            y += 3.5;
          }

          y += 1;
        }
      }
      y = knowledgeStartY + knowledgeH;
    }

    // === FOOTER HELPER (drawn on every page) ===
    function drawFooter() {
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(80, 80, 80);
      if (gymSettings.website) pdf.text(gymSettings.website, margin, footerY);
      if (gymSettings.email) pdf.text(gymSettings.email, pw / 2, footerY, { align: "center" });
      pdf.text(new Date().toLocaleDateString(), pw - margin, footerY, { align: "right" });
      pdf.setTextColor(0, 0, 0);
    }

    // Helper: start a new page and reset y
    function newPage(): number {
      drawFooter();
      pdf.addPage();
      return margin;
    }

    // Helper: build full item text as plain string (for wrap/width calculation)
    function buildItemText(item: RankTestItem): string {
      let text = "";
      const showName = item.showTitleInPdf !== false;
      if (showName) text += item.name;
      const reqs: string[] = [];
      if (item.sets && item.reps) {
        reqs.push(`${item.sets} sets x ${item.reps} reps`);
      } else {
        if (item.sets) reqs.push(`${item.sets} sets`);
        if (item.reps) reqs.push(`${item.reps} reps`);
      }
      if (item.duration) reqs.push(`${item.duration} duration`);
      if (item.distance) reqs.push(`${item.distance} distance`);
      const rText = reqs.join(" / ");
      let timePart = "";
      if (item.timeLimit) {
        const tlOp = item.timeLimitOperator || "lte";
        const op = tlOp === "lte" ? "<=" : tlOp === "lt" ? "<" : tlOp === "gte" ? ">=" : tlOp === "gt" ? ">" : "<=";
        timePart = `${op} ${item.timeLimit}`;
      }
      if (rText || timePart) {
        if (showName) text += " - ";
        if (rText) text += rText;
        if (timePart) { if (rText) text += " "; text += timePart; }
      }
      if (item.videoUrl) text += " - Link";
      return text;
    }

    // Helper: how many rowH lines an item needs at a given column width
    function getItemRowCount(item: RankTestItem, colW: number): number {
      const cellMaxW = colW - 4;
      const indent = 8; // must match rendering indent
      const hasLink = !!item.videoUrl;
      // Split base text (without link) to avoid "- Link" being split across lines
      const baseText = hasLink ? buildItemText({ ...item, videoUrl: null } as RankTestItem) : buildItemText(item);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const firstLines = pdf.splitTextToSize(baseText, cellMaxW);
      const renderLines: string[] = [firstLines[0]];
      if (firstLines.length > 1) {
        const remaining = firstLines.slice(1).join(" ");
        const contLines = pdf.splitTextToSize(remaining, cellMaxW - indent);
        renderLines.push(...contLines);
      }
      // Append " - Link" to last line or add new line if it doesn't fit
      if (hasLink) {
        const lastIdx = renderLines.length - 1;
        const maxW = lastIdx === 0 ? cellMaxW : cellMaxW - indent;
        const withLink = renderLines[lastIdx] + " - Link";
        if (pdf.getTextWidth(withLink) <= maxW) {
          renderLines[lastIdx] = withLink;
        } else {
          renderLines.push("- Link");
        }
      }
      return renderLines.length;
    }

    // Helper: render a single table item cell (single-line with fancy formatting)
    function renderItemCell(item: RankTestItem, colX: number, colWidth: number, cellY: number) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);

      const cellLeft = colX + 2;
      const cellMaxW = colWidth - 4;

      // Build requirements string with field labels
      const reqs: string[] = [];
      if (item.sets && item.reps) {
        reqs.push(`${item.sets} sets x ${item.reps} reps`);
      } else {
        if (item.sets) reqs.push(`${item.sets} sets`);
        if (item.reps) reqs.push(`${item.reps} reps`);
      }
      if (item.duration) reqs.push(`${item.duration} duration`);
      if (item.distance) reqs.push(`${item.distance} distance`);
      // Time limit handled separately for underlined operator symbol
      let timeLimitOp = "";
      let timeLimitUnderline = false;
      let timeLimitVal = "";
      if (item.timeLimit) {
        const tlOp = item.timeLimitOperator || "lte"; // default to ≤ if not set
        if (tlOp === "lte") { timeLimitOp = "<"; timeLimitUnderline = true; }
        else if (tlOp === "lt") { timeLimitOp = "<"; }
        else if (tlOp === "gte") { timeLimitOp = ">"; timeLimitUnderline = true; }
        else if (tlOp === "gt") { timeLimitOp = ">"; }
        else { timeLimitOp = "<"; timeLimitUnderline = true; } // fallback to ≤
        timeLimitVal = item.timeLimit;
      }
      const reqText = reqs.join(" / ");

      let cursorX = cellLeft;
      const showName = item.showTitleInPdf !== false;

      // 1) Item name — dynamically calculate available space based on requirements width
      if (showName) {
        // Measure how much width requirements + link need at font 9
        pdf.setFontSize(9);
        let reqsNeededW = 0;
        if (reqText || timeLimitVal) {
          reqsNeededW += pdf.getTextWidth("- ");
          if (reqText) reqsNeededW += pdf.getTextWidth(reqText);
          if (timeLimitVal) {
            if (reqText) reqsNeededW += pdf.getTextWidth(" ");
            reqsNeededW += pdf.getTextWidth((timeLimitOp || "<") + " " + timeLimitVal);
          }
        }
        if (item.videoUrl) reqsNeededW += pdf.getTextWidth(" - Link");
        pdf.setFontSize(10);
        // Name gets full cell width minus what requirements need (min 30% of cell)
        const nameMaxW = Math.max(cellMaxW - reqsNeededW - 2, cellMaxW * 0.3);
        const nameClipped = pdf.splitTextToSize(item.name, nameMaxW)[0] || item.name;
        pdf.text(nameClipped, cursorX, cellY + 3.8);
        cursorX += pdf.getTextWidth(nameClipped) + 1;
      }

      // 2) Requirements (after name)
      const hasReqs = reqText || timeLimitVal;
      if (hasReqs) {
        pdf.setFontSize(9);
        const remainingW = (cellLeft + cellMaxW) - cursorX - 1;
        if (remainingW > 5) {
          if (showName) {
            pdf.text("- ", cursorX, cellY + 3.8);
            cursorX += pdf.getTextWidth("- ");
          }
          // Regular reqs (sets, reps, duration, distance)
          if (reqText) {
            const reqClipped = pdf.splitTextToSize(reqText, (cellLeft + cellMaxW) - cursorX)[0] || "";
            if (reqClipped) {
              pdf.text(reqClipped, cursorX, cellY + 3.8);
              cursorX += pdf.getTextWidth(reqClipped);
            }
          }
          // Time limit with underlined operator symbol (no separator, just space)
          if (timeLimitVal) {
            if (reqText) {
              pdf.text(" ", cursorX, cellY + 3.8);
              cursorX += pdf.getTextWidth(" ");
            }
            if (timeLimitOp) {
              pdf.text(timeLimitOp, cursorX, cellY + 3.8);
              const opW = pdf.getTextWidth(timeLimitOp);
              if (timeLimitUnderline) {
                pdf.setDrawColor(0, 0, 0);
                pdf.setLineWidth(0.15);
                pdf.line(cursorX, cellY + 4.3, cursorX + opW, cellY + 4.3);
              }
              cursorX += opW + pdf.getTextWidth(" ");
            }
            pdf.text(timeLimitVal, cursorX, cellY + 3.8);
            cursorX += pdf.getTextWidth(timeLimitVal) + 1;
          } else {
            cursorX += 1;
          }
        }
      }

      // 3) Link (after all text, separated by " - ")
      if (item.videoUrl && cursorX + 12 < cellLeft + cellMaxW) {
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.text("- ", cursorX, cellY + 3.8);
        cursorX += pdf.getTextWidth("- ");
        pdf.setTextColor(0, 0, 200);
        pdf.text("Link", cursorX, cellY + 3.8);
        const linkW = pdf.getTextWidth("Link");
        pdf.setDrawColor(0, 0, 200);
        pdf.setLineWidth(0.1);
        pdf.line(cursorX, cellY + 4.2, cursorX + linkW, cellY + 4.2);
        pdf.link(cursorX, cellY + 0.8, linkW + 1, 4, { url: item.videoUrl });
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.setDrawColor(0, 0, 0);
      }
    }

    // === TABLE + NOTES SECTION (dynamic grid layout) ===
    const sectionHeaderH = rowH;
    const tableCats = tableCategories.slice(0, 9); // cap at 9 table sections
    const N = tableCats.length;

    if (N > 0) {
      // 1) Calculate grid layout (max 3 cols, as symmetric as possible)
      const numSectionRows = Math.ceil(N / 3);
      const layout: number[] = [];
      let rem = N;
      for (let r = 0; r < numSectionRows; r++) {
        const cols = Math.ceil(rem / (numSectionRows - r));
        layout.push(cols);
        rem -= cols;
      }

      // 2) Notes always rendered as rows at the bottom

      // 3) Build section row info: which categories go in each row
      type SectionRowInfo = {
        cats: typeof tableCats;
        numCols: number;
        maxItems: number;
        rowCount: number;  // computed fill row count
      };
      let catOffset = 0;
      const sectionRows: SectionRowInfo[] = [];
      for (let r = 0; r < layout.length; r++) {
        const numCols = layout[r];
        const cats = tableCats.slice(catOffset, catOffset + numCols);
        catOffset += numCols;
        const colW = cw / numCols;
        const maxItems = cats.length > 0 ? Math.max(...cats.map(c =>
          c.items.reduce((sum, item) => sum + getItemRowCount(item, colW), 0)
        )) : 0;
        sectionRows.push({ cats, numCols, maxItems, rowCount: maxItems });
      }

      // 4) Calculate available height and split extra space evenly between table and notes
      const notesRowsBase = 4;
      const notesHeaderH = rowH; // notes header row
      const totalMinTableRows = sectionRows.reduce((sum, sr) => sum + sr.maxItems, 0);
      const minTableH = totalMinTableRows * rowH + sectionRows.length * sectionHeaderH;
      const minNotesH = notesHeaderH + notesRowsBase * rowH;
      const totalAvail = disclaimerY - y - 1;
      const extraSpace = Math.max(0, totalAvail - minTableH - minNotesH);
      // Split extra space: half to table sections, half to notes
      const extraForTable = Math.floor(extraSpace / 2 / rowH);
      const extraForNotes = Math.floor(extraSpace / 2 / rowH);
      // Distribute table extra rows across section rows
      const extraPerRow = Math.floor(extraForTable / sectionRows.length);
      const extraRemainder = extraForTable % sectionRows.length;

      for (let r = 0; r < sectionRows.length; r++) {
        sectionRows[r].rowCount = Math.max(
          sectionRows[r].maxItems,
          sectionRows[r].maxItems + extraPerRow + (r < extraRemainder ? 1 : 0)
        );
        // Ensure at least 1 row per section row
        sectionRows[r].rowCount = Math.max(sectionRows[r].rowCount, 1);
      }
      const notesRows = notesRowsBase + extraForNotes;

      // 5) Render each section row (with multi-page support)
      for (let r = 0; r < sectionRows.length; r++) {
        const sr = sectionRows[r];
        const colWidth = cw / sr.numCols;
        const neededH = sectionHeaderH + sr.rowCount * rowH;

        // Multi-page: if this section row won't fit, start a new page
        if (y + neededH > disclaimerY && y > margin + 5) {
          y = newPage();
          // Recalculate row count to fill the new page
          const newAvail = disclaimerY - y - sectionHeaderH - 1;
          // Also account for remaining section rows and notes on this page
          const remainingSections = sectionRows.length - r - 1;
          const remainingHeadersH = remainingSections * sectionHeaderH;
          const remainingMinRows = sectionRows.slice(r + 1).reduce((sum, s) => sum + s.maxItems, 0);
          const notesOnThisPage = notesHeaderH + notesRows * rowH;
          const availForThisRow = newAvail - remainingHeadersH - remainingMinRows * rowH - notesOnThisPage;
          const fillRowsOnPage = Math.max(sr.maxItems, Math.floor(availForThisRow / rowH));
          sr.rowCount = Math.max(sr.maxItems, fillRowsOnPage);
        }

        // Column headers (rank color)
        for (let ci = 0; ci < sr.numCols; ci++) {
          const colX = margin + ci * colWidth;
          drawCell(colX, y, colWidth, sectionHeaderH, rgb);
          pdf.setFontSize(10);
          pdf.setFont("helvetica", "bold");
          setBeltTextColor();
          const label = sr.cats[ci]?.name || "";
          pdf.text(label, colX + colWidth / 2, y + 4.2, { align: "center" });
          pdf.setTextColor(0, 0, 0);
        }
        y += sectionHeaderH;

        // Data rows - render column by column for independent text wrapping
        const sectionStartY = y;
        const totalSectionH = sr.rowCount * rowH;

        for (let ci = 0; ci < sr.numCols; ci++) {
          const colX = margin + ci * colWidth;
          let colY = sectionStartY;
          let rowIndex = 0; // global visual row index for standard alternating tint

          {
            const items = sr.cats[ci]?.items || [];
            for (let ii = 0; ii < items.length; ii++) {
              const item = items[ii];
              const itemLines = getItemRowCount(item, colWidth);
              const itemH = itemLines * rowH;

              // Draw fill per visual row with standard alternating tint (no borders between wrapped lines)
              for (let li = 0; li < itemLines; li++) {
                const tint: [number, number, number] = (rowIndex + li) % 2 === 0 ? veryLightTint : [255, 255, 255];
                pdf.setFillColor(tint[0], tint[1], tint[2]);
                pdf.rect(colX, colY + li * rowH, colWidth, rowH, "F");
              }

              // Draw border around the whole item (borders disappear between connected lines)
              pdf.setDrawColor(0, 0, 0);
              pdf.setLineWidth(0.2);
              pdf.rect(colX, colY, colWidth, itemH, "S");

              if (itemLines === 1) {
                // Single line: use fancy renderItemCell (underlined operators, blue links)
                renderItemCell(item, colX, colWidth, colY);
              } else {
                // Multi-line: render as wrapped plain text with indent on continuation lines
                // Split base text (without link) so "- Link" never gets broken across lines
                const hasLink = !!item.videoUrl;
                const baseText = hasLink ? buildItemText({ ...item, videoUrl: null } as RankTestItem) : buildItemText(item);
                const indent = 8; // mm inset for wrapped continuation lines
                pdf.setFontSize(10);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(0, 0, 0);
                const cellMaxW = colWidth - 4;
                const firstLineW = cellMaxW;
                const contLineW = cellMaxW - indent;
                // Split base text only (no link suffix)
                const firstLines = pdf.splitTextToSize(baseText, firstLineW);
                const renderLines: string[] = [firstLines[0]];
                if (firstLines.length > 1) {
                  const remaining = firstLines.slice(1).join(" ");
                  const contLines = pdf.splitTextToSize(remaining, contLineW);
                  renderLines.push(...contLines);
                }
                // Append " - Link" to last line, or add as new line if it doesn't fit
                if (hasLink) {
                  const lastIdx = renderLines.length - 1;
                  const maxW = lastIdx === 0 ? firstLineW : contLineW;
                  const withLink = renderLines[lastIdx] + " - Link";
                  if (pdf.getTextWidth(withLink) <= maxW) {
                    renderLines[lastIdx] = withLink;
                  } else {
                    renderLines.push("- Link");
                  }
                }
                for (let li = 0; li < renderLines.length; li++) {
                  const xOff = li === 0 ? 2 : 2 + indent;
                  const lineText = renderLines[li];
                  // Check if this line contains "- Link" and render it as clickable
                  const linkIdx = hasLink ? lineText.lastIndexOf("- Link") : -1;
                  if (linkIdx >= 0 && item.videoUrl) {
                    // Render text before link
                    const before = lineText.substring(0, linkIdx);
                    if (before) {
                      pdf.setTextColor(0, 0, 0);
                      pdf.text(before, colX + xOff, colY + li * rowH + 3.8);
                    }
                    const beforeW = before ? pdf.getTextWidth(before) : 0;
                    // Render "- " in black
                    pdf.setTextColor(0, 0, 0);
                    pdf.text("- ", colX + xOff + beforeW, colY + li * rowH + 3.8);
                    const dashW = pdf.getTextWidth("- ");
                    // Render "Link" in blue with underline
                    const linkX = colX + xOff + beforeW + dashW;
                    const linkY = colY + li * rowH + 3.8;
                    pdf.setTextColor(0, 0, 200);
                    pdf.text("Link", linkX, linkY);
                    const linkW = pdf.getTextWidth("Link");
                    pdf.setDrawColor(0, 0, 200);
                    pdf.setLineWidth(0.1);
                    pdf.line(linkX, linkY + 0.4, linkX + linkW, linkY + 0.4);
                    pdf.link(linkX, linkY - 3, linkW + 1, 4, { url: item.videoUrl });
                    pdf.setTextColor(0, 0, 0);
                    pdf.setDrawColor(0, 0, 0);
                  } else {
                    pdf.text(lineText, colX + xOff, colY + li * rowH + 3.8);
                  }
                }
              }

              colY += itemH;
              rowIndex += itemLines;
            }
          }

          // Fill remaining empty space in this column with standard bordered cells
          while (colY < sectionStartY + totalSectionH) {
            const tint: [number, number, number] = rowIndex % 2 === 0 ? veryLightTint : [255, 255, 255];
            drawCell(colX, colY, colWidth, rowH, tint);
            colY += rowH;
            rowIndex++;
          }
        }

        y = sectionStartY + totalSectionH;
      }

      // 6) Notes always at the bottom (full width rows, no inner borders)
      {
        const notesNeeded = notesHeaderH + notesRows * rowH;
        if (y + notesNeeded > disclaimerY && y > margin + 5) {
          y = newPage();
        }

        // Notes header
        drawCell(margin, y, cw, rowH, rgb);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        setBeltTextColor();
        pdf.text("Notes", pw / 2, y + 3.8, { align: "center" });
        pdf.setTextColor(0, 0, 0);
        y += rowH;

        // Notes rows with inner borders and alternating tint
        const remainingForNotes = disclaimerY - y - 1;
        const actualNoteRows = Math.max(notesRows, Math.floor(remainingForNotes / rowH));
        for (let i = 0; i < actualNoteRows; i++) {
          if (y + rowH > disclaimerY) break;
          const noteTint: [number, number, number] = i % 2 === 0 ? veryLightTint : [255, 255, 255];
          drawCell(margin, y, cw, rowH, noteTint);
          y += rowH;
        }
      }
    } else {
      // No table categories - just notes section filling available space
      drawCell(margin, y, cw, rowH, rgb);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      setBeltTextColor();
      pdf.text("Notes", pw / 2, y + 3.8, { align: "center" });
      pdf.setTextColor(0, 0, 0);
      y += rowH;

      const remainingForNotes = disclaimerY - y - 1;
      const noteRows = Math.max(4, Math.floor(remainingForNotes / rowH));
      for (let i = 0; i < noteRows; i++) {
        if (y + rowH > disclaimerY) break;
        const noteTint: [number, number, number] = i % 2 === 0 ? veryLightTint : [255, 255, 255];
        drawCell(margin, y, cw, rowH, noteTint);
        y += rowH;
      }
    }

    // === FOOTER (on last page) ===
    drawFooter();

    return pdf.output("blob");
  }

  // Publish curriculum as PDFs to rank documents
  async function publishCurriculum() {
    if (!selectedStyleId || !selectedStyle) return;

    const ranksWithCurriculum = sortedRanks.filter(rank => {
      const tests = testsByRank[rank.id];
      return tests && tests.length > 0 && tests.some(t => t.categories.length > 0);
    });

    if (ranksWithCurriculum.length === 0) {
      alert("No curriculum content to publish. Add categories and items to at least one rank.");
      return;
    }

    setPublishing(true);
    try {
      // Fetch the full style data to get beltConfig
      const styleRes = await fetch(`/api/styles/${selectedStyleId}`);
      if (!styleRes.ok) throw new Error("Failed to fetch style");
      const styleData = await styleRes.json();
      const style = styleData.style;

      let beltConfig: { ranks: Array<{ id: string; name: string; order: number; layers?: { fabricColor?: string; [key: string]: unknown }; pdfDocuments?: Array<{ id: string; name: string; url: string }>; [key: string]: unknown }> } = { ranks: [] };
      if (style.beltConfig) {
        try {
          beltConfig = typeof style.beltConfig === "string" ? JSON.parse(style.beltConfig) : style.beltConfig;
        } catch { /* use default */ }
      }

      // Pre-load logo image if available
      let logoImg: HTMLImageElement | undefined;
      if (gymSettings.logo) {
        logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Failed to load logo"));
          img.src = gymSettings.logo;
        }).catch(() => undefined);
      }

      // First, remove ALL old curriculum docs from every rank in beltConfig
      for (const cfgRank of beltConfig.ranks || []) {
        if (cfgRank.pdfDocuments) {
          cfgRank.pdfDocuments = cfgRank.pdfDocuments.filter(d => !d.id.startsWith("curriculum-"));
        }
      }

      // Generate and upload PDFs for each rank with curriculum
      for (const rank of ranksWithCurriculum) {
        const tests = testsByRank[rank.id];
        // Get the belt color from the rank's layer config
        const configRank = beltConfig.ranks?.find(r => r.name === rank.name);
        const beltColor = (configRank?.layers as Record<string, unknown>)?.fabricColor as string || "#ffffff";
        const pdfBlob = generateCurriculumPdf(selectedStyle.name, rank.name, tests, beltColor, logoImg);

        // Upload PDF to server
        const formData = new FormData();
        const fileName = `${selectedStyle.name} - ${rank.name} Curriculum.pdf`;
        formData.append("files", pdfBlob, fileName);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          console.error(`Failed to upload PDF for ${rank.name}`);
          continue;
        }

        const uploadData = await uploadRes.json();
        if (!uploadData.files || uploadData.files.length === 0) continue;

        const pdfUrl = uploadData.files[0].url;
        const docName = `${rank.name} Curriculum`;

        // Add new curriculum PDF to this rank's docs
        if (configRank) {
          if (!configRank.pdfDocuments) configRank.pdfDocuments = [];
          configRank.pdfDocuments.push({
            id: `curriculum-${rank.id}`,
            name: docName,
            url: pdfUrl,
          });
        }
      }

      // Save updated beltConfig to style (triggers syncRankDocumentsToMembers)
      const patchRes = await fetch(`/api/styles/${selectedStyleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beltConfig: JSON.stringify(beltConfig) }),
      });

      if (!patchRes.ok) throw new Error("Failed to update style with curriculum PDFs");

      alert(`Curriculum published! ${ranksWithCurriculum.length} rank PDF${ranksWithCurriculum.length !== 1 ? "s" : ""} generated and synced to members.`);
    } catch (err) {
      console.error("Error publishing curriculum:", err);
      alert("Failed to publish curriculum. Check console for details.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Curriculum Builder</h1>
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Curriculum Builder</h1>
            <p className="text-sm text-gray-600">
              Build curriculum requirements for each rank. Changes apply everywhere instantly.
            </p>
          </div>
          {selectedStyleId && rankTests.length > 0 && (
            <button
              onClick={publishCurriculum}
              disabled={publishing}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {publishing ? "Publishing..." : "Save & Publish PDFs"}
            </button>
          )}
        </div>

        {/* Style Selection */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Style</label>
            <select
              value={selectedStyleId}
              onChange={(e) => {
                setSelectedStyleId(e.target.value);
                setEditingTestId(null);
                setExpandedRanks(new Set());
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            {sortedRanks.length > 0 && (
              <button
                onClick={() => {
                  setCategoryName("");
                  setCategoryDescription("");
                  setSelectedRankIds(new Set(sortedRanks.map(r => r.id)));
                  setShowBulkCategoryModal(true);
                }}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Add Category to Ranks
              </button>
            )}
            {uniqueCategoryNames.length > 0 && (
              <button
                onClick={() => {
                  setBulkItemCategoryName(uniqueCategoryNames[0]);
                  setItemName("");
                  setItemDescription("");
                  setItemType("skill");
                  setItemRequired(true);
                  setItemSets("");
                  setItemReps("");
                  setItemDuration("");
                  setItemDistance("");
                  setItemTimeLimit("");
                  setItemTimeLimitOperator("lte");
                  setSelectedRankIds(new Set(sortedRanks.map(r => r.id)));
                  setShowBulkItemModal(true);
                }}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Add Item to Categories
              </button>
            )}
            <button
              onClick={() => setSpreadsheetView(!spreadsheetView)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                spreadsheetView
                  ? "bg-primary text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              title={spreadsheetView ? "Bulk Edit mode enabled" : "Enable Bulk Edit mode"}
            >
              Bulk Edit
            </button>
            {uniqueCategoryNames.length > 0 && (
              <button
                onClick={() => {
                  setBulkRemoveCategoryName(uniqueCategoryNames[0]);
                  setSelectedRankIds(new Set(sortedRanks.map(r => r.id)));
                  setShowBulkRemoveCategoryModal(true);
                }}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Remove Category
              </button>
            )}
            {uniqueItemNames.length > 0 && (
              <button
                onClick={() => {
                  setBulkItemCategoryName(uniqueCategoryNames[0]);
                  setBulkRemoveItemName(uniqueItemNames[0]);
                  setSelectedRankIds(new Set(sortedRanks.map(r => r.id)));
                  setShowBulkRemoveItemModal(true);
                }}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Remove Item
              </button>
            )}
            <div className="ml-auto text-sm text-gray-500">
              {sortedRanks.length} ranks
            </div>
          </div>
        </div>

        {/* Rank Tests List */}
        <div className="space-y-3">
          {sortedRanks.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No ranks defined</h3>
              <p className="mt-2 text-sm text-gray-500">
                Add ranks to this style first before creating test curricula
              </p>
              <Link
                href="/styles"
                className="mt-4 inline-block rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
              >
                Manage Styles
              </Link>
            </div>
          ) : (
            sortedRanks.map((rank) => {
              const testsForRank = testsByRank[rank.id] || [];
              const isExpanded = expandedRanks.has(rank.id);
              const totalItems = testsForRank.reduce(
                (sum, t) => sum + t.categories.reduce((s, c) => s + c.items.length, 0),
                0
              );
              const totalCategories = testsForRank.reduce((sum, t) => sum + t.categories.length, 0);

              return (
                <div key={rank.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  {/* Rank Header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleRankExpanded(rank.id)}
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <h3 className="font-semibold text-lg">{rank.name}</h3>
                      {totalCategories > 0 ? (
                        <span className="text-sm text-gray-500">
                          {totalCategories} categor{totalCategories !== 1 ? "ies" : "y"} •{" "}
                          {totalItems} item{totalItems !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">No categories</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddCategoryForRank(rank.id, rank.name);
                      }}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Add Category
                    </button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-4 border-t">
                      {testsForRank.length === 0 || totalCategories === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                          <p className="text-sm">No categories yet. Click &quot;Add Category&quot; above to get started.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {testsForRank.map((test) => (
                            <div key={test.id}>
                              {test.categories.length > 0 && (
                                <DndContext
                                  sensors={sensors}
                                  collisionDetection={closestCenter}
                                  onDragEnd={(event) => handleCategoryDragEnd(event, test.id, test.categories)}
                                >
                                  <SortableContext
                                    items={test.categories.map((cat) => cat.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <div className="space-y-4">
                                      {test.categories.map((category) => (
                                        <SortableCategory
                                          key={category.id}
                                          category={category}
                                          openAddItem={() => openAddItem(test.id, category.id)}
                                          openEditCategory={() => openEditCategory(test.id, category)}
                                          handleDeleteCategory={() => handleDeleteCategory(test.id, category.id)}
                                        >
                                          {category.items.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center py-4">
                                              No items in this category yet
                                            </p>
                                          ) : spreadsheetView ? (
                                            /* Spreadsheet View - inline editable table */
                                            <div className="overflow-x-auto">
                                              <table className="min-w-full text-sm">
                                                <thead className="border-b border-gray-200 bg-gray-100">
                                                  <tr>
                                                    <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-gray-500 w-36">Type</th>
                                                    <th className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase text-gray-500">Name</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Sets</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Reps</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500 w-24">Duration</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500 w-24">Distance</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500 w-44">Time Limit</th>
                                                    <th className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-gray-500 w-16">Actions</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {category.items.map((item) => (
                                                    <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                                                      <td className="px-2 py-1.5">
                                                        <select
                                                          value={item.type}
                                                          onChange={(e) => {
                                                            updateItemFieldInline(test.id, item.id, "type", e.target.value);
                                                          }}
                                                          onBlur={(e) => handleInlineBlur(test.id, item.id, "type", e.target.value)}
                                                          className="w-full min-w-fit rounded border border-gray-300 px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                                                        >
                                                          {ITEM_TYPES.map((t) => (
                                                            <option key={t.value} value={t.value}>{t.label}</option>
                                                          ))}
                                                        </select>
                                                      </td>
                                                      <td className="px-2 py-1.5">
                                                        <input
                                                          type="text"
                                                          value={item.name || ""}
                                                          onChange={(e) => updateItemFieldInline(test.id, item.id, "name", e.target.value)}
                                                          onBlur={(e) => handleInlineBlur(test.id, item.id, "name", e.target.value)}
                                                          onKeyDown={(e) => handleInlineKeyDown(e, test.id, item.id, "name", e.currentTarget.value)}
                                                          className="w-full rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                                          placeholder="Item name"
                                                        />
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        <input
                                                          type="number"
                                                          min={0}
                                                          value={item.sets ?? ""}
                                                          onChange={(e) => updateItemFieldInline(test.id, item.id, "sets", e.target.value === "" ? null : Number(e.target.value))}
                                                          onBlur={(e) => handleInlineBlur(test.id, item.id, "sets", e.target.value)}
                                                          onKeyDown={(e) => handleInlineKeyDown(e, test.id, item.id, "sets", e.currentTarget.value)}
                                                          className="no-spinner w-12 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                                          placeholder="#"
                                                        />
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        <input
                                                          type="number"
                                                          min={0}
                                                          value={item.reps ?? ""}
                                                          onChange={(e) => updateItemFieldInline(test.id, item.id, "reps", e.target.value === "" ? null : Number(e.target.value))}
                                                          onBlur={(e) => handleInlineBlur(test.id, item.id, "reps", e.target.value)}
                                                          onKeyDown={(e) => handleInlineKeyDown(e, test.id, item.id, "reps", e.currentTarget.value)}
                                                          className="no-spinner w-12 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                                          placeholder="#"
                                                        />
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        <input
                                                          type="text"
                                                          value={item.duration || ""}
                                                          onChange={(e) => updateItemFieldInline(test.id, item.id, "duration", e.target.value)}
                                                          onBlur={(e) => handleInlineBlur(test.id, item.id, "duration", e.target.value)}
                                                          onKeyDown={(e) => handleInlineKeyDown(e, test.id, item.id, "duration", e.currentTarget.value)}
                                                          className="w-20 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                                          placeholder="e.g. 2 min"
                                                        />
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        <input
                                                          type="text"
                                                          value={item.distance || ""}
                                                          onChange={(e) => updateItemFieldInline(test.id, item.id, "distance", e.target.value)}
                                                          onBlur={(e) => handleInlineBlur(test.id, item.id, "distance", e.target.value)}
                                                          onKeyDown={(e) => handleInlineKeyDown(e, test.id, item.id, "distance", e.currentTarget.value)}
                                                          className="w-20 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                                          placeholder="e.g. 1 mile"
                                                        />
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        <div className="flex items-center gap-1">
                                                          <select
                                                            value={item.timeLimitOperator || "lte"}
                                                            onChange={(e) => {
                                                              updateItemFieldInline(test.id, item.id, "timeLimitOperator", e.target.value);
                                                              handleInlineBlur(test.id, item.id, "timeLimitOperator", e.target.value);
                                                            }}
                                                            className="w-10 rounded border border-gray-300 px-0.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                                                          >
                                                            <option value="lte">≤</option>
                                                            <option value="lt">&lt;</option>
                                                            <option value="eq">=</option>
                                                            <option value="gte">≥</option>
                                                            <option value="gt">&gt;</option>
                                                          </select>
                                                          <input
                                                            type="text"
                                                            value={item.timeLimit || ""}
                                                            onChange={(e) => updateItemFieldInline(test.id, item.id, "timeLimit", e.target.value)}
                                                            onBlur={(e) => handleInlineBlur(test.id, item.id, "timeLimit", e.target.value)}
                                                            onKeyDown={(e) => handleInlineKeyDown(e, test.id, item.id, "timeLimit", e.currentTarget.value)}
                                                            className="w-20 rounded border border-gray-300 px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                                            placeholder="e.g. 1:30"
                                                          />
                                                        </div>
                                                      </td>
                                                      <td className="px-2 py-1.5 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                          <button
                                                            onClick={() => openEditItem(test.id, item, category.id)}
                                                            className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                                            title="Edit full details"
                                                          >
                                                            Edit
                                                          </button>
                                                          <button
                                                            onClick={() => handleDeleteItem(test.id, item.id)}
                                                            className="text-primary hover:text-primaryDark text-xs"
                                                          >
                                                            ✕
                                                          </button>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          ) : (
                                            /* Card View - original draggable items */
                                            <DndContext
                                              sensors={sensors}
                                              collisionDetection={closestCenter}
                                              onDragEnd={(event) => handleDragEnd(event, test.id, category.id, category.items)}
                                            >
                                              <SortableContext
                                                items={category.items.map((item) => item.id)}
                                                strategy={verticalListSortingStrategy}
                                              >
                                                <div className="space-y-2">
                                                  {category.items.map((item) => (
                                                    <SortableItem
                                                      key={item.id}
                                                      item={item}
                                                      categoryId={category.id}
                                                      getTypeColor={getTypeColor}
                                                      getTypeLabel={getTypeLabel}
                                                      openEditItem={(item, catId) => openEditItem(test.id, item, catId)}
                                                      handleDeleteItem={(itemId) => handleDeleteItem(test.id, itemId)}
                                                    />
                                                  ))}
                                                </div>
                                              </SortableContext>
                                            </DndContext>
                                          )}
                                        </SortableCategory>
                                      ))}
                                    </div>
                                  </SortableContext>
                                </DndContext>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Create Test Modal */}
        {showTestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-bold mb-4">Create Curriculum</h2>
              <p className="text-sm text-gray-500 mb-4">
                For: {sortedRanks.find(r => r.id === testRankId)?.name} • {selectedStyle?.name}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Test Name *
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="e.g., Yellow Belt Test Requirements"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-[10px] text-gray-400">(Ctrl+B for bold)</span>
                  </label>
                  <RichTextInput
                    value={testDescription}
                    onChange={setTestDescription}
                    placeholder="Optional description..."
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleCreateTest}
                  disabled={!testName || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Test"}
                </button>
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestName("");
                    setTestDescription("");
                    setTestRankId("");
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Category to Ranks Modal */}
        {showBulkCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">Add Category to Ranks</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g., Forms, Techniques, Fitness"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-[10px] text-gray-400">(Ctrl+B for bold)</span>
                  </label>
                  <RichTextInput
                    value={categoryDescription}
                    onChange={setCategoryDescription}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Select Ranks
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set(sortedRanks.map(r => r.id)))}
                        className="text-xs text-primary hover:text-primaryDark"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {sortedRanks.map((rank) => (
                      <label key={rank.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedRankIds.has(rank.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedRankIds);
                            if (e.target.checked) {
                              newSet.add(rank.id);
                            } else {
                              newSet.delete(rank.id);
                            }
                            setSelectedRankIds(newSet);
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{rank.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleAddCategoryToSelectedRanks}
                  disabled={!categoryName || selectedRankIds.size === 0 || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Adding..." : `Add to ${selectedRankIds.size} Rank${selectedRankIds.size !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => {
                    setShowBulkCategoryModal(false);
                    setCategoryName("");
                    setCategoryDescription("");
                    setSelectedRankIds(new Set());
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Item to Categories Modal */}
        {showBulkItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">Add Item to Categories</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Category *
                  </label>
                  <select
                    value={bulkItemCategoryName}
                    onChange={(e) => setBulkItemCategoryName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {uniqueCategoryNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g., Front Kick, Push-ups"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {ITEM_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={itemRequired}
                        onChange={(e) => setItemRequired(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium text-gray-700">Required</span>
                    </label>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description / Info <span className="text-[10px] text-gray-400">(Ctrl+B for bold)</span>
                    </label>
                    <RichTextInput
                      value={itemDescription}
                      onChange={setItemDescription}
                      placeholder="Additional details or instructions..."
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {(itemType === "workout" || itemType === "sparring" || itemType === "breaking" || itemType === "other") && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sets/Rounds
                        </label>
                        <input
                          type="number"
                          value={itemSets}
                          onChange={(e) => setItemSets(e.target.value)}
                          placeholder="e.g., 3"
                          min="0"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reps
                        </label>
                        <input
                          type="number"
                          value={itemReps}
                          onChange={(e) => setItemReps(e.target.value)}
                          placeholder="e.g., 10"
                          min="0"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Duration
                        </label>
                        <input
                          type="text"
                          value={itemDuration}
                          onChange={(e) => setItemDuration(e.target.value)}
                          placeholder="e.g., 30 seconds"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Distance
                        </label>
                        <input
                          type="text"
                          value={itemDistance}
                          onChange={(e) => setItemDistance(e.target.value)}
                          placeholder="e.g., 1 mile"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Time Limit
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={itemTimeLimitOperator}
                            onChange={(e) => setItemTimeLimitOperator(e.target.value)}
                            className="rounded-md border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="lte">≤</option>
                            <option value="lt">&lt;</option>
                            <option value="eq">=</option>
                            <option value="gte">≥</option>
                            <option value="gt">&gt;</option>
                          </select>
                          <input
                            type="text"
                            value={itemTimeLimit}
                            onChange={(e) => setItemTimeLimit(e.target.value)}
                            placeholder="e.g., 8 minutes"
                            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Video URL
                    </label>
                    <input
                      type="url"
                      value={itemVideoUrl}
                      onChange={(e) => setItemVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/..."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Select Ranks
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set(sortedRanks.map(r => r.id)))}
                        className="text-xs text-primary hover:text-primaryDark"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {sortedRanks.map((rank) => (
                      <label key={rank.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedRankIds.has(rank.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedRankIds);
                            if (e.target.checked) {
                              newSet.add(rank.id);
                            } else {
                              newSet.delete(rank.id);
                            }
                            setSelectedRankIds(newSet);
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{rank.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleAddItemToSelectedCategories}
                  disabled={!bulkItemCategoryName || selectedRankIds.size === 0 || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Adding..." : `Add to ${selectedRankIds.size} Rank${selectedRankIds.size !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => {
                    setShowBulkItemModal(false);
                    setBulkItemCategoryName("");
                    setItemName("");
                    setItemDescription("");
                    setItemType("skill");
                    setItemRequired(true);
                    setItemSets("");
                    setItemReps("");
                    setItemDuration("");
                    setItemDistance("");
                    setItemTimeLimit("");
                    setItemTimeLimitOperator("lte");
                    setSelectedRankIds(new Set());
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create/Edit Category Modal */}
        {showCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
              <h2 className="text-lg font-bold mb-4">
                {editingCategoryId ? "Edit Category" : "Add Category"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="e.g., Forms, Techniques, Fitness"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-[10px] text-gray-400">(Ctrl+B for bold)</span>
                  </label>
                  <RichTextInput
                    value={categoryDescription}
                    onChange={setCategoryDescription}
                    placeholder="Optional description..."
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={editingCategoryId ? handleUpdateCategory : handleCreateCategory}
                  disabled={!categoryName || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingCategoryId ? "Save" : "Add Category"}
                </button>
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setCategoryName("");
                    setCategoryDescription("");
                    setEditingCategoryId(null);
                    setEditingCategoryTestId(null);
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create/Edit Item Modal */}
        {showItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">
                {editingItemId ? "Edit Item" : "Add Item"}
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item Name
                    </label>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="e.g., Front Kick, Push-ups, Form 1"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={itemType}
                      onChange={(e) => setItemType(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {ITEM_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={itemRequired}
                        onChange={(e) => setItemRequired(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium text-gray-700">Required</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={itemShowTitleInPdf}
                        onChange={(e) => setItemShowTitleInPdf(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium text-gray-700">Show title in PDF</span>
                    </label>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description / Info <span className="text-[10px] text-gray-400">(Ctrl+B for bold - shown on grading sheet)</span>
                    </label>
                    <RichTextInput
                      value={itemDescription}
                      onChange={setItemDescription}
                      placeholder="Additional details or instructions..."
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {(itemType === "workout" || itemType === "sparring" || itemType === "breaking" || itemType === "other") && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sets/Rounds
                        </label>
                        <input
                          type="number"
                          value={itemSets}
                          onChange={(e) => setItemSets(e.target.value)}
                          placeholder="e.g., 3"
                          min="0"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Reps
                        </label>
                        <input
                          type="number"
                          value={itemReps}
                          onChange={(e) => setItemReps(e.target.value)}
                          placeholder="e.g., 10"
                          min="0"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Duration
                        </label>
                        <input
                          type="text"
                          value={itemDuration}
                          onChange={(e) => setItemDuration(e.target.value)}
                          placeholder="e.g., 30 seconds, 2 minutes"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Distance
                        </label>
                        <input
                          type="text"
                          value={itemDistance}
                          onChange={(e) => setItemDistance(e.target.value)}
                          placeholder="e.g., 1 mile, 100 meters"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Time Limit
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={itemTimeLimitOperator}
                            onChange={(e) => setItemTimeLimitOperator(e.target.value)}
                            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="lte">≤ (at most)</option>
                            <option value="lt">&lt; (less than)</option>
                            <option value="eq">= (exactly)</option>
                            <option value="gte">≥ (at least)</option>
                            <option value="gt">&gt; (more than)</option>
                          </select>
                          <input
                            type="text"
                            value={itemTimeLimit}
                            onChange={(e) => setItemTimeLimit(e.target.value)}
                            placeholder="e.g., 8 minutes, 30 seconds"
                            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Set a time requirement (e.g., complete in 8 minutes or less)
                        </p>
                      </div>
                    </>
                  )}

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Video URL
                    </label>
                    <input
                      type="url"
                      value={itemVideoUrl}
                      onChange={(e) => setItemVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/..."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={editingItemId ? handleUpdateItem : handleCreateItem}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingItemId ? "Save" : "Add Item"}
                </button>
                <button
                  onClick={closeItemModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Category from Ranks Modal */}
        {showBulkRemoveCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4 text-primary">Remove Category from Ranks</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category to Remove *
                  </label>
                  <select
                    value={bulkRemoveCategoryName}
                    onChange={(e) => setBulkRemoveCategoryName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {uniqueCategoryNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Remove from Ranks
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set(sortedRanks.map(r => r.id)))}
                        className="text-xs text-primary hover:text-primaryDark"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {sortedRanks.map((rank) => (
                      <label key={rank.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedRankIds.has(rank.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedRankIds);
                            if (e.target.checked) {
                              newSet.add(rank.id);
                            } else {
                              newSet.delete(rank.id);
                            }
                            setSelectedRankIds(newSet);
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{rank.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-primary/10 border border-primary/30 rounded-md p-3">
                  <p className="text-sm text-primary">
                    This will permanently delete the category and all its items from the selected ranks.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleBulkRemoveCategory}
                  disabled={!bulkRemoveCategoryName || selectedRankIds.size === 0 || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Removing..." : `Remove from ${selectedRankIds.size} Rank${selectedRankIds.size !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => {
                    setShowBulkRemoveCategoryModal(false);
                    setBulkRemoveCategoryName("");
                    setSelectedRankIds(new Set());
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Item from Categories Modal */}
        {showBulkRemoveItemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4 text-primary">Remove Item from Categories</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Category *
                  </label>
                  <select
                    value={bulkItemCategoryName}
                    onChange={(e) => setBulkItemCategoryName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {uniqueCategoryNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item to Remove *
                  </label>
                  <select
                    value={bulkRemoveItemName}
                    onChange={(e) => setBulkRemoveItemName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {uniqueItemNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Remove from Ranks
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set(sortedRanks.map(r => r.id)))}
                        className="text-xs text-primary hover:text-primaryDark"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRankIds(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {sortedRanks.map((rank) => (
                      <label key={rank.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedRankIds.has(rank.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedRankIds);
                            if (e.target.checked) {
                              newSet.add(rank.id);
                            } else {
                              newSet.delete(rank.id);
                            }
                            setSelectedRankIds(newSet);
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{rank.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-primary/10 border border-primary/30 rounded-md p-3">
                  <p className="text-sm text-primary">
                    This will permanently delete the item from the selected category in the selected ranks.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleBulkRemoveItem}
                  disabled={!bulkItemCategoryName || !bulkRemoveItemName || selectedRankIds.size === 0 || saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {saving ? "Removing..." : `Remove from ${selectedRankIds.size} Rank${selectedRankIds.size !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => {
                    setShowBulkRemoveItemModal(false);
                    setBulkRemoveItemName("");
                    setBulkItemCategoryName("");
                    setSelectedRankIds(new Set());
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Styled-JSX: remove number spinners from number fields */}
      <style jsx>{`
        input[type="number"].no-spinner::-webkit-outer-spin-button,
        input[type="number"].no-spinner::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"].no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>
    </AppLayout>
  );
}
