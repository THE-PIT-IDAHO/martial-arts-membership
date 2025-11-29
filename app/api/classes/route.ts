import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/classes
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const getTypes = searchParams.get("types");

    // If types=true, return unique class types
    if (getTypes === "true") {
      const classes = await prisma.classSession.findMany({
        where: {
          classType: {
            not: null,
          },
        },
        select: {
          classType: true,
        },
        distinct: ["classType"],
      });

      const classTypes = classes
        .map((c) => c.classType)
        .filter((type): type is string => type !== null)
        .sort();

      return NextResponse.json({ classTypes });
    }

    // Otherwise, return all classes
    const classes = await prisma.classSession.findMany({
      include: {
        program: true,
      },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ classes });
  } catch (error) {
    console.error("Error fetching classes:", error);
    return new NextResponse("Failed to load classes", { status: 500 });
  }
}

// POST /api/classes
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, startsAt, endsAt, classType, styleIds, styleNames, styleId, styleName, minRankId, minRankName, programId, clientId, isRecurring, frequencyNumber, frequencyUnit, scheduleStartDate, scheduleEndDate, isOngoing, color } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!startsAt || !endsAt) {
      return new NextResponse("Start and end times are required", { status: 400 });
    }

    // Use the existing client ID (you'll want to get this from session/auth later)
    const defaultClientId = clientId || "cmii78uxm0000twe60c5dgycd";

    const classSession = await prisma.classSession.create({
      data: {
        name: name.trim(),
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        classType: classType?.trim() || null,
        styleIds: styleIds || null,
        styleNames: styleNames || null,
        styleId: styleId || null,
        styleName: styleName || null,
        minRankId: minRankId || null,
        minRankName: minRankName || null,
        programId: programId || null,
        clientId: clientId || defaultClientId,
        isRecurring: isRecurring || false,
        frequencyNumber: frequencyNumber || null,
        frequencyUnit: frequencyUnit || null,
        scheduleStartDate: scheduleStartDate ? new Date(scheduleStartDate) : null,
        scheduleEndDate: scheduleEndDate ? new Date(scheduleEndDate) : null,
        isOngoing: isOngoing !== undefined ? isOngoing : true,
        color: color || "#a3a3a3",
      },
      include: {
        program: true,
      },
    });

    return NextResponse.json({ class: classSession }, { status: 201 });
  } catch (error) {
    console.error("Error creating class:", error);
    return new NextResponse("Failed to create class", { status: 500 });
  }
}
