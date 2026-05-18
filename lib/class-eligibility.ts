import { prisma } from "@/lib/prisma";

/**
 * Check whether a member is allowed to attend a class based on the class's
 * allowed styles vs the member's active enrolled styles.
 *
 * Returns `{ ok: true }` when:
 *   - the class has no styles configured (general class), OR
 *   - the member has at least one active enrolled style that matches one of
 *     the class's styles.
 *
 * Returns `{ ok: false, reason }` otherwise.
 */
export async function memberCanAttendClass(
  memberId: string,
  classSessionId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cls = await prisma.classSession.findUnique({
    where: { id: classSessionId },
    select: { name: true, styleNames: true, styleName: true },
  });
  if (!cls) return { ok: false, reason: "Class not found" };

  const classStyles = parseClassStyles(cls);
  if (classStyles.length === 0) return { ok: true };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { stylesNotes: true, primaryStyle: true, firstName: true, lastName: true },
  });
  if (!member) return { ok: false, reason: "Member not found" };

  const memberStyles = parseMemberActiveStyles(member);
  const classStyleSet = new Set(classStyles.map((s) => s.toLowerCase()));
  const hasMatch = memberStyles.some((s) => classStyleSet.has(s.toLowerCase()));

  if (hasMatch) return { ok: true };

  const memberName = `${member.firstName} ${member.lastName}`.trim();
  const allowed = classStyles.join(", ");
  const enrolled = memberStyles.length > 0 ? memberStyles.join(", ") : "none";
  return {
    ok: false,
    reason: `${memberName} is not enrolled in a style allowed by "${cls.name}". Allowed: ${allowed}. Member enrolled in: ${enrolled}.`,
  };
}

function parseClassStyles(cls: { styleNames: string | null; styleName: string | null }): string[] {
  if (cls.styleNames) {
    try {
      const arr = JSON.parse(cls.styleNames);
      if (Array.isArray(arr)) return arr.filter((s): s is string => typeof s === "string" && !!s);
    } catch { /* fall through */ }
  }
  if (cls.styleName) return [cls.styleName];
  return [];
}

function parseMemberActiveStyles(member: { stylesNotes: string | null; primaryStyle: string | null }): string[] {
  if (member.stylesNotes) {
    try {
      const arr: Array<{ name?: string; active?: boolean }> = JSON.parse(member.stylesNotes);
      if (Array.isArray(arr)) {
        return arr
          .filter((s) => s.name && s.active !== false)
          .map((s) => s.name as string);
      }
    } catch { /* fall through */ }
  }
  if (member.primaryStyle) return [member.primaryStyle];
  return [];
}
