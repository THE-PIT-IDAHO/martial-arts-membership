/**
 * Canonical member-status pill palette. Every status badge in the app
 * should route through here so the dashboard "New This Week", the
 * members list, member detail, global search results, etc. all agree
 * on what color a PROSPECT (or ACTIVE, or PARENT...) pill is.
 *
 * Palette originated in the members list -- kept as the reference and
 * hoisted here so drift doesn't creep back in via per-page ad-hoc
 * switch statements. If a status pill's color needs to change, change
 * it here and every surface follows.
 */
export interface StatusPillClasses {
  bg: string;
  text: string;
  border: string;
}

const PALETTE: Record<string, StatusPillClasses> = {
  ACTIVE:   { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300"  },
  PROSPECT: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  INACTIVE: { bg: "bg-primary/10", text: "text-primary",    border: "border-primary/30" },
  PARENT:   { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300"   },
  COACH:    { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  CANCELED: { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  BANNED:   { bg: "bg-gray-200",   text: "text-gray-900",   border: "border-gray-400"   },
};

const UNKNOWN: StatusPillClasses = { bg: "bg-gray-100", text: "text-gray-800", border: "border-gray-300" };

/**
 * Returns the pill classes for a single status. Accepts CANCELED and
 * the British "CANCELLED" alias interchangeably.
 */
export function getMemberStatusColors(status: string | null | undefined): StatusPillClasses {
  if (!status) return UNKNOWN;
  const normalized = status.toUpperCase();
  const key = normalized === "CANCELLED" ? "CANCELED" : normalized;
  return PALETTE[key] || UNKNOWN;
}

/**
 * Convenience for the compact "bg + text" pattern used by dashboard /
 * search chips that don't render a border.
 */
export function getMemberStatusBadgeClasses(status: string | null | undefined): string {
  const c = getMemberStatusColors(status);
  return `${c.bg} ${c.text}`;
}

/**
 * Convenience for the full "bg + text + border" pill used by the
 * members list + member detail page.
 */
export function getMemberStatusPillClasses(status: string | null | undefined): string {
  const c = getMemberStatusColors(status);
  return `${c.bg} ${c.text} ${c.border}`;
}
