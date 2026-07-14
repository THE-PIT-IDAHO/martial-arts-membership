// Single source of truth for "how many classes has this member attended
// toward their current rank's requirements?" Everything else in the app
// — admin member profile, portal /styles, portal dashboard, promotions
// eligible, dashboard eligible box, calendar class sign-in window,
// reports — must resolve through this file. Copying the logic caller-
// side is how we ended up with each view reporting a different number
// for the same member.
//
// Convention: reqs stored on a rank represent what's needed to
// GRADUATE FROM that rank. So a member at rank R is measured against
// R.classRequirements, and R+1 is only used to label the "Next" rank.

export type AttendanceRow = {
  source?: string | null;
  attendanceDate?: string | Date | null;
  checkedInAt?: string | Date | null;
  classSession?: {
    classType?: string | null;
    classTypes?: string | null; // JSON-stringified string[]
    styleName?: string | null;
    styleNames?: string | null; // JSON-stringified string[]
  } | null;
};

export type EnrolledStyle = {
  name: string;
  rank?: string;
  attendanceResetDate?: string | null;
  active?: boolean;
};

type BeltRank = {
  name: string;
  order: number;
  classRequirements?: Array<{ label?: string | null; minCount?: number | null }> | null;
};

export type RequirementProgress = {
  label: string; // "*" normalized to "Any Class"
  attended: number;
  required: number;
  met: boolean;
};

export type StyleProgressSummary = {
  currentRankName: string | null;
  nextRankName: string | null;
  requirements: RequirementProgress[];
};

// --- Internal helpers ---

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toLocalYmd(value: string | Date): string | null {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function attendanceLocalYmd(att: AttendanceRow): string | null {
  const raw = att.attendanceDate || att.checkedInAt;
  if (!raw) return null;
  return toLocalYmd(raw);
}

/** Does this attendance row belong to the given enrolled style?
 *  Style gate — matches the historical admin/portal/promotions logic:
 *   - Reset-date floor applied (att before reset is dropped)
 *   - IMPORTED bulk-import rows always count (post-reset)
 *   - Class explicitly tagged with this style (styleName or styleNames) counts
 *   - Class with no style attached at all (open mat, general fitness) counts
 *     for every enrolled style (used to be a bug fix but is now the canonical
 *     behavior).
 */
export function attendanceCountsForStyle(att: AttendanceRow, enrolled: EnrolledStyle): boolean {
  // Reset-date floor
  if (enrolled.attendanceResetDate) {
    const attYmd = attendanceLocalYmd(att);
    const resetYmd = enrolled.attendanceResetDate.split("T")[0];
    if (attYmd && resetYmd && attYmd < resetYmd) return false;
  }
  if (att.source === "IMPORTED") return true;
  const cs = att.classSession;
  if (!cs) return false;

  const target = enrolled.name.toLowerCase();
  const styleNamesArr = parseJsonArray(cs.styleNames ?? null);
  if (styleNamesArr.some((n) => n.toLowerCase() === target)) return true;
  if (cs.styleName && cs.styleName.toLowerCase() === target) return true;

  // No-style class → credits every enrolled style
  return !cs.styleName && styleNamesArr.length === 0;
}

/** Does this attendance's classSession satisfy the given requirement label?
 *  "*" is the "Any Class" sentinel — matches every class type.
 *  Multi-tag classes (classTypes JSON) count for each tag they carry.
 */
export function attendanceMatchesRequirement(att: AttendanceRow, requirementLabel: string): boolean {
  if (requirementLabel === "*") return true;
  const cs = att.classSession;
  if (!cs) return false;
  const target = requirementLabel.toLowerCase();
  const typesArr = parseJsonArray(cs.classTypes ?? null);
  if (typesArr.some((t) => t.toLowerCase() === target)) return true;
  if (cs.classType && cs.classType.toLowerCase() === target) return true;
  return false;
}

function parseBeltConfigRanks(beltConfigJson: string | null | undefined): BeltRank[] {
  if (!beltConfigJson) return [];
  try {
    const parsed = JSON.parse(beltConfigJson);
    if (!parsed || !Array.isArray(parsed.ranks)) return [];
    return [...parsed.ranks].sort((a: BeltRank, b: BeltRank) => (a.order ?? 0) - (b.order ?? 0));
  } catch {
    return [];
  }
}

/** Compute per-requirement progress for a specific enrolled style. */
export function getStyleProgress(
  attendances: AttendanceRow[],
  enrolled: EnrolledStyle,
  beltConfigJson: string | null | undefined,
): StyleProgressSummary {
  if (!enrolled.rank) {
    return { currentRankName: null, nextRankName: null, requirements: [] };
  }
  const ranks = parseBeltConfigRanks(beltConfigJson);
  if (ranks.length === 0) {
    return { currentRankName: enrolled.rank, nextRankName: null, requirements: [] };
  }
  const currentIdx = ranks.findIndex((r) => r.name.toLowerCase() === enrolled.rank!.toLowerCase());
  if (currentIdx < 0) {
    return { currentRankName: enrolled.rank, nextRankName: null, requirements: [] };
  }
  const current = ranks[currentIdx];
  const next = currentIdx < ranks.length - 1 ? ranks[currentIdx + 1] : null;

  const forStyle = attendances.filter((att) => attendanceCountsForStyle(att, enrolled));
  const reqs = (current.classRequirements || [])
    .filter((r) => !!r.label && typeof r.minCount === "number" && r.minCount > 0)
    .map((req) => {
      const label = req.label!;
      const required = req.minCount!;
      const attended = forStyle.filter((a) => attendanceMatchesRequirement(a, label)).length;
      return {
        label: label === "*" ? "Any Class" : label,
        attended,
        required,
        met: attended >= required,
      };
    });

  return {
    currentRankName: current.name,
    nextRankName: next?.name || null,
    requirements: reqs,
  };
}

/** Aggregate per-classType counts for a member across every enrolled style.
 *  An attendance counts once per classType tag it carries (a multi-tag class
 *  credits both types). Only rows that would count toward SOME enrolled style
 *  are included — so a class attended before the style's reset, or under a
 *  style the member isn't enrolled in, is dropped.
 */
export function countAttendanceByType(
  attendances: AttendanceRow[],
  enrolledStyles: EnrolledStyle[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const att of attendances) {
    if (!enrolledStyles.some((s) => attendanceCountsForStyle(att, s))) continue;
    let types: string[] = parseJsonArray(att.classSession?.classTypes ?? null);
    if (types.length === 0 && att.classSession?.classType) types = [att.classSession.classType];
    if (types.length === 0) continue;
    for (const t of types) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

/** Parse a member's stylesNotes JSON blob into typed EnrolledStyle rows. */
export function parseEnrolledStyles(stylesNotesJson: string | null | undefined): EnrolledStyle[] {
  if (!stylesNotesJson) return [];
  try {
    const arr = JSON.parse(stylesNotesJson);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s: unknown) => {
        if (!s || typeof s !== "object") return null;
        const o = s as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name : "";
        if (!name) return null;
        return {
          name,
          rank: typeof o.rank === "string" ? o.rank : undefined,
          attendanceResetDate:
            typeof o.attendanceResetDate === "string" ? o.attendanceResetDate : undefined,
          active: typeof o.active === "boolean" ? o.active : undefined,
        } as EnrolledStyle;
      })
      .filter((s): s is EnrolledStyle => s !== null);
  } catch {
    return [];
  }
}
