import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// Sync rank documents from beltConfig to all members who have ranks in this style
async function syncRankDocumentsToMembers(
  styleId: string,
  styleName: string,
  ranks: Array<{ name: string; order: number; pdfDocuments?: RankDocument[] }>
) {
  try {
    // Find all members who have this style in their stylesNotes
    const members = await prisma.member.findMany({
      where: {
        OR: [
          { primaryStyle: styleName },
          { stylesNotes: { contains: styleName } },
        ],
      },
    });

    for (const member of members) {
      // Parse the member's styles to find their rank in this style
      let memberRankInStyle: string | null = null;

      // Check stylesNotes first (more detailed)
      if (member.stylesNotes) {
        try {
          const stylesArray = JSON.parse(member.stylesNotes);
          if (Array.isArray(stylesArray)) {
            const styleEntry = stylesArray.find((s: any) => s.name === styleName);
            if (styleEntry?.rank) {
              memberRankInStyle = styleEntry.rank;
            }
          }
        } catch {}
      }

      // Fallback to primary style rank
      if (!memberRankInStyle && member.primaryStyle === styleName && member.rank) {
        memberRankInStyle = member.rank;
      }

      if (!memberRankInStyle) continue;

      // Find the member's rank order
      const memberRank = ranks.find(r => r.name === memberRankInStyle);
      if (!memberRank) continue;
      const memberRankOrder = memberRank.order;

      // Get all ranks up to and including the member's current rank
      const ranksToInclude = ranks.filter(r => r.order <= memberRankOrder);

      // Build the list of documents that should be in the member's styleDocuments
      const rankDocuments: StyleDocument[] = [];
      for (const rank of ranksToInclude) {
        if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

        for (const doc of rank.pdfDocuments) {
          rankDocuments.push({
            id: `rank-${rank.name}-${doc.id}`,
            name: doc.name,
            url: doc.url,
            uploadedAt: new Date().toISOString(),
            fromRank: rank.name,
          });
        }
      }

      // Parse existing style documents
      let existingDocs: StyleDocument[] = [];
      if (member.styleDocuments) {
        try {
          existingDocs = JSON.parse(member.styleDocuments);
        } catch {}
      }

      // Collect names of all new rank documents for name-based dedup
      const newRankDocNames = new Set(rankDocuments.map(d => d.name));

      // Remove old rank-sourced documents (fromRank, rank- prefix, OR same name as incoming docs)
      const nonRankDocs = existingDocs.filter(doc =>
        !doc.fromRank && !doc.id.startsWith('rank-') && !newRankDocNames.has(doc.name)
      );

      // Combine non-rank documents with new rank documents
      const updatedDocs = [...nonRankDocs, ...rankDocuments];

      // Update the member
      await prisma.member.update({
        where: { id: member.id },
        data: {
          styleDocuments: JSON.stringify(updatedDocs),
        },
      });
    }
  } catch (err) {
    console.error("Error syncing rank documents to members:", err);
    // Don't throw - this is a supplementary feature
  }
}

// GET /api/styles/:id
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const style = await prisma.style.findUnique({
      where: { id },
      include: {
        ranks: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!style) {
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
    const body = await req.json();
    const { name, shortName, description, beltSystemEnabled, beltConfig, gradingDates, testNamingConvention } = body;

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

    const style = await prisma.style.update({
      where: { id },
      data,
    });

    // Sync ranks from beltConfig to Rank table (preserving existing rank IDs to keep RankTest references intact)
    if (beltConfig !== undefined) {
      const config = typeof beltConfig === 'string' ? JSON.parse(beltConfig) : beltConfig;

      if (config.ranks && Array.isArray(config.ranks)) {
        // Get existing ranks for this style
        const existingRanks = await prisma.rank.findMany({
          where: { styleId: id },
        });

        const existingByName = new Map(existingRanks.map(r => [r.name, r]));
        const newRankNames = new Set(config.ranks.map((r: any) => r.name as string));

        // Update or create ranks
        for (const rank of config.ranks) {
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

          const existing = existingByName.get(rank.name);
          if (existing) {
            // Update existing rank (preserves ID and all related RankTest records)
            await prisma.rank.update({
              where: { id: existing.id },
              data: {
                order: rank.order,
                classRequirement: totalClassRequirement,
              },
            });
          } else {
            // Create new rank
            await prisma.rank.create({
              data: {
                styleId: id,
                name: rank.name,
                order: rank.order,
                classRequirement: totalClassRequirement,
                thumbnail: null,
              },
            });
          }
        }

        // Delete ranks that are no longer in the beltConfig (these will cascade-delete their RankTests)
        for (const existing of existingRanks) {
          if (!newRankNames.has(existing.name)) {
            await prisma.rank.delete({
              where: { id: existing.id },
            });
          }
        }

        // Sync rank documents to members who have this style
        await syncRankDocumentsToMembers(id, style.name, config.ranks);
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
    // First, get the style name before deleting
    const style = await prisma.style.findUnique({
      where: { id },
      select: { name: true },
    });

    if (!style) {
      return new NextResponse("Style not found", { status: 404 });
    }

    // Get all members who might have this style
    const members = await prisma.member.findMany({
      where: {
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
