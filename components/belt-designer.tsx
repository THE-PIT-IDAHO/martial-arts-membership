"use client";

import { useEffect, useMemo, useState } from "react";

export type BeltConfig = {
  beltColor: string;
  includeLinear: boolean;
  linearColor: string;
  includePatch: boolean;
  patchColor: string;
  stripeCount: number;
  stripeColor: string;
  includeCamo: boolean;
  camoOpacity: number;
  camoBlend: "normal" | "multiply";
  width: number;
  height: number;
};

export const defaultBeltConfig: BeltConfig = {
  beltColor: "#b91c1c",
  includeLinear: false,
  linearColor: "#ffffff",
  includePatch: false,
  patchColor: "#000000",
  stripeCount: 0,
  stripeColor: "#ffffff",
  includeCamo: false,
  camoOpacity: 1,
  camoBlend: "normal",
  width: 800,
  height: 260,
};

type BeltDesignerProps = {
  value: BeltConfig;
  onChange: (config: BeltConfig) => void;
};

/**
 * BeltDesigner
 *
 * Lives inside Style creation / editing.
 * - Top: preview box (all belt PNGs layered through /api/belt-tint)
 * - Bottom: "belt layers" controls (fabric color, stripes, patch, camo, etc.)
 */
export function BeltDesigner({ value, onChange }: BeltDesignerProps) {
  const [local, setLocal] = useState<BeltConfig>(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function update<K extends keyof BeltConfig>(key: K, val: BeltConfig[K]) {
    const next = { ...local, [key]: val };
    setLocal(next);
    onChange(next);
  }

  // All PNGs live in /public/belts, and each acts as a layer in the preview.
  const src = "/belts/outline.png";
  const fabricMask = "/belts/fabric.png";
  const camo = "/belts/camo.png";
  const linearMask = "/belts/linear.png";
  const patchMask = "/belts/patch.png";

  const url = useMemo(() => {
    if (typeof window === "undefined") return "";

    const u = new URL("/api/belt-tint", window.location.origin);

    // Base outline + fabric color
    u.searchParams.set("src", src);
    u.searchParams.set("maskImg", fabricMask);
    u.searchParams.set("color", local.beltColor);

    // Linear stripe layer
    if (local.includeLinear) {
      u.searchParams.set("linearMask", linearMask);
      u.searchParams.set("linearColor", local.linearColor);
    }

    // Patch layer
    if (local.includePatch) {
      u.searchParams.set("patchMask", patchMask);
      u.searchParams.set("patchColor", local.patchColor);
    }

    // Stripe layers (stripe1–stripe10)
    const n = Math.max(0, Math.min(10, local.stripeCount));
    for (let i = 1; i <= n; i++) {
      u.searchParams.set(`s${i}Mask`, `/belts/stripe${i}.png`);
      u.searchParams.set(`s${i}Color`, local.stripeColor);
    }

    // Camo / pattern overlay
    if (local.includeCamo) {
      u.searchParams.set("overlay", camo);
      u.searchParams.set("overlayOpacity", String(local.camoOpacity));
      u.searchParams.set("overlayBlend", local.camoBlend);
    }

    // Canvas size
    u.searchParams.set("w", String(local.width));
    u.searchParams.set("h", String(local.height));

    return u.pathname + "?" + u.searchParams.toString();
  }, [local, src, fabricMask, camo, linearMask, patchMask]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Belt Designer</h3>
        <p className="text-xs text-gray-600">
          This designer lives inside Style creation. Each PNG in{" "}
          <code>/public/belts</code> is treated as a layer in the preview
          below.
        </p>
      </div>

      {/* Preview box (on top) */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-gray-700">
            Belt preview (combined layers)
          </p>
          {url && (
            <button
              type="button"
              className="text-[11px] rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => {
                navigator.clipboard?.writeText(url);
              }}
            >
              Copy image URL
            </button>
          )}
        </div>

        <div className="flex items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-3">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Belt preview"
              className="max-h-64 w-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-gray-400">
              Adjust belt layers below to see a preview.
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-gray-700 space-y-1">
            <span>Base belt color</span>
            <input
              type="color"
              className="h-8 w-full cursor-pointer rounded-md border border-gray-300 bg-white"
              value={local.beltColor}
              onChange={(e) => update("beltColor", e.target.value)}
            />
          </label>

          <label className="text-xs font-medium text-gray-700 space-y-1">
            <span>Width</span>
            <input
              type="number"
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              value={local.width}
              min={240}
              max={2048}
              onChange={(e) =>
                update("width", Number(e.target.value) || local.width)
              }
            />
          </label>

          <label className="text-xs font-medium text-gray-700 space-y-1">
            <span>Height</span>
            <input
              type="number"
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              value={local.height}
              min={120}
              max={1024}
              onChange={(e) =>
                update("height", Number(e.target.value) || local.height)
              }
            />
          </label>
        </div>
      </div>

      {/* Belt layers list (controls) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left column: stripes + linear stripe */}
        <div className="space-y-4">
          {/* Stripe layers */}
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold text-gray-800">
              Stripe layers (stripe1–stripe10)
            </p>
            <p className="text-[11px] text-gray-600">
              Each stripe PNG in <code>/public/belts/stripe*.png</code> is a
              horizontal layer on the belt.
            </p>

            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                value={local.stripeCount}
                onChange={(e) =>
                  update("stripeCount", Number(e.target.value) || 0)
                }
                className="flex-1"
              />
              <span className="w-10 text-right text-xs text-gray-700">
                {local.stripeCount}
              </span>
            </div>

            {local.stripeCount > 0 && (
              <label className="mt-2 text-[11px] font-medium text-gray-700 space-y-1">
                <span>Stripe color</span>
                <input
                  type="color"
                  className="h-7 w-full cursor-pointer rounded-md border border-gray-300 bg-white"
                  value={local.stripeColor}
                  onChange={(e) => update("stripeColor", e.target.value)}
                />
              </label>
            )}
          </div>

          {/* Linear stripe */}
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-800">
                Linear stripe layer
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="includeLinear"
                  type="checkbox"
                  className="h-3 w-3 rounded border-gray-300"
                  checked={local.includeLinear}
                  onChange={(e) =>
                    update("includeLinear", e.target.checked)
                  }
                />
                <label
                  htmlFor="includeLinear"
                  className="text-[11px] font-medium text-gray-700"
                >
                  Show linear stripe
                </label>
              </div>
            </div>

            <p className="text-[11px] text-gray-600">
              Uses <code>/belts/linear.png</code> as a mask layer on top of the
              belt.
            </p>

            {local.includeLinear && (
              <label className="mt-2 text-[11px] font-medium text-gray-700 space-y-1">
                <span>Linear stripe color</span>
                <input
                  type="color"
                  className="h-7 w-full cursor-pointer rounded-md border border-gray-300 bg-white"
                  value={local.linearColor}
                  onChange={(e) => update("linearColor", e.target.value)}
                />
              </label>
            )}
          </div>
        </div>

        {/* Right column: patch + camo */}
        <div className="space-y-4">
          {/* Patch layer */}
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-800">
                Patch layer
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="includePatch"
                  type="checkbox"
                  className="h-3 w-3 rounded border-gray-300"
                  checked={local.includePatch}
                  onChange={(e) =>
                    update("includePatch", e.target.checked)
                  }
                />
                <label
                  htmlFor="includePatch"
                  className="text-[11px] font-medium text-gray-700"
                >
                  Show patch
                </label>
              </div>
            </div>

            <p className="text-[11px] text-gray-600">
              Uses <code>/belts/patch.png</code> on the belt tip for patches /
              logos.
            </p>

            {local.includePatch && (
              <label className="mt-2 text-[11px] font-medium text-gray-700 space-y-1">
                <span>Patch color</span>
                <input
                  type="color"
                  className="h-7 w-full cursor-pointer rounded-md border border-gray-300 bg-white"
                  value={local.patchColor}
                  onChange={(e) => update("patchColor", e.target.value)}
                />
              </label>
            )}
          </div>

          {/* Camo / overlay layer */}
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-800">
                Camo / pattern overlay
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="includeCamo"
                  type="checkbox"
                  className="h-3 w-3 rounded border-gray-300"
                  checked={local.includeCamo}
                  onChange={(e) =>
                    update("includeCamo", e.target.checked)
                  }
                />
                <label
                  htmlFor="includeCamo"
                  className="text-[11px] font-medium text-gray-700"
                >
                  Show camo layer
                </label>
              </div>
            </div>

            <p className="text-[11px] text-gray-600">
              Uses <code>/belts/camo.png</code> as a full-belt overlay on top of
              the base fabric.
            </p>

            {local.includeCamo && (
              <div className="space-y-2">
                <label className="text-[11px] font-medium text-gray-700 space-y-1">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={local.camoOpacity}
                    onChange={(e) =>
                      update("camoOpacity", Number(e.target.value) || 1)
                    }
                  />
                  <span className="text-[10px] text-gray-600">
                    {local.camoOpacity.toFixed(2)}
                  </span>
                </label>

                <label className="text-[11px] font-medium text-gray-700 space-y-1">
                  <span>Blend mode</span>
                  <select
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                    value={local.camoBlend}
                    onChange={(e) =>
                      update(
                        "camoBlend",
                        e.target.value === "multiply"
                          ? "multiply"
                          : "normal"
                      )
                    }
                  >
                    <option value="normal">Normal</option>
                    <option value="multiply">Multiply</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
