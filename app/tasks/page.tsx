"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  recurrence: string | null;
  assignedRole: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "COMPLETED">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [assignedRole, setAssignedRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const res = await fetch("/api/tasks");
      const data = await res.json();

      if (!data.tasks || data.tasks.length === 0) {
        // Seed defaults on first visit
        await fetch("/api/tasks/seed", { method: "POST" });
        const res2 = await fetch("/api/tasks");
        const data2 = await res2.json();
        setTasks(data2.tasks || []);
      } else {
        setTasks(data.tasks);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setDueDate("");
    setRecurrence("");
    setAssignedRole("");
    setShowModal(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setPriority(task.priority);
    setDueDate(task.dueDate ? task.dueDate.split("T")[0] : "");
    setRecurrence(task.recurrence || "");
    setAssignedRole(task.assignedRole || "");
    setShowModal(true);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (editingTask) {
        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            priority,
            dueDate: dueDate || null,
            recurrence: recurrence || null,
            assignedRole: assignedRole || null,
          }),
        });
        const data = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? data.task : t)));
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            priority,
            dueDate: dueDate || null,
            recurrence: recurrence || null,
            assignedRole: assignedRole || null,
          }),
        });
        const data = await res.json();
        setTasks((prev) => [...prev, data.task]);
      }
      setShowModal(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(task: Task) {
    const newStatus = task.status === "OPEN" ? "COMPLETED" : "OPEN";
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // Reload all tasks so new recurring tasks appear
      const res2 = await fetch("/api/tasks");
      const data2 = await res2.json();
      setTasks(data2.tasks || []);
    } catch {
      // ignore
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      // ignore
    }
  }

  function isOverdue(task: Task) {
    if (task.status === "COMPLETED" || !task.dueDate) return false;
    return new Date(task.dueDate) < new Date(new Date().toDateString());
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const priorityBadge = (p: string) => {
    switch (p) {
      case "HIGH":
        return "bg-red-100 text-red-700";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-700";
      case "LOW":
        return "bg-gray-100 text-gray-600";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  // Filter and sort tasks
  const filtered = tasks
    .filter((t) => statusFilter === "ALL" || t.status === statusFilter)
    .filter((t) => priorityFilter === "ALL" || t.priority === priorityFilter)
    .sort((a, b) => {
      // Open before completed
      if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
      // High > Medium > Low
      const pOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
      // Earlier due date first
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const openCount = tasks.filter((t) => t.status === "OPEN").length;
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="mt-1 text-sm text-gray-600">
              Track follow-ups, phone calls, billing issues, and admin work
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
          >
            Add Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "OPEN", "COMPLETED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "bg-primary text-white hover:bg-primaryDark"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {s === "ALL" ? `All (${tasks.length})` : s === "OPEN" ? `Open (${openCount})` : `Completed (${completedCount})`}
            </button>
          ))}
          <span className="mx-1 text-gray-300">|</span>
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                priorityFilter === p
                  ? "bg-primary text-white hover:bg-primaryDark"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {p === "ALL" ? "All Priorities" : p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Task List */}
        <div className="rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <div className="p-6 text-center text-sm text-gray-500">Loading tasks...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              {tasks.length === 0 ? "No tasks yet. Click Add Task to get started." : "No tasks match the current filters."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                    task.status === "COMPLETED" ? "opacity-60" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleStatus(task)}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      task.status === "COMPLETED"
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-gray-300 hover:border-primary"
                    }`}
                  >
                    {task.status === "COMPLETED" && (
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          task.status === "COMPLETED" ? "line-through text-gray-400" : "text-gray-900"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>
                      {task.recurrence && (
                        <span className="inline-block rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-semibold">
                          {task.recurrence === "DAILY" ? "Daily" : task.recurrence === "WEEKLY" ? "Weekly" : "Monthly"}
                        </span>
                      )}
                      {task.assignedRole && (
                        <span className="inline-block rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-semibold">
                          {task.assignedRole === "FRONT_DESK" ? "Front Desk" : task.assignedRole.charAt(0) + task.assignedRole.slice(1).toLowerCase()}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className={`mt-0.5 text-xs ${task.status === "COMPLETED" ? "text-gray-300" : "text-gray-500"}`}>
                        {task.description}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-3 text-[11px]">
                      {task.dueDate && (
                        <span className={isOverdue(task) ? "font-semibold text-red-600" : "text-gray-400"}>
                          {isOverdue(task) ? "Overdue: " : "Due: "}
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                      {task.completedAt && (
                        <span className="text-green-600">
                          Completed {formatDate(task.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEditModal(task)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(task)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold mb-4">
              {editingTask ? "Edit Task" : "New Task"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Follow up with trial members"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details..."
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">None</option>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Role</label>
                  <select
                    value={assignedRole}
                    onChange={(e) => setAssignedRole(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Everyone</option>
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="COACH">Coach</option>
                    <option value="FRONT_DESK">Front Desk</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {saving ? "Saving..." : editingTask ? "Save" : "Create Task"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
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
