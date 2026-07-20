"use client";

// Dashboard "Finish setting up your gym" card.
//
// The API returns each task's `done` state so the card is always in
// sync with real data (add a Location -> Location task ticks off next
// render). Users can also skip individual tasks or hide the whole
// card. Once everything is done AND the card wasn't manually hidden,
// it disappears on its own -- one less bit of chrome for established
// gyms.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
  dismissed?: boolean;
  manual?: boolean;
};

type SetupStatus = {
  tasks: Task[];
  hidden: boolean;
  visible: boolean;
  completedCount: number;
  totalCount: number;
};

export function SetupChecklist() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/setup/status");
      if (!res.ok) return;
      const data = (await res.json()) as SetupStatus;
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!status || !status.visible) return null;
  if (status.hidden) return null;
  // Everything done -- retire the card automatically.
  if (status.completedCount >= status.totalCount) return null;

  const pct = Math.round((status.completedCount / status.totalCount) * 100);

  async function toggleTask(taskId: string, currentlyDone: boolean) {
    setBusyTask(taskId);
    try {
      await fetch("/api/setup/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "task", taskId, undo: currentlyDone }),
      });
      await load();
    } finally {
      setBusyTask(null);
    }
  }

  async function hideAll() {
    await fetch("/api/setup/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "all" }),
    });
    await load();
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-gray-400 text-xs">{collapsed ? "▶" : "▼"}</span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Finish setting up your gym</h2>
            <p className="text-xs text-gray-500">
              {status.completedCount} of {status.totalCount} done
            </p>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block w-40">
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={hideAll}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="Hide this card"
          >
            Hide
          </button>
        </div>
      </header>

      {!collapsed && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {status.tasks.map((task) => {
            const isBusy = busyTask === task.id;
            return (
              <li
                key={task.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${task.done ? "opacity-60" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => toggleTask(task.id, task.done)}
                  disabled={isBusy}
                  aria-label={task.done ? "Mark as not done" : "Mark as done"}
                  className={`flex-shrink-0 h-4 w-4 rounded border ${
                    task.done
                      ? "bg-primary border-primary text-white"
                      : "border-gray-300 bg-white hover:border-primary"
                  } flex items-center justify-center`}
                >
                  {task.done && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${task.done ? "line-through text-gray-500" : "text-gray-900"}`}>
                    {task.title}
                    {task.dismissed && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">skipped</span>
                    )}
                  </div>
                  {!task.done && (
                    <div className="text-xs text-gray-500 mt-0.5">{task.hint}</div>
                  )}
                </div>
                {!task.done && (
                  <Link
                    href={task.href}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark whitespace-nowrap"
                  >
                    Go
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
