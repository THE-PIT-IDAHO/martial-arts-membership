// Generate simple PWA icons as SVG files
// These can be replaced with actual branded icons later
const fs = require("fs");
const path = require("path");

const iconsDir = path.join(__dirname, "..", "public", "icons");

function generateSVG(size, maskable = false) {
  const padding = maskable ? size * 0.1 : 0;
  const iconSize = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = iconSize / 2.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#c41111" rx="${maskable ? 0 : size * 0.15}"/>
  <circle cx="${cx}" cy="${cy - r * 0.3}" r="${r * 0.35}" fill="none" stroke="white" stroke-width="${size * 0.03}"/>
  <line x1="${cx}" y1="${cy - r * 0.3 + r * 0.35}" x2="${cx}" y2="${cy + r * 0.5}" stroke="white" stroke-width="${size * 0.03}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy + r * 0.05}" x2="${cx - r * 0.4}" y2="${cy + r * 0.45}" stroke="white" stroke-width="${size * 0.03}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy + r * 0.05}" x2="${cx + r * 0.4}" y2="${cy + r * 0.45}" stroke="white" stroke-width="${size * 0.03}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy + r * 0.5}" x2="${cx - r * 0.3}" y2="${cy + r * 0.9}" stroke="white" stroke-width="${size * 0.03}" stroke-linecap="round"/>
  <line x1="${cx}" y1="${cy + r * 0.5}" x2="${cx + r * 0.3}" y2="${cy + r * 0.9}" stroke="white" stroke-width="${size * 0.03}" stroke-linecap="round"/>
  <text x="${cx}" y="${cy + r * 1.3}" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="${size * 0.08}" font-weight="bold">PORTAL</text>
</svg>`;
}

// Write SVG icons (browsers accept SVG for PWA icons in many cases,
// but for maximum compatibility we save as .svg and reference as .png in manifest)
// The gym owner can replace these with real PNGs later
const configs = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-192.png", size: 192, maskable: true },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const { name, size, maskable } of configs) {
  const svgName = name.replace(".png", ".svg");
  fs.writeFileSync(path.join(iconsDir, svgName), generateSVG(size, maskable));
  console.log(`Created ${svgName}`);
}

console.log("\nNote: SVG icons created. For production, convert to PNG or replace with branded icons.");
console.log("Most modern browsers support SVG PWA icons.");
