// GET /api/waivers/by-type/[typeSlug]
//
// Returns the tenant's members alongside their signed-status for waivers
// in a single type bucket. typeSlug values:
//   "all"     → every member, status reflects ANY signed waiver
//   "untyped" → status reflects signed waivers whose template has no type
//               (or no linked template at all — legacy rows)
//   <slug>    → status reflects signed waivers whose template.type slug
//               matches (case-insensitive, slugified for url-safety)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ typeSlug: string }> };

function slugifyType(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const clientId = await getClientId(req);
    const { typeSlug } = await params;
    const wantSlug = (typeSlug || "all").toLowerCase();

    const members = await prisma.member.findMany({
      where: { clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        waiverSigned: true,
        waiverSignedAt: true,
        signedWaivers: {
          orderBy: { signedAt: "desc" },
          select: {
            id: true,
            signedAt: true,
            confirmed: true,
            templateName: true,
            template: { select: { id: true, name: true, type: true } },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    // Resolve the requested type's actual label (e.g. "gym" → "Gym") by
    // looking at the first matching template; falls back to the slug if
    // we can't find one.
    let typeLabel: string | null = null;
    if (wantSlug !== "all" && wantSlug !== "untyped") {
      const sample = await prisma.waiverTemplate.findFirst({
        where: { clientId, NOT: { type: null } },
        select: { type: true },
      });
      // Better: walk all templates to find the exact match.
      const all = await prisma.waiverTemplate.findMany({
        where: { clientId, NOT: { type: null } },
        select: { type: true },
      });
      for (const row of all) {
        if (row.type && slugifyType(row.type) === wantSlug) {
          typeLabel = row.type;
          break;
        }
      }
      if (!typeLabel && sample?.type) typeLabel = sample.type;
    }

    function matchesBucket(templateType: string | null): boolean {
      if (wantSlug === "all") return true;
      if (wantSlug === "untyped") return !templateType;
      return slugifyType(templateType) === wantSlug;
    }

    const rows = members.map((m) => {
      const matching = m.signedWaivers.filter((w) =>
        matchesBucket(w.template?.type ?? null),
      );
      const latest = matching[0];
      return {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone,
        status: m.status,
        signed: !!latest,
        signedAt: latest?.signedAt || null,
        signedTemplateName: latest?.template?.name || latest?.templateName || null,
      };
    });

    return NextResponse.json({
      typeSlug: wantSlug,
      typeLabel: wantSlug === "all" ? "All Waivers" : wantSlug === "untyped" ? "Untyped" : typeLabel || wantSlug,
      members: rows,
    });
  } catch (err) {
    console.error("Error fetching waivers by type:", err);
    return new NextResponse("Failed to load", { status: 500 });
  }
}
