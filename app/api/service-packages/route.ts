import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLIENT_ID = "default-client";

// GET /api/service-packages
export async function GET() {
  try {
    const packages = await prisma.servicePackage.findMany({
      where: { clientId: DEFAULT_CLIENT_ID },
      include: {
        appointment: { select: { id: true, title: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ servicePackages: packages });
  } catch (error) {
    console.error("Error fetching service packages:", error);
    return new NextResponse("Failed to load appointments", { status: 500 });
  }
}

// POST /api/service-packages
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      description,
      appointmentId,
      sessionsIncluded,
      priceCents,
      expirationDays,
      isActive,
      availableOnline,
      sortOrder,
    } = body;

    if (!name || typeof name !== "string") {
      return new NextResponse("Name is required", { status: 400 });
    }
    if (typeof priceCents !== "number" || priceCents < 0) {
      return new NextResponse("Valid price is required", { status: 400 });
    }

    const pkg = await prisma.servicePackage.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        appointmentId: appointmentId || null,
        sessionsIncluded: sessionsIncluded || 1,
        priceCents,
        expirationDays: expirationDays || null,
        isActive: isActive !== false,
        availableOnline: availableOnline === true,
        sortOrder: sortOrder || 0,
        clientId: DEFAULT_CLIENT_ID,
      },
      include: {
        appointment: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (error) {
    console.error("Error creating service package:", error);
    return new NextResponse("Failed to create appointment", { status: 500 });
  }
}
