import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

type RankDocument = {
  id: string;
  name: string;
  url: string;
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  fromRank?: string; // Track which rank this came from
};

// (syncRankDocumentsToMembers was defined here but never wired up
// to PATCH -- and its member.findMany was unscoped, so if a future
// refactor invoked it, it would rewrite styleDocuments on every gym's
// members whose stylesNotes referenced this style's name. Removed
// entirely rather than left as a latent cross-tenant bug.)

// GET /api/styles/:id
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const clientId = await getClientId(_req);
    const style = await prisma.style.findUnique({
      where: { id },
      include: {
        ranks: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!style || style.clientId !== clientId) {
      return new NextResponse("Style not found", { status: 404 });
    }

    return NextResponse.json({ style });
  } catch (error) {
    console.error("Error fetching style:", error);
    return new NextResponse("Failed to load style", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const clientId = await getClientId(req);
    // Verify the style being updated belongs to this tenant. Before
    // this fix, getClientId was called for its side effect only and
    // any admin could overwrite beltConfig on any gym's style.
    const existing = await prisma.style.findUnique({
      where: { id },
      select: { clientId: true },
    });
    if (!existing || existing.clientId !== clientId) {
      return new NextResponse("Style not found", { status: 404 });
    }
    const body = await req.json();
    const { name, shortName, description, beltSystemEnabled, beltConfig, gradingDates, testNamingConvention, curriculumDisclaimer, promotionFeeCents, showProgressInPortal } = body;

    if (name !== undefined && typeof name !== "string") {
      return new NextResponse("Name must be a string", { status: 400 });
    }

    const data: any = {};

    if (typeof name === "string") data.name = name.trim();
    if (typeof shortName === "string" || shortName === null) {
      data.shortName = shortName ? shortName.trim() : null;
    }
    if (typeof description === "string" || description === null) {
      data.description = description ? description.trim() : null;
    }
    if (typeof beltSystemEnabled === "boolean") {
      data.beltSystemEnabled = beltSystemEnabled;
    }
    if (beltConfig !== undefined) {
      // beltConfig is stored as JSON string in the database
      data.beltConfig = typeof beltConfig === 'string' ? beltConfig : JSON.stringify(beltConfig);
    }
    if (gradingDates !== undefined) {
      // gradingDates is stored as JSON string in the database
      data.gradingDates = typeof gradingDates === 'string' ? gradingDates : JSON.stringify(gradingDates);
    }
    if (testNamingConvention !== undefined) {
      data.testNamingConvention = testNamingConvention;
    }
    if (curriculumDisclaimer !== undefined) {
      data.curriculumDisclaimer = curriculumDisclaimer || null;
    }
    if (promotionFeeCents !== undefined) {
      // Null / empty string clears the override (falls back to global default).
      data.promotionFeeCents =
        promotionFeeCents === null || promotionFeeCents === ""
          ? null
          : Number(promotionFeeCents);
    }
    if (typeof showProgressInPortal === "boolean") {
      data.showProgressInPortal = showProgressInPortal;
    }

    const style = await prisma.style.update({
      where: { id },
      data,
    });

    // Sync ranks from beltConfig to Rank table.
    //
    // Matching strategy: try beltConfig.ranks[].id first (this is the DB
    // Rank.id once the belt designer has hydrated it on load), then fall back
    // to name. Matching by name alone made rank renames look like "delete old
    // + create new" — which cascade-deletes the RankTest (categories + items),
    // wiping the curriculum every time someone fixed a typo in a rank name.
    if (beltConfig !== undefined) {
      const config = typeof beltConfig === 'string' ? JSON.parse(beltConfig) : beltConfig;

      if (config.ranks && Array.isArray(config.ranks)) {
        const existingRanks = await prisma.rank.findMany({
          where: { styleId: id },
        });

        const existingById = new Map(existingRanks.map((r) => [r.id, r]));
        const existingByName = new Map(existingRanks.map((r) => [r.name, r]));
        const matchedDbIds = new Set<string>();

        // Two-pass matcher.
        //
        // Pass 1 -- prefer id match (survives renames), fall back to
        //   name match (survives reorders on unmigrated configs).
        // Pass 2 -- for any incoming rank still unmatched, try to
        //   pair it with an EXISTING rank at the same `order`. This
        //   is the rename-in-place case: a beltConfig with a legacy
        //   ranks[].id (not a DB CUID) that just got renamed misses
        //   both the id and name lookup, and the old code would then
        //   create a new rank + delete the old one -- cascading
        //   through to RankTest and wiping the curriculum. Matching
        //   the leftover incoming rank to the same-order leftover
        //   existing rank keeps the RankTest attached to what is
        //   effectively "the same rank, just renamed".
        const pass1Result: Array<{ rank: any; existing: typeof existingRanks[number] | null }> = [];
        for (const rank of config.ranks) {
          const existing =
            (rank.id && existingById.get(rank.id)) ||
            existingByName.get(rank.name) ||
            null;
          if (existing) matchedDbIds.add(existing.id);
          pass1Result.push({ rank, existing });
        }
        // Pass 2: pair by order. Build a lookup of unmatched existing
        // ranks keyed by order so we don't accidentally reuse one that
        // was already matched by name/id.
        const unmatchedExistingByOrder = new Map<number, typeof existingRanks[number]>();
        for (const e of existingRanks) {
          if (!matchedDbIds.has(e.id)) unmatchedExistingByOrder.set(e.order, e);
        }
        for (const entry of pass1Result) {
          if (entry.existing) continue;
          const byOrder = unmatchedExistingByOrder.get(entry.rank.order);
          if (byOrder && !matchedDbIds.has(byOrder.id)) {
            entry.existing = byOrder;
            matchedDbIds.add(byOrder.id);
          }
        }

        // Update or create ranks
        for (const { rank, existing } of pass1Result) {
          // Calculate total class requirement from classRequirements array
          let totalClassRequirement = null;
          if (rank.classRequirements && Array.isArray(rank.classRequirements)) {
            const total = rank.classRequirements.reduce((sum: number, req: any) => {
              return sum + (req.minCount || 0);
            }, 0);
            if (total > 0) {
              totalClassRequirement = total;
            }
          }

          if (existing) {
            await prisma.rank.update({
              where: { id: existing.id },
              data: {
                name: rank.name,
                order: rank.order,
                classRequirement: totalClassRequirement,
              },
            });
            // Write the DB id back into beltConfig so future saves match
            // by id and survive renames cleanly.
            rank.id = existing.id;
          } else {
            const created = await prisma.rank.create({
              data: {
                styleId: id,
                name: rank.name,
                order: rank.order,
                classRequirement: totalClassRequirement,
                thumbnail: null,
              },
            });
            matchedDbIds.add(created.id);
            rank.id = created.id;
          }
        }

        // Delete only ranks that weren't matched (truly removed).
        // Cascades through to RankTest — fine, they're actually gone.
        for (const existing of existingRanks) {
          if (!matchedDbIds.has(existing.id)) {
            await prisma.rank.delete({
              where: { id: existing.id },
            });
          }
        }

        // Persist the rewritten beltConfig (with synced ids) back to Style so
        // the next load already has DB ids in place.
        await prisma.style.update({
          where: { id },
          data: { beltConfig: JSON.stringify(config) },
        });
      }
    }

    // Fetch updated style with ranks
    const updatedStyle = await prisma.style.findUnique({
      where: { id },
      include: {
        ranks: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({ style: updatedStyle });
  } catch (error) {
    console.error("Error updating style:", error);
    return new NextResponse("Failed to update style", { status: 500 });
  }
}


// DELETE /api/styles/:id
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const clientId = await getClientId(_req);
    // Verify tenant ownership before deleting. Previously the tenant
    // check was skipped AND the member sync below matched by style
    // name across ALL tenants -- so deleting our "Kempo" style also
    // stripped the primaryStyle / stylesNotes of every Kempo student
    // in every other gym on the platform.
    const style = await prisma.style.findUnique({
      where: { id },
      select: { name: true, clientId: true },
    });

    if (!style || style.clientId !== clientId) {
      return new NextResponse("Style not found", { status: 404 });
    }

    // Get all members WITHIN THIS TENANT who might have this style.
    const members = await prisma.member.findMany({
      where: {
        clientId,
        OR: [
          { primaryStyle: style.name },
          { stylesNotes: { contains: style.name } },
        ],
      },
    });

    // Update each member to remove the deleted style
    for (const member of members) {
      const updates: any = {};

      // Clear primaryStyle if it matches
      if (member.primaryStyle === style.name) {
        updates.primaryStyle = null;
      }

      // Remove from stylesNotes array if present
      if (member.stylesNotes) {
        try {
          const stylesArray = JSON.parse(member.stylesNotes);
          if (Array.isArray(stylesArray)) {
            const filteredStyles = stylesArray.filter(
              (s: any) => s.name !== style.name
            );
            updates.stylesNotes = JSON.stringify(filteredStyles);
          }
        } catch (err) {
          console.warn(`Failed to parse stylesNotes for member ${member.id}`);
        }
      }

      // Apply updates if there are any
      if (Object.keys(updates).length > 0) {
        await prisma.member.update({
          where: { id: member.id },
          data: updates,
        });
      }
    }

    // Finally, delete the style
    await prisma.style.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting style:", error);
    return new NextResponse("Failed to delete style", { status: 500 });
  }
}
