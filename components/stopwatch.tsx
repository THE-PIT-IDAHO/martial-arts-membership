"use client";

import { useEffect, useRef, useState } from "react";

// Format `totalSeconds` as "M:SS" or "H:MM:SS" (drops the hours block
// if the run stayed under an hour, which is the normal case). Kept
// self-contained here so callers don't need to import a helper too.
function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Compact stopwatch button that lives next to a text field.
 *
 * Behavior:
 *   - Click ▶ to start. The button flips to ⏸ (pause) and shows the
 *     running elapsed time.
 *   - Click ⏸ to stop. onStop is fired with the elapsed value
 *     formatted as "M:SS"; caller writes it into whatever input it's
 *     bound to (a curriculum "duration" or a grading "time" field).
 *   - Click ↺ to reset without writing anything.
 *
 * Fully client-side. No server, no state persistence -- if the page
 * unmounts mid-run the reading is lost, which is the desired
 * behavior for a coach-facing scratch tool.
 */
export function Stopwatch({
  onStop,
  className,
}: {
  onStop: (formatted: string, elapsedSeconds: number) => void;
  className?: string;
}) {
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef<number>(0); // accumulated ms across previous runs

  // Tick loop. Refreshes elapsed once per second so the label
  // updates but we don't burn CPU at 60fps.
  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const id = window.setInterval(() => {
      if (startRef.current == null) return;
      setElapsedMs(baseRef.current + (Date.now() - startRef.current));
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsedSec = Math.floor(elapsedMs / 1000);

  function toggle() {
    if (running) {
      // Stop: accumulate + write out
      if (startRef.current != null) {
        baseRef.current = baseRef.current + (Date.now() - startRef.current);
        startRef.current = null;
      }
      setRunning(false);
      const total = Math.floor(baseRef.current / 1000);
      onStop(fmt(total), total);
    } else {
      setRunning(true);
    }
  }

  function reset() {
    baseRef.current = 0;
    startRef.current = null;
    setElapsedMs(0);
    setRunning(false);
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className || ""}`}>
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-white ${
          running ? "bg-primary" : "bg-gray-500 hover:bg-gray-600"
        }`}
        title={running ? "Stop timer and fill the field" : "Start timer"}
      >
        {running ? (
          <>
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
            <span className="tabular-nums">{fmt(elapsedSec)}</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {elapsedMs > 0 ? <span className="tabular-nums">{fmt(elapsedSec)}</span> : <span>Start</span>}
          </>
        )}
      </button>
      {elapsedMs > 0 && !running && (
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
          title="Clear the timer"
        >
          ↺
        </button>
      )}
    </div>
  );
}
