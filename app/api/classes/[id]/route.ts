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
      styleIds,
      styleNames,
      styleId,
      styleName,
      minRankId,
      minRankName,
      programId,
      color,
      excludedDates,
    } = body || {};

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (startsAt !== undefined) updateData.startsAt = new Date(startsAt);
    if (endsAt !== undefined) updateData.endsAt = new Date(endsAt);
    if (classType !== undefined) updateData.classType = classType;
    if (styleIds !== undefined) updateData.styleIds = styleIds;
    if (styleNames !== undefined) updateData.styleNames = styleNames;
    if (styleId !== undefined) updateData.styleId = styleId;
    if (styleName !== undefined) updateData.styleName = styleName;
    if (minRankId !== undefined) updateData.minRankId = minRankId;
    if (minRankName !== undefined) updateData.minRankName = minRankName;
    if (programId !== undefined) updateData.programId = programId;
    if (color !== undefined) updateData.color = color;
    if (excludedDates !== undefined) updateData.excludedDates = excludedDates;

    const classSession = await prisma.classSession.update({
      where: { id },
      data: updateData,
      include: {
        program: true,
      },
    });

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
