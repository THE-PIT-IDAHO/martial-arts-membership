"use client";

import { useState } from "react";

/**
 * On-screen keyboard for kiosk inputs. Ships two layouts:
 *   numeric -- 3-column 0-9 + backspace, for PIN entry
 *   qwerty  -- 3 letter rows + space/shift/backspace, for name search
 *
 * Exists because a Bluetooth barcode scanner paired to the tablet
 * makes Android (and iOS) treat "hardware keyboard is present" as
 * system-wide truth and hide the on-screen keyboard for every input
 * until the scanner disconnects. Rendering our own on-page keyboard
 * bypasses that entirely -- the buttons are just DOM taps that dispatch
 * text into the same onChange the input would receive.
 *
 * Value flow: parent owns the input string; onKey / onBackspace tell
 * the parent what to update, so this component is stateless w.r.t. the
 * text. QWERTY has a local Shift state only.
 */
export function OnScreenKeyboard({
  mode,
  onKey,
  onBackspace,
  onEnter,
  className = "",
}: {
  mode: "numeric" | "qwerty";
  onKey: (char: string) => void;
  onBackspace: () => void;
  onEnter?: () => void;
  className?: string;
}) {
  const [shift, setShift] = useState(false);

  if (mode === "numeric") {
    return (
      <div className={`grid grid-cols-3 gap-2 ${className}`}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].map((key, i) => {
          if (key === null) return <div key={i} />;
          return (
            <button
              key={i}
              type="button"
              onClick={() => (key === "del" ? onBackspace() : onKey(String(key)))}
              className="py-4 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 text-xl font-semibold text-gray-800 transition-transform"
            >
              {key === "del" ? "⌫" : key}
            </button>
          );
        })}
      </div>
    );
  }

  // QWERTY. Three letter rows + a bottom control row. Space is wide.
  const row1 = "qwertyuiop".split("");
  const row2 = "asdfghjkl".split("");
  const row3 = "zxcvbnm".split("");
  const asLetter = (c: string) => (shift ? c.toUpperCase() : c);
  const letterBtn = "rounded-lg bg-gray-100 hover:bg-gray-200 active:scale-95 py-3 text-lg font-medium text-gray-800 transition-transform";
  const controlBtn = "rounded-lg bg-gray-200 hover:bg-gray-300 active:scale-95 py-3 text-sm font-semibold text-gray-700 transition-transform";

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="grid grid-cols-10 gap-1">
        {row1.map((c) => (
          <button key={c} type="button" onClick={() => onKey(asLetter(c))} className={letterBtn}>{asLetter(c)}</button>
        ))}
      </div>
      <div className="grid grid-cols-9 gap-1 px-4">
        {row2.map((c) => (
          <button key={c} type="button" onClick={() => onKey(asLetter(c))} className={letterBtn}>{asLetter(c)}</button>
        ))}
      </div>
      <div className="grid grid-cols-9 gap-1">
        <button type="button" onClick={() => setShift((s) => !s)} className={`${controlBtn} col-span-1 ${shift ? "bg-primary/20 text-primary" : ""}`} aria-pressed={shift}>⇧</button>
        {row3.map((c) => (
          <button key={c} type="button" onClick={() => onKey(asLetter(c))} className={letterBtn}>{asLetter(c)}</button>
        ))}
        <button type="button" onClick={onBackspace} className={`${controlBtn} col-span-1`}>⌫</button>
      </div>
      <div className="grid grid-cols-6 gap-1">
        <button type="button" onClick={() => onKey(" ")} className={`${letterBtn} col-span-4`}>space</button>
        <button type="button" onClick={() => onKey("-")} className={letterBtn}>-</button>
        {onEnter ? (
          <button type="button" onClick={onEnter} className={`${controlBtn} bg-primary text-white hover:bg-primaryDark`}>enter</button>
        ) : (
          <button type="button" onClick={() => onKey("'")} className={letterBtn}>&apos;</button>
        )}
      </div>
    </div>
  );
}
