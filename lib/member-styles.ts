import { prisma } from "@/lib/prisma";
import {
  getPdfNamesFromBeltConfig,
  addRankPdfsToDocuments,
  type StyleDocument,
} from "@/lib/belt-config";

/**
 * Sync a member's per-style entries (Member.stylesNotes) and rank
 * documents (Member.styleDocuments) against their currently
 * active/canceled memberships:
 *
 *   * Any style covered by an ACTIVE or CANCELED membership stays
 *     (or becomes) `active: true` on the member. Rank PDFs for
 *     the covered style are added to styleDocuments if missing.
 *   * Any style NOT covered by an ACTIVE / CANCELED membership
 *     flips to `active: false`. Rank PDFs tied to that style are
 *     removed from styleDocuments.
 *
 * PAUSED / EXPIRED memberships DO NOT keep a style active -- when
 * the last covering membership drops out of ACTIVE / CANCELED,
 * the style follows it to inactive.
 *
 * Callers:
 *   - PATCH /api/memberships/[id] (manual admin edits)
 *   - /api/billing/auto-run housekeeping (auto-expiry pass)
 *   - Any future path that mutates a Membership's status.
 *
 * Idempotent: if nothing needs to change on the member row, the
 * function returns without a write.
 */
export async function syncMemberStyles(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { clientId: true, stylesNotes: true, styleDocuments: true },
  });

  if (!member?.stylesNotes) return;
  const clientId = member.clientId;

  // Only ACTIVE / CANCELED memberships keep a style active. PAUSED
  // and EXPIRED do NOT -- the whole point of this helper.
  const activeMemberships = await prisma.membership.findMany({
    where: {
      memberId,
      status: { in: ["ACTIVE", "CANCELED"] },
    },
    include: {
      membershipPlan: {
        select: { allowedStyles: true },
      },
    },
  });

  const coveredStyleIds: string[] = [];
  let coversAllStyles = false;

  for (const membership of activeMemberships) {
    if (membership.membershipPlan.allowedStyles) {
      const styleIds: string[] = JSON.parse(membership.membershipPlan.allowedStyles);
      coveredStyleIds.push(...styleIds);
    } else {
      // allowedStyles = null -> this plan covers every style in the gym
      coversAllStyles = true;
    }
  }

  let coveredStyles: Array<{ id: string; name: string; beltConfig: string | null }> = [];
  if (coversAllStyles) {
    coveredStyles = await prisma.style.findMany({
      where: { clientId },
      select: { id: true, name: true, beltConfig: true },
    });
  } else if (coveredStyleIds.length > 0) {
    coveredStyles = await prisma.style.findMany({
      where: { id: { in: Array.from(new Set(coveredStyleIds)) }, clientId },
      select: { id: true, name: true, beltConfig: true },
    });
  }

  const coveredStyleNames = coveredStyles.map((s) => s.name.toLowerCase());

  type MemberStyle = {
    name: string;
    rank?: string;
    beltSize?: string;
    beltText?: string;
    coach?: string;
    uniformSize?: string;
    startDate?: string;
    lastPromotionDate?: string;
    active?: boolean;
  };
  const memberStyles: MemberStyle[] = JSON.parse(member.stylesNotes);

  let currentDocs: StyleDocument[] = [];
  if (member.styleDocuments) {
    try {
      currentDocs = JSON.parse(member.styleDocuments);
    } catch {
      currentDocs = [];
    }
  }

  let stylesUpdated = false;
  let docsUpdated = false;
  let updatedDocs = [...currentDocs];

  const updatedStyles = memberStyles.map((style) => {
    const styleLower = style.name.toLowerCase();
    const shouldBeActive = coveredStyleNames.includes(styleLower);
    const styleConfig = coveredStyles.find((s) => s.name.toLowerCase() === styleLower);

    if (shouldBeActive && style.active === false) {
      // Style should be active but is inactive - activate it and add rank documents
      stylesUpdated = true;
      if (style.rank && styleConfig?.beltConfig) {
        const result = addRankPdfsToDocuments(styleConfig.beltConfig, style.rank, updatedDocs);
        if (result.hasChanges) {
          updatedDocs = result.docs;
          docsUpdated = true;
        }
      }
      return { ...style, active: true };
    } else if (!shouldBeActive && style.active !== false) {
      // Style should be inactive but is active - deactivate it
      stylesUpdated = true;
      return { ...style, active: false };
    }
    return style;
  });

  // Remove rank PDFs for styles that just became inactive.
  const allStyles = await prisma.style.findMany({
    where: { clientId },
    select: { name: true, beltConfig: true },
  });

  for (const style of memberStyles) {
    const styleLower = style.name.toLowerCase();
    const shouldBeActive = coveredStyleNames.includes(styleLower);
    const wasActive = style.active !== false;

    if (!shouldBeActive && wasActive) {
      const styleData = allStyles.find((s) => s.name.toLowerCase() === styleLower);
      if (styleData?.beltConfig) {
        const pdfNamesToRemove = getPdfNamesFromBeltConfig(styleData.beltConfig);
        if (pdfNamesToRemove.length > 0) {
          const beforeCount = updatedDocs.length;
          updatedDocs = updatedDocs.filter((doc) => !pdfNamesToRemove.includes(doc.name));
          if (updatedDocs.length < beforeCount) docsUpdated = true;
        }
      }
    }
  }

  if (stylesUpdated || docsUpdated) {
    const updateData: { stylesNotes?: string; styleDocuments?: string } = {};
    if (stylesUpdated) updateData.stylesNotes = JSON.stringify(updatedStyles);
    if (docsUpdated) updateData.styleDocuments = JSON.stringify(updatedDocs);
    await prisma.member.update({
      where: { id: memberId },
      data: updateData,
    });
  }
}
