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

// PATCH /api/styles/:id
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
      const stringified = typeof beltConfig === 'string'
        ? beltConfig
        : JSON.stringify(beltConfig);
      console.log('Saving beltConfig:', stringified.substring(0, 200));
      data.beltConfig = stringified;
    }

    const style = await prisma.style.update({
      where: { id },
      data,
    });

    return NextResponse.json({ style });
  } catch (error) {
    console.error("Error updating style:", error);
    return new NextResponse("Failed to update style", { status: 500 });
  }
}


// DELETE /api/styles/:id
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = params;

  try {
    await prisma.style.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting style:", error);
    return new NextResponse("Failed to delete style", { status: 500 });
  }
}
