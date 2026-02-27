import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

// GET /api/classes/:id
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const classSession = await prisma.classSession.findUnique({
      where: { id },
      include: {
        program: true,
        attendances: {
          include: {
            member: true,
          },
        },
      },
    });

    if (!classSession) {
      return NextResponse.json(
        { error: "Class not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ class: classSession });
  } catch (err) {
    console.error(`GET /api/classes/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to load class" },
      { status: 500 }
    );
  }
}

// PATCH /api/classes/:id
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;

  try {
    const body = await req.json().catch(() => ({}));

    const {
      name,
      startsAt,
      endsAt,
      classType,
      classTypes,
      styleIds,
      styleNames,
      styleId,
      styleName,
      minRankId,
      minRankName,
      programId,
      color,
      excludedDates,
      coachId,
      coachName,
      maxCapacity,
      bookingEnabled,
      bookingCutoffMins,
      bookingAdvanceDays,
      kioskEnabled,
      locationId,
      spaceId,
    } = body || {};

    // If classType is being changed, get the old value first
    let oldClassType: string | null = null;
    if (classType !== undefined) {
      const existingClass = await prisma.classSession.findUnique({
        where: { id },
        select: { classType: true },
      });
      oldClassType = existingClass?.classType || null;
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (startsAt !== undefined) updateData.startsAt = new Date(startsAt);
    if (endsAt !== undefined) updateData.endsAt = new Date(endsAt);
    if (classType !== undefined) updateData.classType = classType;
    if (classTypes !== undefined) updateData.classTypes = classTypes;
    if (styleIds !== undefined) updateData.styleIds = styleIds;
    if (styleNames !== undefined) updateData.styleNames = styleNames;
    if (styleId !== undefined) updateData.styleId = styleId;
    if (styleName !== undefined) updateData.styleName = styleName;
    if (minRankId !== undefined) updateData.minRankId = minRankId;
    if (minRankName !== undefined) updateData.minRankName = minRankName;
    if (programId !== undefined) updateData.programId = programId;
    if (color !== undefined) updateData.color = color;
    if (excludedDates !== undefined) updateData.excludedDates = excludedDates;
    if (coachId !== undefined) updateData.coachId = coachId;
    if (coachName !== undefined) updateData.coachName = coachName;
    if (maxCapacity !== undefined) updateData.maxCapacity = maxCapacity != null ? parseInt(maxCapacity) || null : null;
    if (bookingEnabled !== undefined) updateData.bookingEnabled = bookingEnabled;
    if (bookingCutoffMins !== undefined) updateData.bookingCutoffMins = bookingCutoffMins != null ? parseInt(bookingCutoffMins) || null : null;
    if (bookingAdvanceDays !== undefined) updateData.bookingAdvanceDays = bookingAdvanceDays != null ? parseInt(bookingAdvanceDays) || null : null;
    if (locationId !== undefined) updateData.locationId = locationId || null;
    if (spaceId !== undefined) updateData.spaceId = spaceId || null;
    if (kioskEnabled !== undefined) updateData.kioskEnabled = kioskEnabled;

    const classSession = await prisma.classSession.update({
      where: { id },
      data: updateData,
      include: {
        program: true,
      },
    });

    // If classType was changed, update all styles' beltConfig that reference the old class type
    const newClassType = classType?.trim() || null;
    if (oldClassType && newClassType && oldClassType !== newClassType) {
      // Find all styles with beltConfig that might contain classRequirements
      const styles = await prisma.style.findMany({
        where: {
          beltConfig: {
            not: null,
          },
        },
        select: {
          id: true,
          beltConfig: true,
        },
      });

      for (const style of styles) {
        try {
          let config: any = null;
          if (typeof style.beltConfig === "string") {
            config = JSON.parse(style.beltConfig);
          } else if (style.beltConfig && typeof style.beltConfig === "object") {
            config = style.beltConfig;
          }

          if (!config || !config.ranks || !Array.isArray(config.ranks)) continue;

          let hasChanges = false;
          const updatedRanks = config.ranks.map((rank: any) => {
            if (!rank.classRequirements || !Array.isArray(rank.classRequirements)) {
              return rank;
            }
            const updatedReqs = rank.classRequirements.map((req: any) => {
              if (req.label === oldClassType) {
                hasChanges = true;
                return { ...req, label: newClassType };
              }
              return req;
            });
            return { ...rank, classRequirements: updatedReqs };
          });

          if (hasChanges) {
            const updatedConfig = { ...config, ranks: updatedRanks };
            await prisma.style.update({
              where: { id: style.id },
              data: {
                beltConfig: JSON.stringify(updatedConfig),
              },
            });
          }
        } catch (e) {
          console.error(`Error updating beltConfig for style ${style.id}:`, e);
        }
      }
    }

    return NextResponse.json({ class: classSession });
  } catch (err) {
    console.error(`PATCH /api/classes/${id} error:`, err);
    return NextResponse.json(
      { error: "Failed to update class" },
      { status: 500 }
    );
  }
}

// DELETE /api/classes/:id
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;

  try {
    await prisma.classSession.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`DELETE /api/classes/${id} error:`, err);

    // If record doesn't exist, return 404
    if (err.code === 'P2025') {
      return NextResponse.json(
        { error: "Class not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete class" },
      { status: 500 }
    );
  }
}
