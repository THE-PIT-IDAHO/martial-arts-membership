// Shared belt/rank/document types and helpers used by API routes that touch
// beltConfig JSON. Consolidated from previously-duplicated copies in:
//   app/api/memberships/route.ts
//   app/api/memberships/[id]/route.ts
//   app/api/pos/transactions/route.ts
//   app/api/promotion-events/[id]/execute/route.ts
//   app/api/members/[id]/route.ts

export type RankPdf = {
  id?: string;
  name: string;
  url: string;
};

export type BeltRank = {
  name: string;
  order: number;
  pdfDocuments?: RankPdf[];
};

export type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  fromRank?: string;
};

type BeltConfigShape = {
  ranks?: BeltRank[];
  [key: string]: unknown;
};

function parseBeltConfig(beltConfig: string | null | undefined): BeltConfigShape | null {
  if (!beltConfig) return null;
  try {
    return typeof beltConfig === "string" ? JSON.parse(beltConfig) : beltConfig;
  } catch {
    return null;
  }
}

/** Lowest-order rank in a style's beltConfig (the "starting" rank). */
export function getFirstRankFromBeltConfig(beltConfig: string | null): string | null {
  const config = parseBeltConfig(beltConfig);
  if (!config?.ranks?.length) return null;
  const sorted = [...config.ranks].sort((a, b) => a.order - b.order);
  return sorted[0]?.name || null;
}

/** Every pdfDocument.name across all ranks in a beltConfig. */
export function getPdfNamesFromBeltConfig(beltConfig: string | null): string[] {
  const config = parseBeltConfig(beltConfig);
  if (!config?.ranks) return [];
  const names: string[] = [];
  for (const rank of config.ranks) {
    if (rank.pdfDocuments) {
      for (const pdf of rank.pdfDocuments) {
        if (pdf?.name) names.push(pdf.name);
      }
    }
  }
  return names;
}

/**
 * PDF names from ranks STRICTLY ABOVE a target rank's order. Used during
 * downgrades to identify which rank PDFs the member no longer has access to.
 */
export function getPdfNamesAboveRank(beltConfig: string | null, targetRankName: string): string[] {
  const config = parseBeltConfig(beltConfig);
  if (!config?.ranks) return [];
  const target = config.ranks.find((r) => r.name === targetRankName);
  if (!target) return [];
  const names: string[] = [];
  for (const rank of config.ranks) {
    if (rank.order > target.order && rank.pdfDocuments) {
      for (const pdf of rank.pdfDocuments) {
        if (pdf?.name) names.push(pdf.name);
      }
    }
  }
  return names;
}

/** Order number of a named rank in a beltConfig, or null if not found. */
export function getRankOrder(beltConfig: string | null, rankName: string): number | null {
  if (!rankName) return null;
  const config = parseBeltConfig(beltConfig);
  if (!config?.ranks) return null;
  const rank = config.ranks.find((r) => r.name === rankName);
  return rank ? rank.order : null;
}

/**
 * No-op stub kept so existing call sites compile. Rank PDFs now live on
 * Rank.pdfDocument (Prisma) and are surfaced on the portal Styles page;
 * member.styleDocuments is reserved for waivers and manual uploads.
 */
export function addRankPdfsToDocuments(
  _beltConfig: string | null,
  _targetRankName: string,
  currentDocs: StyleDocument[],
): { docs: StyleDocument[]; hasChanges: boolean } {
  return { docs: currentDocs, hasChanges: false };
}

/** Async variant returning the unchanged styleDocuments JSON string. */
export async function addRankPdfsToMember(
  _memberId: string,
  _styleName: string,
  _targetRankName: string,
  currentStyleDocuments: string | null,
): Promise<string> {
  return currentStyleDocuments || "[]";
}
