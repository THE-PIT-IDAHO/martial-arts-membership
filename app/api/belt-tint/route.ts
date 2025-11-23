import { NextResponse } from "next/server";

/**
 * Compose a belt from layers:
 * - outline (black stroke)  -> never tinted
 * - fabric color via mask   -> adjustable color
 * - optional linear stripe  -> mask + color
 * - optional patch          -> mask + color OR image
 * - up to 10 individual horizontal stripes -> each mask + color OR image
 * - optional camo/pattern overlay -> never tinted
 *
 * Example:
 * /api/belt-tint
 *  ?src=/belts/outline.png
 *  &maskImg=/belts/fabric.png&color=%23b91c1c
 *  &overlay=/belts/camo.png&overlayOpacity=1&overlayBlend=normal
 *  &linearMask=/belts/linear.png&linearColor=%23ffffff
 *  &patchMask=/belts/patch.png&patchColor=%23ffffff
 *  &s1Mask=/belts/stripe1.png&s1Color=%23ffffff
 *  &s2Mask=/belts/stripe2.png&s2Color=%23ffffff
 *  ...
 *  &s10Mask=/belts/stripe10.png&s10Color=%23ffffff
 *  &w=800&h=260
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Canvas size
  const w = clampInt(searchParams.get("w"), 800, 240, 2048);
  const h = clampInt(searchParams.get("h"), 260, 120, 1024);

  // Required/primary layers
  const outline = (searchParams.get("src") || "").trim();
  const fabricMask = (searchParams.get("maskImg") || "").trim();
  const fabricColor = (searchParams.get("color") || "#b91c1c").trim();

  // Optional overlay (camo/pattern) — never tinted
  const overlay = (searchParams.get("overlay") || "").trim();
  const overlayOpacity = clampFloat(searchParams.get("overlayOpacity"), 1, 0, 1);
  const overlayBlend =
    (searchParams.get("overlayBlend") || "normal").toLowerCase() === "multiply"
      ? "multiply"
      : "normal";

  // Optional linear stripe
  const linearMask = (searchParams.get("linearMask") || "").trim();
  const linearColor = (searchParams.get("linearColor") || "").trim();

  // Optional patch (image takes precedence; otherwise mask+color)
  const patchMask = (searchParams.get("patchMask") || "").trim();
  const patchColor = (searchParams.get("patchColor") || "").trim();
  const patchImg = (searchParams.get("patchImg") || "").trim();

  // Up to TEN individual horizontal stripes (s1..s10)
  type Stripe = { mask: string; color: string; img?: string };
  const stripes: Stripe[] = [];
  for (let i = 1; i <= 10; i++) {
    const mask = (searchParams.get(`s${i}Mask`) || "").trim();
    const color = (searchParams.get(`s${i}Color`) || "").trim();
    const img = (searchParams.get(`s${i}Img`) || "").trim();
    if (mask && (color || img)) {
      stripes.push({ mask, color, img });
    }
  }

  // Build SVG parts
  const parts: string[] = [];
  let maskCounter = 0;

  const addTinted = (maskUrl: string, fill: string) => {
    maskCounter += 1;
    const id = `m${maskCounter}`;
    parts.push(`
      <mask id="${id}">
        <image href="${maskUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
      </mask>
      <rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" mask="url(#${id})" style="mix-blend-mode:multiply"/>
    `);
  };

  const addImage = (href: string, opacity = 1, blend: "normal" | "multiply" = "normal") => {
    parts.push(
      `<image href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}" ${
        blend === "multiply" ? 'style="mix-blend-mode:multiply"' : ""
      }/>`,
    );
  };

  // 1) Fabric color via mask
  if (fabricMask && fabricColor) {
    addTinted(fabricMask, fabricColor);
  }

  // 2) Optional linear stripe
  if (linearMask && linearColor) {
    addTinted(linearMask, linearColor);
  }

  // 3) Optional patch (image OR mask+color)
  if (patchImg) {
    addImage(patchImg, 1, "normal");
  } else if (patchMask && patchColor) {
    addTinted(patchMask, patchColor);
  }

  // 4) Individual horizontal stripes
  for (const s of stripes) {
    if (s.img) addImage(s.img, 1, "normal");
    else if (s.color) addTinted(s.mask, s.color);
  }

  // 5) Optional camo/pattern overlay (unchanged)
  if (overlay) addImage(overlay, overlayOpacity, overlayBlend);

  // 6) Outline always on top (unchanged)
  if (outline) addImage(outline, 1, "normal");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${parts.join("\n")}
</svg>`.trim();

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  });
}

// ---------- helpers ----------
function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return def;
}
function clampFloat(v: string | null, def: number, min: number, max: number) {
  const n = parseFloat(String(v ?? ""));
  if (!Number.isNaN(n)) return Math.max(min, Math.min(max, n));
  return def;
}
