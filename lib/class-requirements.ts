// Shared "does this member meet the class's requirements?" check.
// Extracted from the calendar page so the dashboard's check-in flow can reuse
// the same logic + the same "Requirement Not Met" popup, instead of silently
// adding anyone like it did before.

export interface ReqMemberStyle {
  styleId: string;
  styleName: string;
  rank: string;
  startDate?: string | null;
}

export interface ReqMember {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  styles?: ReqMemberStyle[];
}

export interface ReqClass {
  styleIds?: string | null;
  styleId?: string | null;
  minRankId?: string | null;
  minRankName?: string | null;
  minRankIds?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
}

export interface ReqStyle {
  id: string;
  name: string;
  beltConfig?: string | null;
}

function getMemberAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function checkMemberRequirements(
  member: ReqMember,
  cls: ReqClass | null | undefined,
  styles: ReqStyle[],
  classDate: Date | null,
): { meets: boolean; reason: string } {
  if (!cls) return { meets: true, reason: "" };

  const missingRequirements: string[] = [];

  // --- Age ---
  if (cls.minAge != null || cls.maxAge != null) {
    const age = getMemberAge(member.dateOfBirth);
    if (age === null) {
      missingRequirements.push("No date of birth on file (age requirement applies)");
    } else {
      if (cls.minAge != null && age < cls.minAge) {
        missingRequirements.push(`Must be at least ${cls.minAge} years old (member is ${age})`);
      }
      if (cls.maxAge != null && age > cls.maxAge) {
        missingRequirements.push(`Must be ${cls.maxAge} or younger (member is ${age})`);
      }
    }
  }

  // --- Style ID list ---
  let classStyleIds: string[] = [];
  if (cls.styleIds) {
    try { classStyleIds = JSON.parse(cls.styleIds); } catch { classStyleIds = []; }
  } else if (cls.styleId) {
    classStyleIds = [cls.styleId];
  }
  classStyleIds = classStyleIds.filter((id) => id && id !== "NO_STYLE");

  if (classStyleIds.length === 0) {
    if (missingRequirements.length > 0) {
      return {
        meets: false,
        reason: `${member.firstName} ${member.lastName}:\n• ${missingRequirements.join("\n• ")}`,
      };
    }
    return { meets: true, reason: "" };
  }

  const requiredStyleNames = classStyleIds
    .map((id) => styles.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];

  if (!member.styles || member.styles.length === 0) {
    missingRequirements.push(`Missing required style: ${requiredStyleNames.join(", ")}`);
    if (cls.minRankId && cls.minRankName) {
      missingRequirements.push(`Missing minimum rank requirement: ${cls.minRankName}`);
    }
    return {
      meets: false,
      reason: `${member.firstName} ${member.lastName}:\n• ${missingRequirements.join("\n• ")}`,
    };
  }

  // --- Style match (respecting style start dates relative to class date) ---
  let hasMatchingStyle = false;
  let matchedStyleName = "";
  let matchedMemberStyle: ReqMemberStyle | null = null;
  let styleStartDateAfterClass = false;
  let styleStartDateInfo = "";

  const cmpDate = classDate ? new Date(classDate) : null;
  if (cmpDate) cmpDate.setHours(0, 0, 0, 0);

  for (const requiredStyleId of classStyleIds) {
    const requiredStyle = styles.find((s) => s.id === requiredStyleId);
    if (!requiredStyle) continue;

    const memberStyle = member.styles.find(
      (ms) =>
        ms.styleId === requiredStyleId ||
        ms.styleName?.toLowerCase() === requiredStyle.name?.toLowerCase(),
    );
    if (!memberStyle) continue;

    if (memberStyle.startDate && cmpDate) {
      const styleStart = new Date(memberStyle.startDate);
      styleStart.setHours(0, 0, 0, 0);
      if (styleStart > cmpDate) {
        styleStartDateAfterClass = true;
        styleStartDateInfo = `Style "${requiredStyle.name}" was added on ${memberStyle.startDate} (after this class date)`;
        continue;
      }
    }
    hasMatchingStyle = true;
    matchedStyleName = requiredStyle.name;
    matchedMemberStyle = memberStyle;
    break;
  }

  if (!hasMatchingStyle) {
    if (styleStartDateAfterClass) {
      missingRequirements.push(styleStartDateInfo);
    } else {
      missingRequirements.push(`Missing required style: ${requiredStyleNames.join(", ")}`);
    }
  }

  // --- Rank ---
  let perStyleMinRankIds: string[] = [];
  if (cls.minRankIds) {
    try {
      const parsed = JSON.parse(cls.minRankIds);
      if (Array.isArray(parsed)) perStyleMinRankIds = parsed.map((v) => String(v ?? ""));
    } catch { /* ignore */ }
  }
  const hasAnyRankReq =
    perStyleMinRankIds.some((v) => v) || !!(cls.minRankId && cls.minRankName);

  if (hasAnyRankReq) {
    if (!hasMatchingStyle) {
      const label = cls.minRankName || "configured rank";
      missingRequirements.push(`Missing minimum rank requirement: ${label}`);
    } else if (matchedMemberStyle) {
      const matchedClassIdx = classStyleIds.findIndex((id) => {
        const s = styles.find((st) => st.id === id);
        return s?.name.toLowerCase() === matchedStyleName.toLowerCase();
      });
      const requiredStyle = styles.find((s) => s.id === classStyleIds[matchedClassIdx]);
      const minRankIdForStyle =
        perStyleMinRankIds[matchedClassIdx] || cls.minRankId || "";

      if (requiredStyle?.beltConfig && minRankIdForStyle) {
        try {
          const beltConfig = JSON.parse(requiredStyle.beltConfig);
          if (beltConfig.ranks && Array.isArray(beltConfig.ranks)) {
            const minRank = beltConfig.ranks.find(
              (r: { id: string; name: string }) => r.id === minRankIdForStyle,
            );
            if (minRank) {
              if (!matchedMemberStyle.rank || matchedMemberStyle.rank.trim() === "") {
                missingRequirements.push(
                  `No rank assigned in ${requiredStyle.name} (minimum required: ${minRank.name})`,
                );
              } else {
                const memberRank = beltConfig.ranks.find(
                  (r: { name: string }) => r.name === matchedMemberStyle!.rank,
                );
                if (!memberRank) {
                  missingRequirements.push(
                    `Rank "${matchedMemberStyle.rank}" is not recognized in ${requiredStyle.name} (minimum required: ${minRank.name})`,
                  );
                } else if (memberRank.order < minRank.order) {
                  missingRequirements.push(
                    `Current rank in ${requiredStyle.name}: ${matchedMemberStyle.rank} (minimum required: ${minRank.name})`,
                  );
                }
              }
            }
          }
        } catch { /* invalid JSON, skip */ }
      }
    }
  }

  if (missingRequirements.length > 0) {
    return {
      meets: false,
      reason: `${member.firstName} ${member.lastName}:\n• ${missingRequirements.join("\n• ")}`,
    };
  }
  return { meets: true, reason: "" };
}
