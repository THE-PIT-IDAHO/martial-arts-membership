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
  // When the member entered their current rank. Used to evaluate the
  // "minimum time in current rank" requirement (rank.minDuration on
  // the style's beltConfig). ISO or YYYY-MM-DD string.
  lastPromotionDate?: string | null;
  active?: boolean;
};

type RankDuration = { value?: number | null; unit?: "weeks" | "months" | "years" | null };

type BeltRank = {
  name: string;
  order: number;
  classRequirements?: Array<{ label?: string | null; minCount?: number | null }> | null;
  // Optional "minimum time to graduate from this rank" configured in
  // the belt designer. Absent / null / value<=0 means no time gate.
  minDuration?: RankDuration | null;
};

export type RequirementProgress = {
  label: string; // "*" normalized to "Any Class"
  attended: number;
  required: number;
  met: boolean;
};

export type TimeInRankProgress = {
  // Configured minimum, as-authored (used for display: "6 months").
  required: { value: number; unit: "weeks" | "months" | "years" };
  // Same minimum expressed in whole days so callers can pick a unit
  // for progress bars without re-deriving.
  requiredDays: number;
  // Days between the member's lastPromotionDate and the evaluation date
  // (asOfDate passed to getStyleProgress, defaults to now). Clamped at 0.
  elapsedDays: number;
  met: boolean;
};

export type StyleProgressSummary = {
  currentRankName: string | null;
  nextRankName: string | null;
  requirements: RequirementProgress[];
  // Present ONLY when the current rank has a positive minDuration AND
  // the member has a lastPromotionDate to measure from. Null otherwise
  // (vacuous pass -- no time gate to fail).
  timeInRank: TimeInRankProgress | null;
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

// Advance `date` by `value` calendar units. Uses setMonth / setFullYear
// so month lengths + leap years behave the way a coach would expect
// ("6 months from Jan 31" -> Jul 31 / Jul 30 as appropriate), not a
// naive 30-day approximation.
function addUnits(date: Date, value: number, unit: "weeks" | "months" | "years"): Date {
  const d = new Date(date.getTime());
  if (unit === "weeks") d.setDate(d.getDate() + 7 * value);
  else if (unit === "months") d.setMonth(d.getMonth() + value);
  else d.setFullYear(d.getFullYear() + value);
  return d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Compute per-requirement progress for a specific enrolled style.
 *
 *  `asOfDate` is the point in time to measure "have they met the
 *  requirements" against. Defaults to now. Callers that ask
 *  "will they be ready by an upcoming promotion event" pass the
 *  event date so both class counts (already bounded upstream) and
 *  the time-in-rank gate use the same yardstick.
 */
export function getStyleProgress(
  attendances: AttendanceRow[],
  enrolled: EnrolledStyle,
  beltConfigJson: string | null | undefined,
  asOfDate: Date = new Date(),
): StyleProgressSummary {
  if (!enrolled.rank) {
    return { currentRankName: null, nextRankName: null, requirements: [], timeInRank: null };
  }
  const ranks = parseBeltConfigRanks(beltConfigJson);
  if (ranks.length === 0) {
    return { currentRankName: enrolled.rank, nextRankName: null, requirements: [], timeInRank: null };
  }
  const currentIdx = ranks.findIndex((r) => r.name.toLowerCase() === enrolled.rank!.toLowerCase());
  if (currentIdx < 0) {
    return { currentRankName: enrolled.rank, nextRankName: null, requirements: [], timeInRank: null };
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

  // Time-in-rank: only compute when a real minDuration is configured
  // AND the member has a lastPromotionDate to anchor it. If either is
  // missing we return null so callers treat this rank as having no
  // time gate (vacuous pass) instead of a failed one.
  let timeInRank: TimeInRankProgress | null = null;
  const md = current.minDuration;
  const durationValue = md?.value ?? 0;
  const durationUnit = md?.unit;
  if (
    durationValue > 0
    && (durationUnit === "weeks" || durationUnit === "months" || durationUnit === "years")
    && enrolled.lastPromotionDate
  ) {
    const startedAt = new Date(enrolled.lastPromotionDate);
    if (!Number.isNaN(startedAt.getTime())) {
      const readyAt = addUnits(startedAt, durationValue, durationUnit);
      const elapsedDays = Math.max(0, Math.floor((asOfDate.getTime() - startedAt.getTime()) / MS_PER_DAY));
      const requiredDays = Math.max(0, Math.round((readyAt.getTime() - startedAt.getTime()) / MS_PER_DAY));
      timeInRank = {
        required: { value: durationValue, unit: durationUnit },
        requiredDays,
        elapsedDays,
        met: asOfDate.getTime() >= readyAt.getTime(),
      };
    }
  }

  return {
    currentRankName: current.name,
    nextRankName: next?.name || null,
    requirements: reqs,
    timeInRank,
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
          lastPromotionDate:
            typeof o.lastPromotionDate === "string" ? o.lastPromotionDate : undefined,
          active: typeof o.active === "boolean" ? o.active : undefined,
        } as EnrolledStyle;
      })
      .filter((s): s is EnrolledStyle => s !== null);
  } catch {
    return [];
  }
}
