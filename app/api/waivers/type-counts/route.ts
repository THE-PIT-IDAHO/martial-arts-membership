// GET /api/waivers/type-counts
//
// Returns per-type counts driving the buttons on the admin /waivers page.
// Each entry: { type, slug, signedCount, templateCount }
//   - signedCount: distinct members who have ≥1 signed waiver in this type
//   - templateCount: how many templates carry this type
//
// "Untyped" rolls up SignedWaivers without a templateId or whose template
// has type=null so admin can still see and clear that bucket.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

function slugifyType(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  try {
    const clientId = await getClientId(req);

    const templates = await prisma.waiverTemplate.findMany({
      where: { clientId, archivedAt: null },
      select: { id: true, type: true },
    });

    const templatesByType = new Map<string, { label: string; templateIds: string[] }>();
    for (const t of templates) {
      const key = t.type ? slugifyType(t.type) : "untyped";
      const entry = templatesByType.get(key) || {
        label: t.type || "Untyped",
        templateIds: [],
      };
      entry.templateIds.push(t.id);
      templatesByType.set(key, entry);
    }

    // Per-type signed-member counts. We do this in two passes (one query for
    // typed templates' signed waivers, one for the untyped bucket) so we
    // can deduplicate by memberId.
    const buckets: Array<{
      type: string;
      slug: string;
      signedCount: number;
      templateCount: number;
    }> = [];

    for (const [slug, entry] of templatesByType.entries()) {
      if (slug === "untyped") continue;
      const rows = await prisma.signedWaiver.findMany({
        where: { clientId, templateId: { in: entry.templateIds } },
        select: { memberId: true },
      });
      const distinctMembers = new Set(rows.map((r) => r.memberId));
      buckets.push({
        type: entry.label,
        slug,
        signedCount: distinctMembers.size,
        templateCount: entry.templateIds.length,
      });
    }

    // Untyped bucket: signed waivers with no templateId, or whose template
    // has no type.
    const untypedTemplateIds = templatesByType.get("untyped")?.templateIds || [];
    const untypedRows = await prisma.signedWaiver.findMany({
      where: {
        clientId,
        OR: [
          { templateId: null },
          ...(untypedTemplateIds.length > 0 ? [{ templateId: { in: untypedTemplateIds } }] : []),
        ],
      },
      select: { memberId: true },
    });
    const untypedMembers = new Set(untypedRows.map((r) => r.memberId));
    if (untypedMembers.size > 0 || untypedTemplateIds.length > 0) {
      buckets.push({
        type: "Untyped",
        slug: "untyped",
        signedCount: untypedMembers.size,
        templateCount: untypedTemplateIds.length,
      });
    }

    buckets.sort((a, b) => {
      if (a.slug === "untyped") return 1;
      if (b.slug === "untyped") return -1;
      return a.type.localeCompare(b.type);
    });

    // Total members for the "All Waivers" tile.
    const totalMembers = await prisma.member.count({ where: { clientId } });
    const signedMembers = await prisma.member.count({
      where: { clientId, waiverSigned: true },
    });

    return NextResponse.json({
      buckets,
      all: { totalMembers, signedMembers },
    });
  } catch (err) {
    console.error("Error computing type counts:", err);
    return new NextResponse("Failed to load", { status: 500 });
  }
}
