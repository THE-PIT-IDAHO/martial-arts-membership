import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = {
  params: {
    id: string;
  };
};

// GET /api/styles/:id
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = params;

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
  const { id } = params;

  try {
    const body = await req.json();
    const { name, shortName, description, beltSystemEnabled, beltConfig } = body;

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

    const style = await prisma.style.update({
      where: { id },
      data,
    });

    // Sync ranks from beltConfig to Rank table
    if (beltConfig !== undefined) {
      const config = typeof beltConfig === 'string' ? JSON.parse(beltConfig) : beltConfig;

      if (config.ranks && Array.isArray(config.ranks)) {
        // Delete existing ranks for this style
        await prisma.rank.deleteMany({
          where: { styleId: id },
        });

        // Create new ranks from beltConfig
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

          await prisma.rank.create({
            data: {
              styleId: id,
              name: rank.name,
              order: rank.order,
              classRequirement: totalClassRequirement,
              thumbnail: null, // TODO: Generate thumbnail from rank.layers
            },
          });
        }
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
  const { id } = params;

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
